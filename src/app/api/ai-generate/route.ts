import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const maxDuration = 60;

function buildPrompt(lead: any): string {
  const photos = (lead.photos || []).slice(0, 5);
  const reviews = (lead.real_reviews || []).filter((r: any) => r.text).slice(0, 3);
  const services = (lead.real_services || []).slice(0, 6);
  const hours = (lead.opening_hours || []).slice(0, 7);
  const phone = lead.phone || "";
  const whatsapp = phone.replace(/\D/g, "");

  return `Create a complete single-file HTML gym website. Output ONLY raw HTML starting with <!DOCTYPE html>, no markdown, no explanation.

BUSINESS:
Name: ${lead.company_name}
City: ${lead.city}
Phone: ${phone}
Rating: ${lead.google_rating || 5}★ (${lead.review_count || 0} avis)
Services: ${services.join(", ") || "Musculation, Cardio, Cours collectifs, Coach personnel"}
Hours: ${hours.map((h: any) => `${h.day}: ${h.hours}`).join(" | ") || "Lun-Sam 06:00-23:00, Dim 09:00-15:00"}
Instagram: ${lead.instagram || ""}
WhatsApp: ${whatsapp}

PHOTOS (use in img src):
${photos.map((p: string) => p).join("\n") || "none"}

REVIEWS:
${reviews.map((r: any) => `"${r.text?.slice(0, 100)}" - ${r.author} ${r.rating}★`).join("\n") || "none"}

DESIGN RULES:
- Dark theme: bg #0a0a0a, cards #161616, primary #c8f53d (lime green)
- Fonts: Google Fonts Syne (headings 800 weight) + Inter (body)
- H1: clamp(48px,8vw,100px), letter-spacing:-3px
- All CSS and JS inline in single file
- Mobile responsive

REQUIRED SECTIONS (keep each SHORT):
1. Fixed nav: logo left, 4 links center, "Rejoindre" CTA right
2. Hero: 100vh, first photo as bg, dark overlay, h1 tagline, 2 buttons, rating stat bar at bottom
3. Services grid: 3 cols, cards with hover glow, use real services
4. Gallery: photo grid using all photos with hover zoom
5. Reviews: cards with stars using real reviews  
6. Hours table: highlight today with JS
7. Footer: phone, whatsapp link (wa.me/${whatsapp}), socials, copyright

ANIMATIONS:
- IntersectionObserver fadeUp on all sections
- Card hover: translateY(-8px) + lime glow
- Floating WhatsApp button fixed bottom-right

Write complete valid HTML now:`;
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  try {
    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (error || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    console.log(`[AI Gen] Generating for ${lead.company_name}`);

    const prompt = buildPrompt(lead);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CLAUDE_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 7000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("[AI Gen] Claude error:", responseText.slice(0, 500));
      return NextResponse.json({ error: "Claude API error: " + responseText.slice(0, 200) }, { status: 500 });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON from Claude" }, { status: 500 });
    }

    let html = data.content?.[0]?.text || "";

    // Clean markdown wrappers
    html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    // Ensure HTML is complete
    if (!html.includes("</html>")) {
      html += "\n</body>\n</html>";
    }
    if (!html.includes("</body>") && html.includes("</html>")) {
      html = html.replace("</html>", "</body>\n</html>");
    }

    if (!html.includes("<!DOCTYPE") && !html.includes("<html")) {
      return NextResponse.json({ error: "Claude did not return valid HTML" }, { status: 500 });
    }

    console.log(`[AI Gen] Generated ${html.length} chars`);

    return NextResponse.json({
      success: true,
      html,
      length: html.length,
      business: lead.company_name,
    });

  } catch (e: any) {
    console.error("[AI Gen] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
