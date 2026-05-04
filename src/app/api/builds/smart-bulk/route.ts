/**
 * POST /api/builds/smart-bulk
 *
 * Accepts multiple sectors, each with multiple templates.
 * Assigns templates to leads via round-robin within each sector.
 * Processes in batches of 50 (Vercel 60s limit).
 * Tracks template_id on each build for conversion analytics.
 *
 * Body:
 * {
 *   sectors: [
 *     {
 *       sector_key: "gym",
 *       lead_ids: ["uuid1", "uuid2", ...],
 *       template_ids: ["tpl1", "tpl2", "tpl3", "tpl4"]
 *     },
 *     ...
 *   ],
 *   batch_offset: 0  // which batch to process (0 = first 50, 1 = next 50, etc.)
 * }
 *
 * Returns:
 * {
 *   success: true,
 *   batch: { offset, size, total_remaining },
 *   summary: { total, successful, failed },
 *   results: [...],
 *   next_batch_offset: 1  // null if done
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { processTemplate } from "@/lib/build-engine";
import { deployToVercel } from "@/lib/vercel-deploy";

export const maxDuration = 60;

const CUSTOM_DOMAIN = "yako.studio";
const BATCH_SIZE = 50;

interface SectorConfig {
  sector_key: string;
  lead_ids: string[];
  template_ids: string[];
}

interface AssignedLead {
  lead_id: string;
  template_id: string;
  sector_key: string;
}

// Round-robin assignment: distribute template_ids across lead_ids
function assignTemplates(sectors: SectorConfig[]): AssignedLead[] {
  const assignments: AssignedLead[] = [];

  for (const sector of sectors) {
    if (!sector.lead_ids.length || !sector.template_ids.length) continue;

    sector.lead_ids.forEach((leadId, index) => {
      const templateId = sector.template_ids[index % sector.template_ids.length];
      assignments.push({
        lead_id: leadId,
        template_id: templateId,
        sector_key: sector.sector_key,
      });
    });
  }

  return assignments;
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const vercelToken = process.env.VERCEL_API_TOKEN;

  let sectors: SectorConfig[];
  let batchOffset: number;

  try {
    const body = await req.json();
    sectors = body.sectors;
    batchOffset = body.batch_offset ?? 0;

    if (!Array.isArray(sectors) || sectors.length === 0) {
      throw new Error("sectors array is required");
    }
    for (const s of sectors) {
      if (!Array.isArray(s.lead_ids) || !Array.isArray(s.template_ids)) {
        throw new Error("Each sector needs lead_ids and template_ids arrays");
      }
      if (s.template_ids.length === 0) {
        throw new Error(`Sector ${s.sector_key} has no templates selected`);
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // Build full assignment list
  const allAssignments = assignTemplates(sectors);
  const totalLeads = allAssignments.length;

  // Slice batch
  const batchStart = batchOffset * BATCH_SIZE;
  const batchAssignments = allAssignments.slice(batchStart, batchStart + BATCH_SIZE);

  if (batchAssignments.length === 0) {
    return NextResponse.json({
      success: true,
      batch: { offset: batchOffset, size: 0, total: totalLeads },
      summary: { total: 0, successful: 0, failed: 0 },
      results: [],
      next_batch_offset: null,
      done: true,
    });
  }

  // Fetch all unique template files needed for this batch
  const uniqueTemplateIds = [...new Set(batchAssignments.map(a => a.template_id))];
  const templateBuffers = new Map<string, ArrayBuffer>();

  for (const tplId of uniqueTemplateIds) {
    const { data: tpl } = await supabase.from("templates").select("*").eq("id", tplId).single();
    if (!tpl) continue;
    const { data: fileData } = await supabase.storage.from("templates").download(tpl.file_path);
    if (fileData) templateBuffers.set(tplId, await fileData.arrayBuffer());
  }

  // Fetch all leads for this batch
  const batchLeadIds = batchAssignments.map(a => a.lead_id);
  const { data: leadsData } = await supabase.from("leads").select("*").in("id", batchLeadIds);
  const leadsMap = new Map((leadsData ?? []).map((l: any) => [l.id, l]));

  // Create build records
  const buildInserts = batchAssignments.map(a => ({
    lead_id: a.lead_id,
    template_id: a.template_id,
    status: "building",
    started_at: new Date().toISOString(),
  }));

  const { data: buildRecords, error: insertErr } = await supabase
    .from("builds").insert(buildInserts).select();

  if (insertErr || !buildRecords) {
    return NextResponse.json({ error: "Failed to create build records" }, { status: 500 });
  }

  // Process all builds in parallel
  const results = await Promise.allSettled(
    batchAssignments.map(async (assignment) => {
      const lead = leadsMap.get(assignment.lead_id);
      const templateBuffer = templateBuffers.get(assignment.template_id);
      const buildRecord = buildRecords.find((b: any) => b.lead_id === assignment.lead_id);

      if (!lead || !templateBuffer || !buildRecord) {
        return { lead_id: assignment.lead_id, status: "failed", error: "Missing lead, template, or build record" };
      }

      try {
        const outputZip = await processTemplate(templateBuffer, lead);

        const slug = lead.company_name
          .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").substring(0, 40);

        const outputPath = `${buildRecord.id}/${slug}-website.zip`;
        await supabase.storage.from("builds").upload(outputPath, outputZip, {
          contentType: "application/zip", upsert: true,
        });

        let outputUrl: string | null = null;
        let deploymentId: string | null = null;

        if (vercelToken) {
          try {
            const citySlug = lead.city.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
            const siteName = `${slug}-${citySlug}`;
            const alias = `${slug}.${CUSTOM_DOMAIN}`;
            const result = await deployToVercel(outputZip, siteName, vercelToken, alias);
            outputUrl = result.url;
            deploymentId = result.deploymentId;
          } catch (e: any) {
            console.error("[DEPLOY ERROR]", lead.company_name, e.message);
          }
        }

        await supabase.from("builds").update({
          status: "done",
          output_path: outputPath,
          output_url: outputUrl,
          netlify_site_id: deploymentId,
          completed_at: new Date().toISOString(),
          error_msg: null,
        }).eq("id", buildRecord.id);

        return {
          build_id: buildRecord.id,
          lead_id: assignment.lead_id,
          template_id: assignment.template_id,
          sector_key: assignment.sector_key,
          company_name: lead.company_name,
          city: lead.city,
          status: "done",
          output_url: outputUrl,
        };
      } catch (err: any) {
        await supabase.from("builds").update({
          status: "failed", error_msg: err.message, completed_at: new Date().toISOString(),
        }).eq("id", buildRecord.id);

        return {
          lead_id: assignment.lead_id,
          template_id: assignment.template_id,
          sector_key: assignment.sector_key,
          company_name: lead?.company_name,
          status: "failed",
          error: err.message,
        };
      }
    })
  );

  const summary_results = results.map((r: any) =>
    r.status === "fulfilled" ? r.value : { status: "failed", error: r.reason?.message }
  );

  const successful = summary_results.filter((r: any) => r.status === "done").length;
  const failed = summary_results.filter((r: any) => r.status === "failed").length;

  const nextBatchOffset = batchStart + BATCH_SIZE < totalLeads ? batchOffset + 1 : null;

  return NextResponse.json({
    success: true,
    batch: {
      offset: batchOffset,
      size: batchAssignments.length,
      total: totalLeads,
      processed_so_far: batchStart + batchAssignments.length,
    },
    summary: { total: batchAssignments.length, successful, failed },
    results: summary_results,
    next_batch_offset: nextBatchOffset,
    done: nextBatchOffset === null,
    // Template performance tracking
    template_stats: uniqueTemplateIds.map(tplId => ({
      template_id: tplId,
      assigned: batchAssignments.filter(a => a.template_id === tplId).length,
      built: summary_results.filter((r: any) => r.template_id === tplId && r.status === "done").length,
    })),
  });
}
