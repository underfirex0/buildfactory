import { NextRequest, NextResponse } from "next/server";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const APIFY_API = "https://api.apify.com/v2";

export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const { niche, city, maxResults = 10, websiteFilter = "all" } = await req.json();
    if (!niche || !city) return NextResponse.json({ error: "niche and city required" }, { status: 400 });

    console.log(`[Scraper] ${niche} in ${city}, max ${maxResults}, filter: ${websiteFilter}`);

    // STEP 1: Scrape Google Maps
    const mapsResults = await scrapeGoogleMaps(niche, city, maxResults);
    console.log(`[Scraper] Maps: ${mapsResults.length} results`);

    // STEP 2: For each business, run Google Search to find socials
    // Run sequentially to avoid timeout, max 5 businesses enriched with social
    const enriched = [];
    for (let i = 0; i < mapsResults.length; i++) {
      const biz = mapsResults[i];
      const name = biz.title || biz.name || "";
      const bizCity = biz.city || city;

      // Only run Google Search for first 5 to save credits + avoid timeout
      if (i < 5 && name) {
        try {
          console.log(`[Scraper] Finding socials for: ${name}`);
          const social = await findSocialMediaFast(name, bizCity);
          enriched.push({ ...biz, ...social });
        } catch {
          enriched.push(biz);
        }
      } else {
        enriched.push(biz);
      }
    }

    // STEP 3: Apply website filter
    let filtered = enriched;
    if (websiteFilter === "no_website") {
      filtered = enriched.filter((b: any) => !b.website);
    } else if (websiteFilter === "has_website") {
      filtered = enriched.filter((b: any) => !!b.website);
    }

    const businesses = filtered.map(parseBusinessData).filter((b: any) => b.name);

    return NextResponse.json({
      success: true,
      results: businesses,
      total: businesses.length,
      stats: {
        total_found: enriched.length,
        with_website: enriched.filter((b: any) => b.website).length,
        without_website: enriched.filter((b: any) => !b.website).length,
        with_phone: enriched.filter((b: any) => b.phone || b.phoneUnformatted).length,
        with_social: enriched.filter((b: any) => b._instagram || b._facebook || b._tiktok).length,
      }
    });

  } catch (e: any) {
    console.error("[Scraper] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── Google Maps ──────────────────────────────────────────────────────────────
async function scrapeGoogleMaps(niche: string, city: string, maxResults: number): Promise<any[]> {
  const runRes = await fetch(
    `${APIFY_API}/acts/compass~crawler-google-places/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [`${niche} ${city} Morocco`],
        maxCrawledPlacesPerSearch: maxResults,
        language: "fr",
        includeReviews: true,
        maxReviews: 5,
        includeImages: true,
        maxImages: 8,
        reviewsSort: "newest",
      }),
    }
  );
  if (!runRes.ok) throw new Error("Failed to start Maps scraper");
  const runData = await runRes.json();
  const runId = runData.data?.id;
  if (!runId) throw new Error("No run ID");
  return await waitForResults(runId, 65000);
}

// ─── Google Search for socials (fast, single query) ──────────────────────────
async function findSocialMediaFast(businessName: string, city: string): Promise<any> {
  const query = `"${businessName}" ${city} site:instagram.com OR site:facebook.com OR site:tiktok.com OR site:linkedin.com`;

  const runRes = await fetch(
    `${APIFY_API}/acts/apify~google-search-scraper/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: query,
        maxPagesPerQuery: 1,
        resultsPerPage: 5,
        languageCode: "fr",
        countryCode: "MA",
      }),
    }
  );
  if (!runRes.ok) return {};

  const runData = await runRes.json();
  const runId = runData.data?.id;
  if (!runId) return {};

  // Short timeout for social search — 20 seconds max
  const results = await waitForResults(runId, 20000);
  const social: any = {};

  for (const result of results) {
    for (const item of (result.organicResults || [])) {
      const url = (item.url || "").toLowerCase();
      if (url.includes("instagram.com") && !social._instagram) social._instagram = item.url;
      if (url.includes("facebook.com") && !social._facebook) social._facebook = item.url;
      if (url.includes("tiktok.com") && !social._tiktok) social._tiktok = item.url;
      if (url.includes("linkedin.com") && !social._linkedin) social._linkedin = item.url;
      if (url.includes("youtube.com") && !social._youtube) social._youtube = item.url;
    }
  }

  console.log(`[Social] ${businessName}: IG=${!!social._instagram} FB=${!!social._facebook} TT=${!!social._tiktok}`);
  return social;
}

