import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const maxDuration = 60;

const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN || "";

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  try {
    const { leadId, html } = await req.json();
    if (!leadId || !html) return NextResponse.json({ error: "leadId and html required" }, { status: 400 });

    const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const slug = lead.company_name
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);

    const alias = `${slug}.yako.studio`;

    console.log(`[AI Deploy] Deploying ${lead.company_name} → ${alias}`);

    // Parse multi-page or single page
    let files: { file: string; data: string; encoding: string }[] = [];

    try {
      const pages = JSON.parse(html);
      // Multi-page website
      files = Object.entries(pages).map(([pageName, pageHtml]) => ({
        file: pageName === "index" ? "index.html" : `${pageName}.html`,
        data: pageHtml as string,
        encoding: "utf-8",
      }));
      console.log(`[AI Deploy] Multi-page: ${files.map(f => f.file).join(", ")}`);
    } catch {
      // Single page
      files = [{ file: "index.html", data: html, encoding: "utf-8" }];
      console.log(`[AI Deploy] Single page`);
    }

    const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "buildfactory-sites",
        files,
        projectSettings: { framework: null },
        alias: [alias],
        target: "production",
      }),
    });

    const deployData = await deployRes.json();

    if (!deployRes.ok) {
      console.error("[AI Deploy] Vercel error:", deployData);
      return NextResponse.json({ error: "Deploy failed: " + (deployData.error?.message || JSON.stringify(deployData).slice(0, 200)) }, { status: 500 });
    }

    const liveUrl = `https://${alias}`;
    console.log(`[AI Deploy] Live at ${liveUrl}`);

    try {
      await supabase.from("builds").insert({
        lead_id: leadId,
        business_name: lead.company_name,
        city: lead.city,
        template_name: "AI Generated (Multi-Page)",
        status: "completed",
        deployment_url: liveUrl,
        vercel_deployment_id: deployData.id,
      });
    } catch {}

    return NextResponse.json({ success: true, url: liveUrl, pages: files.map(f => f.file) });

  } catch (e: any) {
    console.error("[AI Deploy] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
