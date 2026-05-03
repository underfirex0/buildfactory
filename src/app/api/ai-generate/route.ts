import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const maxDuration = 60;

const VM_URL = process.env.NEXT_PUBLIC_WA_SERVER_URL || "http://136.117.247.136:3001";
const API_KEY = process.env.NEXT_PUBLIC_WA_API_KEY || "buildfactory-secret-key";

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  try {
    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    // Fetch lead with all enriched data
    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (error || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    console.log(`[AI Gen] Starting generation for ${lead.company_name}`);

    // Create job in Supabase
    const { data: job } = await supabase
      .from("ai_generations")
      .insert({ lead_id: leadId, status: "generating" })
      .select()
      .single();

    if (!job) return NextResponse.json({ error: "Failed to create job" }, { status: 500 });

    // Call VM to generate website (VM responds immediately, generates in background)
    const vmRes = await fetch(`${VM_URL}/generate-website?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ jobId: job.id, lead }),
      signal: AbortSignal.timeout(15000), // 15s timeout just for starting the job
    });

    if (!vmRes.ok) {
      const err = await vmRes.text();
      await supabase.from("ai_generations").update({ status: "failed", error: err }).eq("id", job.id);
      return NextResponse.json({ error: "VM error: " + err.slice(0, 200) }, { status: 500 });
    }

    console.log(`[AI Gen] Job ${job.id} started on VM`);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Generation started on VM",
    });

  } catch (e: any) {
    console.error("[AI Gen] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
