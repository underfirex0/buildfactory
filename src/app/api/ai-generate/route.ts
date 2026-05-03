import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const maxDuration = 90;

const GYM_PROMPT = `You are an elite senior UI/UX designer and frontend developer with 15 years of experience building premium fitness brand websites. You have studied the best gym websites in the world including Transform Fitness, Fitnix, Athlex, and GymPro — all built on Framer with cutting-edge design.

Your task is to generate a COMPLETE, SINGLE-FILE HTML website for a gym/fitness business. The website must be indistinguishable from a $3000+ custom-built site.

DESIGN SYSTEM:
- Background: #0a0a0a, Surface: #111111, Card: #161616
- Primary color: #c8f53d (electric lime green)
- Fonts: Syne (800 headings) + Inter (body) from Google Fonts
- H1: clamp(52px, 8vw, 120px), weight 800, letter-spacing -3px
- Section padding: 120px 0, Container max: 1280px

SECTIONS TO BUILD (ALL REQUIRED):
1. Fixed nav with blur backdrop, logo, links, CTA button, mobile hamburger
2. Hero (100vh) with real photo background, dark overlay, animated badge, powerful tagline, 2 CTAs, stats bar
3. Trust bar with infinite scroll animation showing stats
4. About section with count-up number animations on scroll
5. Services/Classes grid with hover glow effects using real services
6. Photo gallery masonry with all real photos, hover zoom
7. Reviews carousel (CSS scroll-snap) with all real reviews
8. Opening hours table with today highlighted
9. CTA section with WhatsApp button
10. Footer with socials and contact

MANDATORY ANIMATIONS:
- IntersectionObserver fade-up for all sections
- CSS keyframes: fadeUp, infiniteScroll, pulse, float
- Card hover: translateY(-8px) + glow
- Button hover: scale(1.02)
- Stats count-up on scroll
- Smooth scroll anchors
- Floating WhatsApp button (fixed bottom-right, wa.me link)

RULES:
- Single HTML file, ALL CSS+JS inline
- NO external libraries
- Mobile-first responsive
- French language
- Only use provided photo URLs
- Output ONLY pure HTML, no markdown, no explanation`;

function buildBrandBook(lead: any): string {
  const photos = (lead.photos || []).slice(0, 8).map((url: string) => `  - ${url}`).join("\n");
  const reviews = (lead.real_reviews || []).slice(0, 5).map((r: any) =>
    `  - "${r.text}" — ${r.author} (${r.rating}★)`
  ).join("\n");
  const hours = (lead.opening_hours || []).map((h: any) => `  - ${h.day}: ${h.hours}`).join("\n");
  const services = (lead.real_services || []).slice(0, 10).join(", ");

  return `
BRAND BOOK:
Business Name: ${lead.company_name}
City: ${lead.city}
Phone: ${lead.phone || "N/A"}
WhatsApp: ${(lead.phone || "").replace(/\D/g, "")}
Email: ${lead.email || "N/A"}
Google Rating: ${lead.google_rating || "N/A"} (${lead.review_count || 0} reviews)
Description: ${lead.description || "Salle de sport premium à " + lead.city}
Services: ${services || "Musculation, Cardio, Cours collectifs, Coach personnel"}
Instagram: ${lead.instagram || "N/A"}
Facebook: ${lead.facebook || "N/A"}
TikTok: ${lead.tiktok || "N/A"}

Opening Hours:
${hours || "  - Lundi-Vendredi: 06:00-23:00\n  - Samedi: 08:00-20:00\n  - Dimanche: 09:00-14:00"}

Real Photos (use these in img src):
${photos || "  (No photos available — use dark gradient backgrounds)"}

Real Customer Reviews:
${reviews || "  (No reviews available — write compelling fictional reviews)"}
`;
}

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

    console.log(`[AI Generator] Generating website for ${lead.company_name}`);

    const brandBook = buildBrandBook(lead);
    const fullPrompt = GYM_PROMPT + "\n\n" + brandBook + "\n\nGenerate the complete HTML website now:";

    // Call Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CLAUDE_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: fullPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[AI Generator] Claude error:", err);
      return NextResponse.json({ error: "Claude API error: " + err.slice(0, 300) }, { status: 500 });
    }

    let data;
    try {
      data = await response.json();
    } catch {
      const text = await response.text();
      return NextResponse.json({ error: "Invalid response: " + text.slice(0, 200) }, { status: 500 });
    }
    let html = data.content?.[0]?.text || "";
    // Remove markdown code blocks if Claude wrapped it
    html = html.replace(/^```html\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();

    if (!html || !html.includes("<!DOCTYPE")) {
      return NextResponse.json({ error: "Claude did not return valid HTML" }, { status: 500 });
    }

    console.log(`[AI Generator] Generated ${html.length} chars of HTML`);

    return NextResponse.json({
      success: true,
      html,
      length: html.length,
      business: lead.company_name,
    });

  } catch (e: any) {
    console.error("[AI Generator] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
