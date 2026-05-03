import { NextRequest, NextResponse } from "next/server";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const APIFY_API = "https://api.apify.com/v2";

export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const { niche, city, maxResults = 20 } = await req.json();
    if (!niche || !city) return NextResponse.json({ error: "niche and city required" }, { status: 400 });

    console.log(`[Scraper] Searching: ${niche} in ${city}, max ${maxResults}`);

    // Build search query
    const searchQuery = `${niche} ${city} Maroc`;

    // Start Apify Google Maps scraper
    const runRes = await fetch(
      `${APIFY_API}/acts/compass~crawler-google-places/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchStringsArray: [searchQuery],
          maxCrawledPlacesPerSearch: maxResults,
          language: "fr",
          includeReviews: true,
          maxReviews: 5,
          includeImages: true,
          maxImages: 8,
          reviewsSort: "newest",
          scrapeDirectories: false,
          deeperCityScrape: false,
        }),
      }
    );

    if (!runRes.ok) {
      const err = await runRes.text();
      console.error("[Scraper] Start error:", err);
      return NextResponse.json({ error: "Failed to start scraper: " + err }, { status: 500 });
    }

    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) return NextResponse.json({ error: "No run ID returned" }, { status: 500 });

    console.log(`[Scraper] Run started: ${runId}`);

    // Poll for results
    const results = await waitForResults(runId);
    console.log(`[Scraper] Got ${results.length} results`);

    // Parse all businesses
    const businesses = results.map(parseBusinessData).filter(b => b.name);

    return NextResponse.json({ success: true, results: businesses, total: businesses.length });

  } catch (e: any) {
    console.error("[Scraper] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function waitForResults(runId: string, maxWait = 80000): Promise<any[]> {
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 4000));

    const statusRes = await fetch(`${APIFY_API}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const statusData = await statusRes.json();
    const status = statusData.data?.status;

    console.log(`[Scraper] Status: ${status}`);

    if (status === "SUCCEEDED") {
      const datasetId = statusData.data?.defaultDatasetId;
      const resultsRes = await fetch(
        `${APIFY_API}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=100`
      );
      const data = await resultsRes.json();
      return Array.isArray(data) ? data : [];
    }

    if (status === "FAILED" || status === "ABORTED") {
      throw new Error(`Apify run ${status}`);
    }
  }

  throw new Error("Scraper timed out after 80 seconds");
}

function parseBusinessData(raw: any): any {
  // Photos
  const photos: string[] = [];
  if (raw.images && Array.isArray(raw.images)) {
    raw.images.slice(0, 8).forEach((img: any) => {
      const url = img.imageUrl || img.url || (typeof img === "string" ? img : null);
      if (url && url.startsWith("http")) photos.push(url);
    });
  }

  // Reviews
  const reviews: any[] = [];
  if (raw.reviews && Array.isArray(raw.reviews)) {
    raw.reviews.slice(0, 5).forEach((r: any) => {
      if (r.text && r.text.length > 10) {
        reviews.push({
          author: r.name || r.publisherName || "Client",
          rating: r.stars || r.rating || 5,
          text: r.text,
          time: r.publishedAtDate || "",
          avatar: r.reviewerPhotoUrl || "",
        });
      }
    });
  }

  // Opening hours
  const opening_hours: any[] = [];
  if (raw.openingHours && Array.isArray(raw.openingHours)) {
    raw.openingHours.forEach((h: any) => {
      opening_hours.push({ day: h.day || "", hours: h.hours || "Fermé" });
    });
  }

  // Services
  const services: string[] = [];
  if (raw.categories && Array.isArray(raw.categories)) {
    raw.categories.slice(0, 8).forEach((c: string) => services.push(c));
  }

  // Social media
  let instagram = "";
  let facebook = "";
  if (raw.socialProfiles && Array.isArray(raw.socialProfiles)) {
    raw.socialProfiles.forEach((p: any) => {
      if (p.url?.includes("instagram")) instagram = p.url;
      if (p.url?.includes("facebook")) facebook = p.url;
    });
  }

  // Extract city
  const address = raw.address || raw.street || "";
  const city = raw.city || extractCity(address);

  return {
    name: raw.title || raw.name || "",
    category: raw.categoryName || raw.categories?.[0] || "other",
    address,
    city,
    phone: raw.phone || raw.phoneUnformatted || "",
    email: raw.email || "",
    website: raw.website || "",
    description: raw.description || raw.editorialSummary || "",
    google_rating: raw.totalScore || raw.rating || 0,
    review_count: raw.reviewsCount || raw.userRatingsTotal || 0,
    google_maps_url: raw.url || raw.googleMapsUrl || "",
    place_id: raw.placeId || "",
    photos,
    reviews,
    opening_hours,
    services,
    instagram,
    facebook,
  };
}

function extractCity(address: string): string {
  const cities = [
    "Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "Agadir",
    "Meknès", "Oujda", "Kenitra", "Tétouan", "Settat", "El Jadida",
    "Mohammedia", "Béni Mellal", "Nador", "Khouribga", "Safi",
  ];
  for (const c of cities) {
    if (address.toLowerCase().includes(c.toLowerCase())) return c;
  }
  const parts = address.split(",");
  return parts[parts.length - 1]?.trim() || "";
}
