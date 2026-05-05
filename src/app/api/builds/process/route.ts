import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { processTemplate } from "@/lib/build-engine";
import { deployToVercel } from "@/lib/vercel-deploy";

export const maxDuration = 60;

const CUSTOM_DOMAIN = "yako.studio";

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

  console.log(`[PROCESS] buildId: ${buildId}`);
  console.log(`[PROCESS] Token present: ${!!vercelToken} | length: ${vercelToken?.length ?? 0} | prefix: ${vercelToken?.substring(0, 10) ?? 'MISSING'}`);

  try {
    const { data: build, error: buildErr } = await supabase
      .from("builds").select("*, leads(*), templates(*)")
      .eq("id", buildId).single();

    if (buildErr || !build) throw new Error("Build record not found");

    const lead = (build as any).leads;
    const template = (build as any).templates;
    if (!lead) throw new Error("Lead not found");
    if (!template) throw new Error("Template not found");

    console.log(`[PROCESS] Lead: ${lead.company_name} | Template: ${template.name}`);

    const { data: fileData, error: storageErr } = await supabase.storage
      .from("templates").download(template.file_path);
    if (storageErr || !fileData) throw new Error(`Failed to fetch template: ${storageErr?.message}`);

    const templateBuffer = await fileData.arrayBuffer();
    const outputZip = await processTemplate(templateBuffer, lead);

    const slug = lead.company_name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .substring(0, 40);

    const outputPath = `${buildId}/${slug}-website.zip`;
    await supabase.storage.from("builds").upload(outputPath, outputZip, {
      contentType: "application/zip", upsert: true,
    });

    let outputUrl: string | null = null;
    let vercelDeploymentId: string | null = null;

    if (!vercelToken) {
      console.log(`[PROCESS] ⚠️ VERCEL_API_TOKEN is empty or missing!`);
    } else {
      try {
        const citySlug = lead.city.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const siteName = `${slug}-${citySlug}`;
        const alias = `${slug}.${CUSTOM_DOMAIN}`;

        console.log(`[PROCESS] Deploying → ${alias}`);
        const result = await deployToVercel(outputZip, siteName, vercelToken, alias);
        outputUrl = result.url;
        vercelDeploymentId = result.deploymentId;
        console.log(`[PROCESS] ✅ ${outputUrl}`);
      } catch (deployErr: any) {
        console.error(`[PROCESS] ❌ ${deployErr.message}`);
      }
    }

    await supabase.from("builds").update({
      status: "done",
      output_path: outputPath,
      output_url: outputUrl,
      netlify_site_id: vercelDeploymentId,
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
