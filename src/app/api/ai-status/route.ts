import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const jobId = req.nextUrl.searchParams.get("jobId");

  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const { data: job } = await supabase
    .from("ai_generations")
    .select("id, status, html, error, created_at, completed_at")
    .eq("id", jobId)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    html: job.status === "completed" ? job.html : null,
    error: job.error,
    createdAt: job.created_at,
    completedAt: job.completed_at,
  });
}
