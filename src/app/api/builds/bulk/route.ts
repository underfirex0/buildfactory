import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { processTemplate } from "@/lib/build-engine";
import { deployToVercel } from "@/lib/vercel-deploy";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const vercelToken = process.env.VERCEL_API_TOKEN;

  let template_id: string;
  let lead_ids: string[];

  try {
    const body = await req.json();
    template_id = body.template_id;
    lead_ids = body.lead_ids;
    if (!template_id) throw new Error("template_id is required");
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) throw new Error("lead_ids must be a non-empty array");
    if (lead_ids.length > 50) throw new Error("Maximum 50 leads per bulk build");
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const { data: template, error: templateErr } = await supabase
    .from("templates").select("*").eq("id", template_id).single();
  if (templateErr || !template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const { data: leads, error: leadsErr } = await supabase
    .from("leads").select("*").in("id", lead_ids);
  if (leadsErr || !leads || leads.length === 0) return NextResponse.json({ error: "No leads found" }, { status: 404 });

  const { data: fileData, error: storageErr } = await supabase.storage
    .from("templates").download(template.file_path);
  if (storageErr || !fileData) return NextResponse.json({ error: `Failed to fetch template` }, { status: 500 });

  const templateBuffer = await fileData.arrayBuffer();

  const buildInserts = leads.map((lead: any) => ({
    lead_id: lead.id, template_id, status: "building", started_at: new Date().toISOString(),
  }));

  const { data: buildRecords, error: insertErr } = await supabase
    .from("builds").insert(buildInserts).select();
  if (insertErr || !buildRecords) return NextResponse.json({ error: "Failed to create build records" }, { status: 500 });

  const results = await Promise.allSettled(
    leads.map(async (lead: any) => {
      const buildRecord = buildRecords.find((b: any) => b.lead_id === lead.id);
      if (!buildRecord) throw new Error(`No build record for lead ${lead.id}`);

      try {
        const outputZip = await processTemplate(templateBuffer, lead);
        const slug = lead.company_name.toLowerCase().replace(/\s+/g, "-");
        const outputPath = `${buildRecord.id}/${slug}-website.zip`;

        await supabase.storage.from("builds").upload(outputPath, outputZip, {
          contentType: "application/zip", upsert: true,
        });

        let outputUrl: string | null = null;
        let deploymentId: string | null = null;

        if (vercelToken) {
          try {
            const siteName = `${slug}-${lead.city.toLowerCase().replace(/\s+/g, "-")}`;
            const result = await deployToVercel(outputZip, siteName, vercelToken);
            outputUrl = result.url;
            deploymentId = result.deploymentId;
          } catch (deployErr: any) {
            console.error("[VERCEL DEPLOY ERROR]", lead.company_name, deployErr.message);
          }
        }

        await supabase.from("builds").update({
          status: "done", output_path: outputPath,
          output_url: outputUrl, netlify_site_id: deploymentId,
          completed_at: new Date().toISOString(), error_msg: null,
        }).eq("id", buildRecord.id);

        return {
          build_id: buildRecord.id, lead_id: lead.id,
          company_name: lead.company_name, city: lead.city,
          status: "done", output_url: outputUrl,
        };
      } catch (err: any) {
        await supabase.from("builds").update({
          status: "failed", error_msg: err.message,
          completed_at: new Date().toISOString(),
        }).eq("id", buildRecord.id);
        return {
          build_id: buildRecord.id, lead_id: lead.id,
          company_name: lead.company_name, status: "failed", error: err.message,
        };
      }
    })
  );

  const summary = results.map((r: any) => r.status === "fulfilled" ? r.value : { status: "failed", error: r.reason });
  const successful = summary.filter((r: any) => r.status === "done").length;
  const failed = summary.filter((r: any) => r.status === "failed").length;

  return NextResponse.json({
    success: true,
    summary: { total: leads.length, successful, failed },
    results: summary,
  });
}
