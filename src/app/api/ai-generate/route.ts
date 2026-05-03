import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const maxDuration = 60;

function buildPremiumPrompt(lead: any): string {
  const photos = (lead.photos || []).slice(0, 8);
  const reviews = (lead.real_reviews || []).filter((r: any) => r.text?.length > 20).slice(0, 5);
  const services = (lead.real_services || []).slice(0, 8);
  const hours = (lead.opening_hours || []).slice(0, 7);
  const phone = (lead.phone || "").replace(/\D/g, "");

  const photosHtml = photos.length > 0
    ? photos.map((p: string) => `<img src="${p}" loading="lazy" alt="${lead.company_name}"/>`).join("\n")
    : "";

  const reviewsData = reviews.map((r: any) => ({
    text: r.text?.slice(0, 150),
    author: r.author || "Client",
    rating: r.rating || 5,
    avatar: r.avatar || "",
  }));

  const servicesData = services.length > 0 ? services : ["Musculation", "Cardio", "Cours collectifs", "Coach personnel", "Zumba", "Spinning"];

  return `You are an elite senior UI/UX designer. Create a STUNNING single-file HTML gym website that looks like it cost $5000. Be creative, bold, and use premium design patterns.

BUSINESS DATA:
Name: ${lead.company_name}
City: ${lead.city}
Phone: +${phone}
WhatsApp: https://wa.me/${phone}
Rating: ${lead.google_rating || 5}★ (${lead.review_count || 0} avis Google)
Description: ${lead.description || "Salle de sport premium"}
Services: ${servicesData.join(", ")}
Hours: ${hours.map((h: any) => `${h.day}: ${h.hours}`).join(" | ") || "Lun-Sam 06:00-23:00"}
Instagram: ${lead.instagram || ""}
Facebook: ${lead.facebook || ""}

REAL PHOTOS (8 photos - use ALL of them):
${photos.join("\n") || "No photos - use CSS gradient backgrounds"}

REAL REVIEWS (${reviewsData.length} reviews):
${reviewsData.map((r: any) => `- "${r.text}" — ${r.author} (${r.rating}★)`).join("\n") || "No reviews"}

═══════════ DESIGN SYSTEM ═══════════
Colors:
- Background: #080808
- Surface: #111111  
- Card: #181818
- Border: rgba(255,255,255,0.06)
- Primary: #c8f53d (electric lime)
- Primary glow: 0 0 40px rgba(200,245,61,0.4)
- Text: #ffffff
- Muted: rgba(255,255,255,0.5)

Typography (import from Google Fonts):
- Headings: 'Syne' weight 800, letter-spacing -3px
- Body: 'Inter' weight 400/500
- H1: clamp(56px, 9vw, 130px), line-height 0.9
- H2: clamp(40px, 6vw, 80px)
- Labels: 11px uppercase letter-spacing 3px

Spacing: sections 140px top/bottom, container max 1300px

═══════════ SECTIONS (ALL REQUIRED) ═══════════

1. NAV (fixed, blur backdrop):
- Logo: business name in Syne 800 lime color
- Links: Services | Galerie | Avis | Contact  
- CTA button: "Rejoindre" lime bg dark text
- Scrolled state: darker background
- Mobile hamburger with slide menu

2. HERO (100vh, DRAMATIC):
- Full bleed background: first photo OR dark gradient with lime accents
- Strong dark overlay gradient
- Animated pill badge: "⚡ Meilleure Salle de ${lead.city}"
- H1: Create a POWERFUL unique tagline for THIS gym (not generic!)
- Subtitle: compelling one-liner
- Two CTAs: "Commencer Maintenant" (lime) + "Voir les Programmes" (outline)
- Bottom stat bar: ${lead.google_rating}★ | ${lead.review_count}+ Avis | Ouvert 7j/7
- Animated scroll indicator

3. MARQUEE TRUST BAR:
- Infinite scroll animation
- Items: rating, review count, city name, services

4. ABOUT (split layout):
- Left: BIG animated numbers (rating, reviews, etc) count-up on scroll
- Right: Compelling description about the gym
- Feature list with lime checkmarks

5. SERVICES (cards grid):
- 3 columns desktop, 1 mobile
- Each card: dark bg, emoji icon, service name, description
- Hover: lift + lime glow border
- Use ALL real services

6. GALLERY (masonry):
- ALL ${photos.length} real photos
- Hover: zoom + dark overlay + "Voir" text
- Responsive columns

7. REVIEWS (horizontal scroll):
- Scroll-snap carousel
- Each card: stars, review text, author name + avatar letter
- Google rating badge
- Auto-scroll pause on hover

8. HOURS (styled table):
- Today highlighted with lime
- Open/Closed indicator
- Clean dark card design

9. CTA SECTION:
- Full width lime gradient background
- Bold headline
- WhatsApp CTA button (wa.me link)
- Phone number

10. FOOTER:
- Logo + tagline
- Quick links
- Social icons (Instagram, Facebook)
- Copyright

═══════════ ANIMATIONS (ALL MANDATORY) ═══════════
- IntersectionObserver: fadeUp + stagger for all sections
- CSS: @keyframes fadeUp, infiniteScroll, float, pulse, glow
- Cards: hover translateY(-10px) + box-shadow glow
- Buttons: hover scale(1.03) + glow
- Hero elements: staggered entrance animations
- Stats: count-up with IntersectionObserver
- Smooth scroll for nav links
- Nav: active section highlight on scroll
- Floating WhatsApp button: fixed bottom-right, lime bg, float animation, pulse ring

═══════════ TECHNICAL ═══════════
- Single HTML file, ALL CSS + JS inline
- NO external libraries (no jQuery, Bootstrap, etc)
- Google Fonts via @import in <style>
- Mobile-first, fully responsive
- Smooth 60fps (use transform/opacity only)
- Images: loading="lazy", object-fit cover
- Meta tags: title, description

═══════════ CREATIVE DIRECTION ═══════════
- Make the hero tagline UNIQUE and POWERFUL for this specific gym
- Use dramatic size contrast (huge H1, small labels)
- Generous white space = premium feel  
- The lime green should pop against the dark background
- Think: Transform Fitness + Athlex + GymPro aesthetic
- Each section should feel distinct, not all the same layout

OUTPUT: Pure HTML only. Start with <!DOCTYPE html>. No markdown. No explanation. No code blocks.`;
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  try {
    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    // Create a generation job
    const { data: job } = await supabase
      .from("ai_generations")
      .insert({
        lead_id: leadId,
        status: "generating",
      })
      .select()
      .single();

    if (!job) return NextResponse.json({ error: "Failed to create job" }, { status: 500 });

    console.log(`[AI Gen] Job ${job.id} started for ${lead.company_name}`);

    // Generate in background (don't await)
    generateInBackground(job.id, lead, supabase);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Generation started",
    });

  } catch (e: any) {
    console.error("[AI Gen] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function generateInBackground(jobId: string, lead: any, supabase: any) {
  try {
    const prompt = buildPremiumPrompt(lead);

    console.log(`[AI Gen] Calling Claude Sonnet for job ${jobId}`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CLAUDE_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 12000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error("Claude API error: " + responseText.slice(0, 300));
    }

    const data = JSON.parse(responseText);
    let html = data.content?.[0]?.text || "";

    // Clean markdown
    html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    // Ensure complete HTML
    if (!html.includes("</html>")) html += "\n</body>\n</html>";
    if (!html.includes("</body>") && html.includes("</html>")) {
      html = html.replace("</html>", "</body>\n</html>");
    }

    console.log(`[AI Gen] Job ${jobId} complete: ${html.length} chars`);

    // Save result
    await supabase.from("ai_generations").update({
      status: "completed",
      html,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

  } catch (e: any) {
    console.error(`[AI Gen] Job ${jobId} failed:`, e.message);
    await supabase.from("ai_generations").update({
      status: "failed",
      error: e.message,
    }).eq("id", jobId);
  }
}