// ─── Poll for results ─────────────────────────────────────────────────────────
async function waitForResults(runId: string, maxWait = 65000): Promise<any[]> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(`${APIFY_API}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const statusData = await statusRes.json();
    const status = statusData.data?.status;
    if (status === "SUCCEEDED") {
      const datasetId = statusData.data?.defaultDatasetId;
      const res = await fetch(`${APIFY_API}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=100`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
    if (status === "FAILED" || status === "ABORTED") return [];
  }
  return []; // Return empty instead of throwing on timeout
}

// ─── Parse business data ──────────────────────────────────────────────────────
function parseBusinessData(raw: any): any {
  // Photos from imageUrls array
  const photos: string[] = [];
  if (raw.imageUrls?.length) {
    raw.imageUrls.slice(0, 8).forEach((url: string) => {
      if (url?.startsWith("http")) photos.push(url);
    });
  }
  if (photos.length === 0 && raw.imageUrl) photos.push(raw.imageUrl);
  // Add review photos
  if (raw.reviews?.length) {
    raw.reviews.forEach((r: any) => {
      r.reviewImageUrls?.forEach((url: string) => {
        if (url?.startsWith("http") && photos.length < 12) photos.push(url);
      });
    });
  }

  // Reviews
  const reviews: any[] = [];
  if (raw.reviews?.length) {
    raw.reviews.slice(0, 5).forEach((r: any) => {
      const text = r.textTranslated || r.text;
      if (text?.length > 10) {
        reviews.push({
          author: r.name || "Client",
          rating: r.stars || 5,
          text,
          time: r.publishAt || "",
          avatar: r.reviewerPhotoUrl || "",
        });
      }
    });
  }

  // Opening hours
  const opening_hours: any[] = [];
  if (raw.openingHours?.length) {
    raw.openingHours.forEach((h: any) => {
      opening_hours.push({ day: h.day || "", hours: h.hours || "Fermé" });
    });
  }

  // Services from categories + additionalInfo + reviewsTags
  const services: string[] = [];
  if (raw.categories?.length) raw.categories.slice(0, 6).forEach((c: string) => services.push(c));
  if (raw.additionalInfo) {
    Object.entries(raw.additionalInfo).forEach(([, items]: [string, any]) => {
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          Object.entries(item).forEach(([key, val]) => {
            if (val === true && services.length < 15) services.push(key);
          });
        });
      }
    });
  }
  if (raw.reviewsTags?.length) {
    raw.reviewsTags.slice(0, 5).forEach((t: any) => {
      if (t.title && services.length < 15) services.push(t.title);
    });
  }

  // Social — from Maps socialProfiles OR from Google Search (_instagram etc)
  let instagram = raw._instagram || "";
  let facebook = raw._facebook || "";
  let tiktok = raw._tiktok || "";
  let linkedin = raw._linkedin || "";
  let youtube = raw._youtube || "";

  if (raw.socialProfiles?.length) {
    raw.socialProfiles.forEach((p: any) => {
      const url = p.url || "";
      if (url.includes("instagram") && !instagram) instagram = url;
      if (url.includes("facebook") && !facebook) facebook = url;
      if (url.includes("tiktok") && !tiktok) tiktok = url;
      if (url.includes("linkedin") && !linkedin) linkedin = url;
      if (url.includes("youtube") && !youtube) youtube = url;
    });
  }

  const address = raw.address || raw.street || "";
  const sources = ["Google Maps"];
  if (instagram || facebook || tiktok || linkedin) sources.push("Social Media");
  if (raw.website) sources.push("Website");

  return {
    name: raw.title || raw.name || "",
    category: raw.categoryName || raw.categories?.[0] || "other",
    address,
    city: raw.city || extractCity(address),
    phone: raw.phoneUnformatted || raw.phone || "",
    email: raw.email || "",
    website: raw.website || "",
    description: raw.description || raw.editorialSummary || "",
    google_rating: raw.totalScore || 0,
    review_count: raw.reviewsCount || 0,
    google_maps_url: raw.url || "",
    place_id: raw.placeId || "",
    photos,
    reviews,
    opening_hours,
    services,
    instagram,
    facebook,
    tiktok,
    linkedin,
    youtube,
    sources,
    // Extra data
    popular_times: raw.popularTimesHistogram || null,
    neighborhood: raw.neighborhood || "",
    images_count: raw.imagesCount || 0,
  };
}

function extractCity(address: string): string {
  const cities = ["Casablanca","Rabat","Marrakech","Fès","Tanger","Agadir","Meknès","Oujda","Kenitra","Tétouan","Settat","El Jadida","Mohammedia","Béni Mellal","Nador","Khouribga","Safi"];
  for (const c of cities) if (address.toLowerCase().includes(c.toLowerCase())) return c;
  return address.split(",").pop()?.trim() || "";
}
