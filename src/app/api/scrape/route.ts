import { NextRequest, NextResponse } from "next/server";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const APIFY_API = "https://api.apify.com/v2";

export const maxDuration = 90;

// Niche → better Google Maps search query
const NICHE_QUERIES: Record<string, string> = {
  gym: "salle de sport",
  salon: "salon de coiffure",
  restaurant: "restaurant",
  dentist: "dentiste",
  garage: "garage automobile",
  hotel: "hôtel",
  pharmacy: "pharmacie",
  lawyer: "avocat",
  "real-estate": "agence immobilière",
  retail: "boutique",
  school: "école formation",
  lavage: "lavage auto",
  other: "commerce",
};

export async function POST(req: NextRequest) {
  try {
    const { niche, city, maxResults = 50, websiteFilter = "all" } = await req.json();
    if (!niche || !city) {
      return NextResponse.json({ error: "niche and city required" }, { status: 400 });
    }

    // When filtering for no_website, scrape 4x more to compensate for filtering
    const scrapeCount = websiteFilter === "no_website"
      ? Math.min(maxResults * 4, 200)
      : maxResults;

    const query = NICHE_QUERIES[niche] ?? niche;
    console.log(`[Scraper] "${query}" in ${city}, scraping ${scrapeCount}, filter: ${websiteFilter}`);

    const raw = await scrapeGoogleMaps(query, city, scrapeCount);
    console.log(`[Scraper] Got ${raw.length} raw results`);

    // Apply website filter
    let filtered = raw;
    if (websiteFilter === "no_website") {
      filtered = raw.filter((b: any) => !b.website);
    } else if (websiteFilter === "has_website") {
      filtered = raw.filter((b: any) => !!b.website);
    }

    // Limit to requested maxResults after filtering
    const sliced = filtered.slice(0, maxResults);
    const businesses = sliced.map(parseBusinessData).filter((b: any) => b.name && b.phone);

    return NextResponse.json({
      success: true,
      results: businesses,
      total: businesses.length,
      stats: {
        total_found: raw.length,
        with_website: raw.filter((b: any) => b.website).length,
        without_website: raw.filter((b: any) => !b.website).length,
        with_phone: raw.filter((b: any) => b.phone || b.phoneUnformatted).length,
        with_social: 0,
      },
    });

  } catch (e: any) {
    console.error("[Scraper] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function scrapeGoogleMaps(query: string, city: string, maxResults: number): Promise<any[]> {
  const searchQuery = `${query} ${city} Maroc`;

  const runRes = await fetch(
    `${APIFY_API}/acts/compass~crawler-google-places/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [searchQuery],
        maxCrawledPlacesPerSearch: maxResults,
        language: "fr",
        includeReviews: false,   // skip reviews to be faster
        maxReviews: 0,
        includeImages: false,    // skip images to be faster
        maxImages: 0,
        reviewsSort: "newest",
        deeperCityScrape: true,  // get more results per city
      }),
    }
  );

  if (!runRes.ok) {
    const err = await runRes.text();
    console.error("[Scraper] Apify start error:", err);
    throw new Error("Failed to start Maps scraper");
  }

  const runData = await runRes.json();
  const runId = runData.data?.id;
  if (!runId) throw new Error("No run ID from Apify");

  return await waitForResults(runId, 80000);
}

async function waitForResults(runId: string, maxWait: number): Promise<any[]> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 4000));
    const statusRes = await fetch(`${APIFY_API}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const statusData = await statusRes.json();
    const status = statusData.data?.status;
    console.log(`[Scraper] Status: ${status}`);

    if (status === "SUCCEEDED") {
      const datasetId = statusData.data?.defaultDatasetId;
      const res = await fetch(
        `${APIFY_API}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=300`
      );
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
    if (status === "FAILED" || status === "ABORTED") return [];
  }
  return [];
}

function parseBusinessData(raw: any): any {
  const address = raw.address || raw.street || "";

  // Auto-generate email from business name
  const slug = (raw.title || raw.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 20);
  const autoEmail = slug ? `contact@${slug}.ma` : "";

  return {
    name: raw.title || raw.name || "",
    category: raw.categoryName || raw.categories?.[0] || "other",
    address,
    city: raw.city || extractCity(address),
    phone: raw.phoneUnformatted || raw.phone || "",
    email: raw.email || autoEmail,
    website: raw.website || "",
    description: raw.description || raw.editorialSummary || "",
    google_rating: raw.totalScore || 0,
    review_count: raw.reviewsCount || 0,
    google_maps_url: raw.url || "",
    place_id: raw.placeId || "",
    photos: [],
    reviews: [],
    opening_hours: [],
    services: raw.categories?.slice(0, 5) ?? [],
    instagram: "",
    facebook: "",
    tiktok: "",
    linkedin: "",
    youtube: "",
    sources: ["Google Maps"],
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
  return address.split(",").pop()?.trim() || "";
}
