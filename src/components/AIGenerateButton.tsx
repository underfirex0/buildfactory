// Add this component to your leads page or build queue
// It adds an "AI Generate" button per lead that generates a custom website

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Sparkles, Loader2, Eye, Rocket, Download } from "lucide-react";
import toast from "react-hot-toast";

interface AIGenerateButtonProps {
  lead: any;
  onGenerated?: (html: string) => void;
}

export function AIGenerateButton({ lead, onGenerated }: AIGenerateButtonProps) {
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [deploying, setDeploying] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    toast.loading(`🤖 Claude is designing ${lead.company_name}'s website...`, { id: "ai-gen", duration: 90000 });

    try {
      const res = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });

      const data = await res.json();

      if (data.success) {
        setGeneratedHtml(data.html);
        setPreviewOpen(true);
        toast.success(`✅ Website generated for ${lead.company_name}!`, { id: "ai-gen" });
        onGenerated?.(data.html);
      } else {
        toast.error(data.error || "Generation failed", { id: "ai-gen" });
      }
    } catch (e: any) {
      toast.error("Generation failed: " + e.message, { id: "ai-gen" });
    }

    setGenerating(false);
  };

  const handleDownload = () => {
    const blob = new Blob([generatedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lead.company_name.toLowerCase().replace(/\s+/g, "-")}-website.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeploy = async () => {
    setDeploying(true);
    toast.loading("Deploying to yako.studio...", { id: "deploy" });

    try {
      // Save HTML to Supabase as template, then deploy
      const res = await fetch("/api/ai-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, html: generatedHtml }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(`🚀 Live at ${data.url}!`, { id: "deploy", duration: 10000 });
        setPreviewOpen(false);
      } else {
        toast.error(data.error || "Deploy failed", { id: "deploy" });
      }
    } catch (e: any) {
      toast.error("Deploy failed", { id: "deploy" });
    }

    setDeploying(false);
  };

  return (
    <>
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
      >
        {generating ? (
          <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
        ) : (
          <><Sparkles className="w-3 h-3" /> AI Generate</>
        )}
      </button>

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
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 border border-surface-200 px-4 py-2 rounded-lg"
            >
              <Download className="w-4 h-4" /> Download HTML
            </button>
            <div className="flex-1" />
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>Close</Button>
            <Button
              onClick={handleDeploy}
              loading={deploying}
              icon={<Rocket className="w-4 h-4" />}
              className="bg-green-600 hover:bg-green-700"
            >
              Deploy to yako.studio
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Claude generated {Math.round(generatedHtml.length / 1000)}KB of custom HTML
            </p>
            <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
              100% Unique
            </span>
          </div>

          {/* Live Preview */}
          <div className="border border-surface-200 rounded-xl overflow-hidden" style={{ height: "600px" }}>
            <iframe
              srcDoc={generatedHtml}
              className="w-full h-full"
              title="Website Preview"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>

          <p className="text-xs text-slate-400 text-center">
            Preview may differ slightly from deployed version. Click "Deploy" to make it live instantly.
          </p>
        </div>
      </Modal>
    </>
  );
}
