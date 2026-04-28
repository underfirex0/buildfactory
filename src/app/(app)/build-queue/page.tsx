"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { supabase } from "@/lib/supabase";
import { BUILD_STATUS_META, formatDateRelative } from "@/lib/utils";
import type { Build, Lead, Template } from "@/types";
import {
  Hammer,
  Plus,
  Building2,
  Download,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  FileCode2,
  Search,
  Filter,
} from "lucide-react";
import toast from "react-hot-toast";

export default function BuildQueuePage() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBuildOpen, setNewBuildOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [newBuild, setNewBuild] = useState({ lead_id: "", template_id: "" });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [buildsRes, leadsRes, templatesRes] = await Promise.all([
      supabase
        .from("builds")
        .select("*, leads(id, company_name, city, category), templates(id, name, category)")
        .order("created_at", { ascending: false }),
      supabase.from("leads").select("id, company_name, city, category").order("company_name"),
      supabase.from("templates").select("id, name, category").order("name"),
    ]);

    setBuilds((buildsRes.data ?? []) as Build[]);
    setLeads((leadsRes.data ?? []) as Lead[]);
    setTemplates((templatesRes.data ?? []) as Template[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreateBuild = async () => {
    if (!newBuild.lead_id || !newBuild.template_id) {
      toast.error("Select a lead and template");
      return;
    }

    setBuilding(true);
    try {
      // 1. Create build record with 'building' status
      const { data: buildRecord, error: insertErr } = await supabase
        .from("builds")
        .insert({
          lead_id: newBuild.lead_id,
          template_id: newBuild.template_id,
          status: "building",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setNewBuildOpen(false);
      setNewBuild({ lead_id: "", template_id: "" });
      await fetchAll();

      // 2. Call build API route
      const res = await fetch("/api/builds/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildId: buildRecord.id }),
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result.error ?? "Build failed");

      toast.success("Website built successfully!");
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message ?? "Build failed");
      await fetchAll();
    } finally {
      setBuilding(false);
    }
  };

  const handleDownload = async (build: Build) => {
    if (!build.output_path) return;
    const { data } = await supabase.storage
      .from("builds")
      .createSignedUrl(build.output_path, 60);

    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = build.output_path.split("/").pop() ?? "website.zip";
      a.click();
    }
  };

  const filteredBuilds = builds.filter(
    (b) => statusFilter === "all" || b.status === statusFilter
  );

  const statusCounts = {
    all: builds.length,
    pending: builds.filter((b) => b.status === "pending").length,
    building: builds.filter((b) => b.status === "building").length,
    done: builds.filter((b) => b.status === "done").length,
    failed: builds.filter((b) => b.status === "failed").length,
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "done") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-500" />;
    if (status === "building") return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    return <Clock className="w-4 h-4 text-amber-500" />;
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Build Queue"
        description="Generate and download website packages for your leads"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={fetchAll}
              size="sm"
            >
              Refresh
            </Button>
            <Button
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setNewBuildOpen(true)}
            >
              Build Website
            </Button>
          </div>
        }
      />

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-5 bg-white border border-surface-200 rounded-xl p-1 w-fit">
        {(["all", "pending", "building", "done", "failed"] as const).map((s) => {
          const meta = s === "all" ? null : BUILD_STATUS_META[s];
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === s
                  ? "bg-surface-100 text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {meta && <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />}
              <span className="capitalize">{s}</span>
              <span className={`text-[10px] px-1 rounded ${statusFilter === s ? "bg-white text-slate-600" : "text-slate-400"}`}>
                {statusCounts[s]}
              </span>
            </button>
          );
        })}
      </div>

      <Card padding="none">
        {loading ? (
          <div className="divide-y divide-surface-50">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filteredBuilds.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Hammer className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">No builds yet</p>
            <p className="text-xs text-slate-400 mb-4">
              Click "Build Website" to generate your first site
            </p>
            <Button
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setNewBuildOpen(true)}
            >
              Build Website
            </Button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Template</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBuilds.map((build) => {
                const meta = BUILD_STATUS_META[build.status] ?? BUILD_STATUS_META.pending;
                const lead = (build as any).leads;
                const template = (build as any).templates;

                let duration = "—";
                if (build.started_at && build.completed_at) {
                  const ms =
                    new Date(build.completed_at).getTime() -
                    new Date(build.started_at).getTime();
                  duration = `${(ms / 1000).toFixed(1)}s`;
                }

                return (
                  <tr key={build.id} className="group">
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">
                            {lead?.company_name ?? "—"}
                          </p>
                          <p className="text-slate-400 text-[11px]">{lead?.city}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <FileCode2 className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-xs text-slate-600">{template?.name ?? "—"}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${meta.bg} ${meta.color}`}
                      >
                        <StatusIcon status={build.status} />
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-slate-400">{duration}</span>
                    </td>
                    <td>
                      <span className="text-xs text-slate-400">
                        {formatDateRelative(build.created_at)}
                      </span>
                    </td>
                    <td>
                      {build.status === "done" && build.output_path ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Download className="w-3 h-3" />}
                          onClick={() => handleDownload(build)}
                        >
                          Download
                        </Button>
                      ) : build.status === "failed" ? (
                        <span className="text-[11px] text-red-500 truncate max-w-[140px] block" title={build.error_msg ?? ""}>
                          {build.error_msg ?? "Unknown error"}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* New Build Modal */}
      <Modal
        isOpen={newBuildOpen}
        onClose={() => setNewBuildOpen(false)}
        title="Build Website"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewBuildOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateBuild}
              loading={building}
              icon={<Hammer className="w-3.5 h-3.5" />}
            >
              Start Build
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-brand-700 mb-1">How it works</p>
            <p className="text-xs text-brand-600 leading-relaxed">
              Select a lead and a matching template. BuildFactory will replace all
              placeholders with the lead's data and generate a downloadable ZIP package.
            </p>
          </div>

          <Select
            label="Select Lead *"
            value={newBuild.lead_id}
            onChange={(e) => setNewBuild((b) => ({ ...b, lead_id: e.target.value }))}
            options={[
              { value: "", label: "— Choose a lead —" },
              ...leads.map((l) => ({
                value: l.id,
                label: `${l.company_name} (${l.city})`,
              })),
            ]}
          />

          <Select
            label="Select Template *"
            value={newBuild.template_id}
            onChange={(e) => setNewBuild((b) => ({ ...b, template_id: e.target.value }))}
            options={[
              { value: "", label: "— Choose a template —" },
              ...templates.map((t) => ({
                value: t.id,
                label: `${t.name} [${t.category}]`,
              })),
            ]}
          />

          {newBuild.lead_id && newBuild.template_id && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-xs text-emerald-700 font-medium">
                ✓ Ready to build
              </p>
              <p className="text-[11px] text-emerald-600 mt-0.5">
                The template's placeholders will be filled with lead data and packaged as a ZIP.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}