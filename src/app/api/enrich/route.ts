import { NextRequest, NextResponse } from "next/server";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const APIFY_API = "https://api.apify.com/v2";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { businessName, city } = await req.json();
    if (!businessName) return NextResponse.json({ error: "businessName required" }, { status: 400 });

    console.log(`[Socials] Finding socials for: ${businessName} in ${city}`);

    // Run Google Search to find social profiles
    const query = `"${businessName}" ${city} site:instagram.com OR site:facebook.com OR site:tiktok.com OR site:linkedin.com OR site:youtube.com`;

    const runRes = await fetch(
      `${APIFY_API}/acts/apify~google-search-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: query,
          maxPagesPerQuery: 1,
          resultsPerPage: 10,
          languageCode: "fr",
          countryCode: "MA",
        }),
      }
    );

    if (!runRes.ok) {
      const err = await runRes.text();
      return NextResponse.json({ error: "Failed to start search: " + err }, { status: 500 });
    }

    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) return NextResponse.json({ error: "No run ID" }, { status: 500 });

    // Poll for results — 45 seconds max
    const start = Date.now();
    while (Date.now() - start < 45000) {
      await new Promise(r => setTimeout(r, 3000));

      const statusRes = await fetch(`${APIFY_API}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
      const statusData = await statusRes.json();
      const status = statusData.data?.status;

      console.log(`[Socials] Status: ${status}`);

      if (status === "SUCCEEDED") {
        const datasetId = statusData.data?.defaultDatasetId;
        const res = await fetch(`${APIFY_API}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=20`);
        const data = await res.json();
        const results = Array.isArray(data) ? data : [];

        // Extract social links
        const social: any = {
          instagram: "",
          facebook: "",
          tiktok: "",
          linkedin: "",
          youtube: "",
        };

        for (const result of results) {
          for (const item of (result.organicResults || [])) {
            const url = item.url || "";
            const urlLower = url.toLowerCase();
            if (urlLower.includes("instagram.com") && !social.instagram) {
              // Make sure it's a profile not a post
              if (!urlLower.includes("/p/") && !urlLower.includes("/reel/")) {
                social.instagram = url;
              }
            }
            if (urlLower.includes("facebook.com") && !social.facebook) {
              if (!urlLower.includes("/posts/") && !urlLower.includes("/photos/")) {
                social.facebook = url;
              }
            }
            if (urlLower.includes("tiktok.com") && !social.tiktok) {
              social.tiktok = url;
            }
            if (urlLower.includes("linkedin.com") && !social.linkedin) {
              social.linkedin = url;
            }
            if (urlLower.includes("youtube.com") && !social.youtube) {
              if (!urlLower.includes("/watch?")) {
                social.youtube = url;
              }
            }
          }
        }

        console.log(`[Socials] Found: IG=${!!social.instagram} FB=${!!social.facebook} TT=${!!social.tiktok}`);
        return NextResponse.json({ success: true, social });
      }

      if (status === "FAILED" || status === "ABORTED") {
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Search timed out" }, { status: 408 });

  } catch (e: any) {
    console.error("[Socials] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
