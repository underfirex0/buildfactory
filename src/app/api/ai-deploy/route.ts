import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const maxDuration = 60;

const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN || "";

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  try {
    const { leadId, html } = await req.json();
    if (!leadId || !html) {
      return NextResponse.json({ error: "leadId and html required" }, { status: 400 });
    }

    // Get lead info
    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const slug = lead.company_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);

    const alias = `${slug}.yako.studio`;

    console.log(`[AI Deploy] Deploying ${lead.company_name} to ${alias}`);

    // Create Vercel deployment with the HTML file
    const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "buildfactory-sites",
        files: [
          {
            file: "index.html",
            data: html,
            encoding: "utf-8",
          },
        ],
        projectSettings: {
          framework: null,
        },
        alias: [alias],
        target: "production",
      }),
    });

    const deployData = await deployRes.json();

    if (!deployRes.ok) {
      console.error("[AI Deploy] Vercel error:", deployData);
      return NextResponse.json(
        { error: "Vercel deploy failed: " + (deployData.error?.message || JSON.stringify(deployData)) },
        { status: 500 }
      );
    }

    const deploymentUrl = deployData.url || deployData.alias?.[0];
    const liveUrl = `https://${alias}`;

    console.log(`[AI Deploy] Deployed! URL: ${liveUrl}`);

    // Save to builds table
    await supabase.from("builds").insert({
      lead_id: leadId,
      business_name: lead.company_name,
      city: lead.city,
      template_name: "AI Generated",
      status: "completed",
      deployment_url: liveUrl,
      vercel_deployment_id: deployData.id,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      url: liveUrl,
      deploymentId: deployData.id,
    });

  } catch (e: any) {
    console.error("[AI Deploy] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
