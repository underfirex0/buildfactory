/**
 * Apify Integration — Google Maps Business Scraper
 * Scrapes real business data: photos, reviews, services, hours, rating
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const APIFY_API = "https://api.apify.com/v2";

export interface EnrichedBusiness {
  // Basic info
  name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  category: string;

  // Google data
  google_rating: number;
  review_count: number;
  google_maps_url: string;
  place_id: string;

  // Rich content
  photos: string[];
  reviews: Review[];
  services: string[];
  opening_hours: OpeningHours[];
  description: string;

  // Social
  instagram?: string;
  facebook?: string;
}

export interface Review {
  author: string;
  rating: number;
  text: string;
  time: string;
  avatar?: string;
}

export interface OpeningHours {
  day: string;
  hours: string;
}

/**
 * Main function — scrape a business from Google Maps
 */
export async function scrapeGoogleMaps(
  businessName: string,
  city: string,
  existingPhone?: string
): Promise<EnrichedBusiness | null> {
  try {
    console.log(`[Apify] Scraping: ${businessName} in ${city}`);

    // Run the Google Maps Scraper actor
    const runId = await startScraper(businessName, city);
    if (!runId) throw new Error("Failed to start scraper");

    // Wait for results
    const results = await waitForResults(runId);
    if (!results || results.length === 0) {
      console.log("[Apify] No results found");
      return null;
    }

    // Take the best match
    const best = findBestMatch(results, businessName);
    if (!best) return null;

    return parseBusinessData(best, existingPhone);
  } catch (e: any) {
    console.error("[Apify] Error:", e.message);
    return null;
  }
}

/**
 * Start the Google Maps scraper actor
 */
async function startScraper(businessName: string, city: string): Promise<string | null> {
  const searchQuery = `${businessName} ${city} Maroc`;

  const res = await fetch(
    `${APIFY_API}/acts/compass~crawler-google-places/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [searchQuery],
        maxCrawledPlacesPerSearch: 3,
        language: "fr",
        includeReviews: true,
        maxReviews: 10,
        includeImages: true,
        maxImages: 10,
        reviewsSort: "newest",
        scrapeDirectories: false,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[Apify] Start error:", err);
    return null;
  }

  const data = await res.json();
  return data.data?.id || null;
}

/**
 * Poll until results are ready
 */
async function waitForResults(runId: string, maxWait = 60000): Promise<any[]> {
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 3000));

    const statusRes = await fetch(
      `${APIFY_API}/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    const statusData = await statusRes.json();
    const status = statusData.data?.status;

    console.log(`[Apify] Run status: ${status}`);

    if (status === "SUCCEEDED") {
      // Fetch dataset
      const datasetId = statusData.data?.defaultDatasetId;
      const resultsRes = await fetch(
        `${APIFY_API}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=5`
      );
      const results = await resultsRes.json();
      return Array.isArray(results) ? results : [];
    }

    if (status === "FAILED" || status === "ABORTED") {
      console.error("[Apify] Run failed:", status);
      return [];
    }
  }

  console.error("[Apify] Timeout waiting for results");
  return [];
}

/**
 * Find best matching business from results
 */
function findBestMatch(results: any[], businessName: string): any | null {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  const nameLower = businessName.toLowerCase();
  const exact = results.find(r =>
    r.title?.toLowerCase().includes(nameLower) ||
    nameLower.includes(r.title?.toLowerCase())
  );

  return exact || results[0];
}

/**
 * Parse raw Apify data into our format
 */
function parseBusinessData(raw: any, existingPhone?: string): EnrichedBusiness {
  // Parse photos
  const photos: string[] = [];
  if (raw.images && Array.isArray(raw.images)) {
    raw.images.slice(0, 8).forEach((img: any) => {
      const url = img.imageUrl || img.url || img;
      if (typeof url === "string" && url.startsWith("http")) {
        photos.push(url);
      }
    });
  }

  // Parse reviews
  const reviews: Review[] = [];
  if (raw.reviews && Array.isArray(raw.reviews)) {
    raw.reviews.slice(0, 6).forEach((r: any) => {
      if (r.text && r.text.length > 10) {
        reviews.push({
          author: r.name || r.publisherName || "Client",
          rating: r.stars || r.rating || 5,
          text: r.text,
          time: r.publishedAtDate || r.date || "",
          avatar: r.reviewerPhotoUrl || "",
        });
      }
    });
  }

  // Parse opening hours
  const openingHours: OpeningHours[] = [];
  if (raw.openingHours && Array.isArray(raw.openingHours)) {
    raw.openingHours.forEach((h: any) => {
      openingHours.push({
        day: h.day || "",
        hours: h.hours || "Fermé",
      });
    });
  }

  // Parse services/categories
  const services: string[] = [];
  if (raw.categories && Array.isArray(raw.categories)) {
    raw.categories.slice(0, 6).forEach((c: string) => services.push(c));
  }
  if (raw.additionalInfo) {
    // Try to extract service offerings
    Object.entries(raw.additionalInfo).forEach(([key, val]: [string, any]) => {
      if (val === true) services.push(key);
    });
  }

  // Extract city from address
  const address = raw.address || raw.street || "";
  const city = raw.city || extractCity(address) || "";

  return {
    name: raw.title || raw.name || "",
    phone: existingPhone || raw.phone || raw.phoneUnformatted || "",
    email: raw.email || "",
    website: raw.website || "",
    address,
    city,
    category: raw.categoryName || raw.categories?.[0] || "other",
    google_rating: raw.totalScore || raw.rating || 0,
    review_count: raw.reviewsCount || raw.userRatingsTotal || 0,
    google_maps_url: raw.url || raw.googleMapsUrl || "",
    place_id: raw.placeId || "",
    photos,
    reviews,
    services,
    opening_hours: openingHours,
    description: raw.description || raw.editorialSummary || "",
    instagram: extractSocial(raw, "instagram"),
    facebook: extractSocial(raw, "facebook"),
  };
}

