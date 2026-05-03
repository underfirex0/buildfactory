import { NextRequest, NextResponse } from "next/server";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const APIFY_API = "https://api.apify.com/v2";

export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const { niche, city, maxResults = 20, websiteFilter = "all" } = await req.json();
    if (!niche || !city) return NextResponse.json({ error: "niche and city required" }, { status: 400 });

    console.log(`[Scraper] ${niche} in ${city}, max ${maxResults}, filter: ${websiteFilter}`);

    // STEP 1: Scrape Google Maps
    const mapsResults = await scrapeGoogleMaps(niche, city, maxResults);
    console.log(`[Scraper] Maps: ${mapsResults.length} results`);

    // STEP 2: Enrich each business with social media from Google Search
    // Skip Google Search for now — use only Maps data to save credits
const enriched = mapsResults.slice(0, maxResults);

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
        with_phone: enriched.filter((b: any) => b.phone).length,
        with_social: enriched.filter((b: any) => b.instagram || b.facebook || b.tiktok).length,
      }
    });

  } catch (e: any) {
    console.error("[Scraper] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function scrapeGoogleMaps(niche: string, city: string, maxResults: number): Promise<any[]> {
  const runRes = await fetch(
    `${APIFY_API}/acts/compass~crawler-google-places/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [`${niche} à ${city} Maroc`],
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
  return await waitForResults(runId, 70000);
}

async function findSocialMedia(businessName: string, city: string): Promise<any> {
  try {
    const runRes = await fetch(
      `${APIFY_API}/acts/apify~google-search-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: `"${businessName}" ${city} instagram OR facebook OR tiktok OR linkedin`,
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
    const results = await waitForResults(runId, 25000);
    const social: any = {};
    for (const result of results) {
      for (const item of (result.organicResults || [])) {
        const url = item.url || "";
        if (url.includes("instagram.com") && !social.instagram) social.instagram = url;
        if (url.includes("facebook.com") && !social.facebook) social.facebook = url;
        if (url.includes("tiktok.com") && !social.tiktok) social.tiktok = url;
        if (url.includes("linkedin.com") && !social.linkedin) social.linkedin = url;
        if (url.includes("youtube.com") && !social.youtube) social.youtube = url;
      }
    }
    return social;
  } catch { return {}; }
}

async function waitForResults(runId: string, maxWait = 70000): Promise<any[]> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 4000));
    const statusRes = await fetch(`${APIFY_API}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const statusData = await statusRes.json();
    const status = statusData.data?.status;
    if (status === "SUCCEEDED") {
      const datasetId = statusData.data?.defaultDatasetId;
      const res = await fetch(`${APIFY_API}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=100`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
    if (status === "FAILED" || status === "ABORTED") throw new Error(`Run ${status}`);
  }
  throw new Error("Timeout");
}

function parseBusinessData(raw: any): any {
  const photos: string[] = [];
// Try imageUrls array first (main field)
if (raw.imageUrls?.length) {
  raw.imageUrls.slice(0, 8).forEach((url: string) => {
    if (url?.startsWith("http")) photos.push(url);
  });
}
// Fallback to imageUrl single field
if (photos.length === 0 && raw.imageUrl) {
  photos.push(raw.imageUrl);
}
// Also get photos from reviews
if (raw.reviews?.length) {
  raw.reviews.forEach((r: any) => {
    r.reviewImageUrls?.forEach((url: string) => {
      if (url?.startsWith("http") && photos.length < 12) photos.push(url);
    });
  });
}
  const reviews: any[] = [];
  if (raw.reviews?.length) {
    raw.reviews.slice(0, 5).forEach((r: any) => {
      if (r.text?.length > 10) reviews.push({
        author: r.name || "Client",
        rating: r.stars || 5,
        text: r.textTranslated || r.text,
        time: r.publishAt || "",
        avatar: r.reviewerPhotoUrl || "",
      });
    });
  }
  const opening_hours: any[] = [];
  if (raw.openingHours?.length) {
    raw.openingHours.forEach((h: any) => opening_hours.push({ day: h.day || "", hours: h.hours || "Fermé" }));
  }
  const services: string[] = [];
  if (raw.categories?.length) raw.categories.slice(0, 8).forEach((c: string) => services.push(c));
// Extract services from additionalInfo
if (raw.additionalInfo) {
  Object.entries(raw.additionalInfo).forEach(([section, items]: [string, any]) => {
    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        Object.entries(item).forEach(([key, val]) => {
          if (val === true && services.length < 15) services.push(key);
        });
      });
    }
  });
}
// Add review tags as services too
if (raw.reviewsTags?.length) {
  raw.reviewsTags.slice(0, 5).forEach((t: any) => {
    if (t.title && services.length < 15) services.push(t.title);
  });
}

  let instagram = raw.instagram || "";
  let facebook = raw.facebook || "";
  let tiktok = raw.tiktok || "";
  let linkedin = raw.linkedin || "";
  let youtube = raw.youtube || "";

  if (raw.socialProfiles?.length) {
    raw.socialProfiles.forEach((p: any) => {
      if (p.url?.includes("instagram")) instagram = p.url;
      if (p.url?.includes("facebook")) facebook = p.url;
      if (p.url?.includes("tiktok")) tiktok = p.url;
      if (p.url?.includes("linkedin")) linkedin = p.url;
      if (p.url?.includes("youtube")) youtube = p.url;
    });
  }

  const address = raw.address || raw.street || "";
  const sources = ["Google Maps"];
  if (instagram || facebook || tiktok || linkedin) sources.push("Social");
  if (raw.website) sources.push("Website");

  return {
    name: raw.title || raw.name || "",
    category: raw.categoryName || raw.categories?.[0] || "other",
    address,
    city: raw.city || extractCity(address),
    phone: raw.phone || raw.phoneUnformatted || "",
    email: raw.email || "",
    website: raw.website || "",
    description: raw.description || raw.editorialSummary || "",
    google_rating: raw.totalScore || raw.rating || 0,
    review_count: raw.reviewsCount || raw.userRatingsTotal || 0,
    google_maps_url: raw.url || raw.googleMapsUrl || "",
    place_id: raw.placeId || "",
    photos, reviews, opening_hours, services,
    instagram, facebook, tiktok, linkedin, youtube,
    sources,
  };
}

function extractCity(address: string): string {
  const cities = ["Casablanca","Rabat","Marrakech","Fès","Tanger","Agadir","Meknès","Oujda","Kenitra","Tétouan","Settat","El Jadida","Mohammedia","Béni Mellal","Nador","Khouribga","Safi"];
  for (const c of cities) if (address.toLowerCase().includes(c.toLowerCase())) return c;
  return address.split(",").pop()?.trim() || "";
}
