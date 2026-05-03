import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { scrapeGoogleMaps, generateEnrichedPlaceholders } from "@/lib/apify";

export const maxDuration = 90; // Apify can take up to 60s

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  try {
    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    // Fetch lead
    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (error || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    console.log(`[Enrich] Starting enrichment for ${lead.company_name}`);

    // Scrape Google Maps
    const enriched = await scrapeGoogleMaps(
      lead.company_name,
      lead.city,
      lead.phone
    );

    if (!enriched) {
      return NextResponse.json({ error: "No data found on Google Maps" }, { status: 404 });
    }

    // Update lead with enriched data
    const updateData: any = {
      enriched: true,
      enriched_at: new Date().toISOString(),
      google_rating: enriched.google_rating,
      review_count: enriched.review_count,
      google_maps_url: enriched.google_maps_url,
      place_id: enriched.place_id,
      photos: enriched.photos,
      real_reviews: enriched.reviews,
      real_services: enriched.services,
      opening_hours: enriched.opening_hours,
      description: enriched.description,
    };

    // Update phone/email/website if missing
    if (!lead.phone && enriched.phone) updateData.phone = enriched.phone;
    if (!lead.email && enriched.email) updateData.email = enriched.email;
    if (!lead.website && enriched.website) updateData.website = enriched.website;

    await supabase.from("leads").update(updateData).eq("id", leadId);

    console.log(`[Enrich] Done! ${enriched.photos.length} photos, ${enriched.reviews.length} reviews`);

    return NextResponse.json({
      success: true,
      data: {
        photos: enriched.photos.length,
        reviews: enriched.reviews.length,
        services: enriched.services.length,
        rating: enriched.google_rating,
        review_count: enriched.review_count,
        description: enriched.description,
      }
    });

  } catch (err: any) {
    console.error("[Enrich] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
