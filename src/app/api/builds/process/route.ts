import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { processTemplate } from "@/lib/build-engine";

export const maxDuration = 60; // Vercel max for hobby plan

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

  try {
    // 1. Fetch build with lead + template
    const { data: build, error: buildErr } = await supabase
      .from("builds")
      .select("*, leads(*), templates(*)")
      .eq("id", buildId)
      .single();

    if (buildErr || !build) {
      throw new Error("Build record not found");
    }

    const lead = (build as any).leads;
    const template = (build as any).templates;

    if (!lead) throw new Error("Lead not found");
    if (!template) throw new Error("Template not found");

    // 2. Download template ZIP from Storage
    const { data: fileData, error: storageErr } = await supabase.storage
      .from("templates")
      .download(template.file_path);

    if (storageErr || !fileData) {
      throw new Error(`Failed to fetch template file: ${storageErr?.message}`);
    }

    const templateBuffer = await fileData.arrayBuffer();

    // 3. Process template → replace placeholders
    const outputZip = await processTemplate(templateBuffer, lead);

    // 4. Upload output ZIP to builds bucket
    const outputPath = `${buildId}/${lead.company_name
      .toLowerCase()
      .replace(/\s+/g, "-")}-website.zip`;

    const { error: uploadErr } = await supabase.storage
      .from("builds")
      .upload(outputPath, outputZip, {
        contentType: "application/zip",
        upsert: true,
      });

    if (uploadErr) throw new Error(`Failed to upload output: ${uploadErr.message}`);

    // 5. Mark build as done
    await supabase
      .from("builds")
      .update({
        status: "done",
        output_path: outputPath,
        completed_at: new Date().toISOString(),
        error_msg: null,
      })
      .eq("id", buildId);

    return NextResponse.json({ success: true, outputPath });
  } catch (err: any) {
    // Mark build as failed
    await supabase
      .from("builds")
      .update({
        status: "failed",
        error_msg: err.message ?? "Unknown error",
        completed_at: new Date().toISOString(),
      })
      .eq("id", buildId);

    console.error("[BUILD ERROR]", buildId, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