function extractCity(address: string): string {
  const moroccanCities = [
    "Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "Agadir",
    "Meknès", "Oujda", "Kenitra", "Tétouan", "Safi", "Mohammedia",
    "Settat", "Béni Mellal", "El Jadida", "Nador", "Khouribga"
  ];
  for (const city of moroccanCities) {
    if (address.toLowerCase().includes(city.toLowerCase())) return city;
  }
  // Try to get last part of address
  const parts = address.split(",");
  return parts[parts.length - 1]?.trim() || "";
}

function extractSocial(raw: any, platform: string): string | undefined {
  if (raw.socialProfiles) {
    const found = raw.socialProfiles.find((p: any) =>
      p.url?.includes(platform)
    );
    return found?.url;
  }
  return undefined;
}

/**
 * Generate HTML blocks from enriched data for use in templates
 */
export function generateEnrichedPlaceholders(data: EnrichedBusiness): Record<string, string> {
  return {
    "{{REAL_PHOTOS_HTML}}": generatePhotosHtml(data.photos),
    "{{REAL_REVIEWS_HTML}}": generateReviewsHtml(data.reviews),
    "{{REAL_SERVICES_HTML}}": generateServicesHtml(data.services),
    "{{REAL_HOURS_HTML}}": generateHoursHtml(data.opening_hours),
    "{{GOOGLE_RATING}}": data.google_rating.toString(),
    "{{REVIEW_COUNT}}": data.review_count.toString(),
    "{{GOOGLE_MAPS_URL}}": data.google_maps_url,
    "{{MAPS_EMBED}}": generateMapsEmbed(data.place_id, data.address),
    "{{BUSINESS_DESCRIPTION}}": data.description,
    "{{INSTAGRAM_URL}}": data.instagram || "#",
    "{{FACEBOOK_URL}}": data.facebook || "#",
    "{{STARS_HTML}}": generateStarsHtml(data.google_rating),
  };
}

function generatePhotosHtml(photos: string[]): string {
  if (!photos.length) return "";
  return photos.map((url, i) => `
    <div class="gallery-item ${i === 0 ? "featured" : ""}">
      <img src="${url}" alt="Photo ${i + 1}" loading="lazy"/>
    </div>`
  ).join("");
}

function generateReviewsHtml(reviews: Review[]): string {
  if (!reviews.length) return "";
  const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
  return reviews.map(r => `
    <div class="review-card">
      <div class="review-stars">${stars(r.rating)}</div>
      <p class="review-text">"${r.text.slice(0, 200)}${r.text.length > 200 ? "..." : ""}"</p>
      <div class="review-author">
        ${r.avatar ? `<img src="${r.avatar}" alt="${r.author}" class="review-avatar"/>` : `<div class="review-avatar-placeholder">${r.author[0]}</div>`}
        <div>
          <strong>${r.author}</strong>
          <span>${r.time ? new Date(r.time).toLocaleDateString("fr-MA") : ""}</span>
        </div>
      </div>
    </div>`
  ).join("");
}

function generateServicesHtml(services: string[]): string {
  if (!services.length) return "";
  return services.map(s => `<div class="service-tag">${s}</div>`).join("");
}

function generateHoursHtml(hours: OpeningHours[]): string {
  if (!hours.length) return "";
  return hours.map(h => `
    <div class="hours-row">
      <span class="hours-day">${h.day}</span>
      <span class="hours-time">${h.hours}</span>
    </div>`
  ).join("");
}

function generateMapsEmbed(placeId: string, address: string): string {
  const query = placeId
    ? `place_id:${placeId}`
    : encodeURIComponent(address);
  return `<iframe
    src="https://www.google.com/maps/embed/v1/place?key=AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY&q=${query}"
    width="100%" height="400" style="border:0;" allowfullscreen loading="lazy">
  </iframe>`;
}

function generateStarsHtml(rating: number): string {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return `${"★".repeat(full)}${half ? "½" : ""}${"☆".repeat(empty)} (${rating}/5)`;
}
