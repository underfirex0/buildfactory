"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Sparkles, Loader2, Download, Rocket, CheckCircle2, Clock } from "lucide-react";
import toast from "react-hot-toast";

interface AIGenerateButtonProps {
  lead: any;
}

export function AIGenerateButton({ lead }: AIGenerateButtonProps) {
  const [state, setState] = useState<"idle" | "starting" | "generating" | "done" | "error">("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [html, setHtml] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Start elapsed timer
  useEffect(() => {
    if (state === "generating" || state === "starting") {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (state === "idle") setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  // Poll for job status
  useEffect(() => {
    if (!jobId || state !== "generating") return;

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai-status?jobId=${jobId}`);
        const data = await res.json();

        if (data.status === "completed" && data.html) {
          clearInterval(pollingRef.current!);
          setHtml(data.html);
          setState("done");
          setPreviewOpen(true);
          toast.success(`✅ Website ready for ${lead.company_name}! (${elapsed}s)`, { duration: 5000 });
        } else if (data.status === "failed") {
          clearInterval(pollingRef.current!);
          setState("error");
          toast.error("Generation failed: " + (data.error || "Unknown error"));
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 3000);

    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [jobId, state]);

  const handleGenerate = async () => {
    setState("starting");
    setElapsed(0);
    toast.loading(`🤖 Starting AI generation for ${lead.company_name}...`, { id: "ai-start" });

    try {
      const res = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        toast.error("Server error", { id: "ai-start" });
        setState("idle");
        return;
      }

      if (data.success && data.jobId) {
        setJobId(data.jobId);
        setState("generating");
        toast.success("🚀 Claude Sonnet is designing your website...", { id: "ai-start", duration: 3000 });
      } else {
        toast.error(data.error || "Failed to start", { id: "ai-start" });
        setState("idle");
      }
    } catch (e: any) {
      toast.error("Error: " + e.message, { id: "ai-start" });
      setState("idle");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lead.company_name.toLowerCase().replace(/\s+/g, "-")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeploy = async () => {
    setDeploying(true);
    toast.loading("🚀 Deploying to yako.studio...", { id: "deploy" });

    try {
      const res = await fetch("/api/ai-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, html }),
      });

      const text = await res.text();
      const data = JSON.parse(text);

      if (data.success) {
        toast.success(`🎉 Live at ${data.url}!`, { id: "deploy", duration: 10000 });
        window.open(data.url, "_blank");
        setPreviewOpen(false);
        setState("idle");
      } else {
        toast.error(data.error || "Deploy failed", { id: "deploy" });
      }
    } catch (e: any) {
      toast.error("Deploy error: " + e.message, { id: "deploy" });
    }

    setDeploying(false);
  };

  const getButtonContent = () => {
    switch (state) {
      case "starting":
        return <><Loader2 className="w-3 h-3 animate-spin" /> Starting...</>;
      case "generating":
        return <><Loader2 className="w-3 h-3 animate-spin" /> Generating... {elapsed}s</>;
      case "done":
        return <><CheckCircle2 className="w-3 h-3" /> View Website</>;
      case "error":
        return <><Sparkles className="w-3 h-3" /> Retry AI Generate</>;
      default:
        return <><Sparkles className="w-3 h-3" /> AI Generate</>;
    }
  };

  const getButtonClass = () => {
    const base = "flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all ";
    switch (state) {
      case "done":
        return base + "text-green-700 bg-green-50 border border-green-200 hover:bg-green-100";
      case "error":
        return base + "text-red-700 bg-red-50 border border-red-200 hover:bg-red-100";
      case "generating":
      case "starting":
        return base + "text-purple-700 bg-purple-50 border border-purple-200 opacity-80 cursor-wait";
      default:
        return base + "text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100";
    }
  };

  return (
    <>
      <button
        onClick={state === "done" ? () => setPreviewOpen(true) : state === "idle" || state === "error" ? handleGenerate : undefined}
        disabled={state === "starting" || state === "generating"}
        className={getButtonClass()}
      >
        {getButtonContent()}
      </button>

      {/* Generating indicator */}
      {state === "generating" && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-purple-500/30 rounded-2xl p-4 shadow-2xl flex items-center gap-3 max-w-sm">
          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Claude Sonnet is working...</p>
            <p className="text-xs text-slate-400">{lead.company_name} • {elapsed}s elapsed</p>
            <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden w-48">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min((elapsed / 90) * 100, 95)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <Modal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={`✅ AI Website — ${lead.company_name}`}
        size="xl"
        footer={
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 border border-surface-200 px-4 py-2 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" /> Download HTML
            </button>
            <div className="flex-1" />
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>Close</Button>
            <Button
              onClick={handleDeploy}
              loading={deploying}
              icon={<Rocket className="w-4 h-4" />}
              className="bg-green-600 hover:bg-green-700 border-0"
            >
              Deploy to yako.studio
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-500">Generated in ~{elapsed}s with Claude Sonnet</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{Math.round(html.length / 1024)}KB</span>
              <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                100% Unique
              </span>
            </div>
          </div>

          <div className="border border-surface-200 rounded-xl overflow-hidden bg-white" style={{ height: "65vh" }}>
            <iframe
              srcDoc={html}
              className="w-full h-full"
              title={`${lead.company_name} Website Preview`}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>

          <p className="text-xs text-slate-400 text-center">
            Live preview — scroll to see all sections. Click Deploy to make it live instantly.
          </p>
        </div>
      </Modal>
    </>
  );
}
