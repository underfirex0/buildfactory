import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { processTemplate } from "@/lib/build-engine";
import { deployToVercel } from "@/lib/vercel-deploy";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  let buildId: string;
  try {
    const body = await req.json();
    buildId = body.buildId;
    if (!buildId) throw new Error("buildId is required");
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const vercelToken = process.env.VERCEL_API_TOKEN;

  try {
    const { data: build, error: buildErr } = await supabase
      .from("builds").select("*, leads(*), templates(*)")
      .eq("id", buildId).single();

    if (buildErr || !build) throw new Error("Build record not found");

    const lead = (build as any).leads;
    const template = (build as any).templates;
    if (!lead) throw new Error("Lead not found");
    if (!template) throw new Error("Template not found");

    const { data: fileData, error: storageErr } = await supabase.storage
      .from("templates").download(template.file_path);
    if (storageErr || !fileData) throw new Error(`Failed to fetch template: ${storageErr?.message}`);

    const templateBuffer = await fileData.arrayBuffer();
    const outputZip = await processTemplate(templateBuffer, lead);

    // Save ZIP to Supabase Storage
    const slug = lead.company_name.toLowerCase().replace(/\s+/g, "-");
    const outputPath = `${buildId}/${slug}-website.zip`;
    await supabase.storage.from("builds").upload(outputPath, outputZip, {
      contentType: "application/zip", upsert: true,
    });

    // Deploy to Vercel
    let outputUrl: string | null = null;
    let vercelDeploymentId: string | null = null;

    if (vercelToken) {
      try {
        const siteName = `${slug}-${lead.city.toLowerCase().replace(/\s+/g, "-")}`;
        const result = await deployToVercel(outputZip, siteName, vercelToken);
        outputUrl = result.url;
        vercelDeploymentId = result.deploymentId;
      } catch (deployErr: any) {
        console.error("[VERCEL DEPLOY ERROR]", deployErr.message);
      }
    }

    await supabase.from("builds").update({
      status: "done",
      output_path: outputPath,
      output_url: outputUrl,
      netlify_site_id: vercelDeploymentId, // reuse column for vercel deployment id
      completed_at: new Date().toISOString(),
      error_msg: null,
    }).eq("id", buildId);

    return NextResponse.json({ success: true, outputPath, outputUrl });
  } catch (err: any) {
    await supabase.from("builds").update({
      status: "failed",
      error_msg: err.message ?? "Unknown error",
      completed_at: new Date().toISOString(),
    }).eq("id", buildId);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
