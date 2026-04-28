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
  Hammer, Plus, Building2, Download, RefreshCw,
  Clock, CheckCircle2, XCircle, Loader2, FileCode2,
  Layers, AlertCircle, ExternalLink, Globe,
} from "lucide-react";
import toast from "react-hot-toast";

export default function BuildQueuePage() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBuildOpen, setNewBuildOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [bulkBuilding, setBulkBuilding] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [newBuild, setNewBuild] = useState({ lead_id: "", template_id: "" });
  const [bulkConfig, setBulkConfig] = useState({ template_id: "", lead_ids: [] as string[] });
  const [bulkProgress, setBulkProgress] = useState<null | { total: number; successful: number; failed: number; results?: any[] }>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [buildsRes, leadsRes, templatesRes] = await Promise.all([
      supabase.from("builds").select("*, leads(id, company_name, city, category), templates(id, name, category)").order("created_at", { ascending: false }),
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
    if (!newBuild.lead_id || !newBuild.template_id) { toast.error("Select a lead and template"); return; }
    setBuilding(true);
    try {
      const { data: buildRecord, error: insertErr } = await supabase.from("builds").insert({
        lead_id: newBuild.lead_id, template_id: newBuild.template_id,
        status: "building", started_at: new Date().toISOString()
      }).select().single();
      if (insertErr) throw insertErr;
      setNewBuildOpen(false);
      setNewBuild({ lead_id: "", template_id: "" });
      await fetchAll();
      const res = await fetch("/api/builds/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ buildId: buildRecord.id }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Build failed");
      toast.success(result.outputUrl ? "🌍 Website deployed live!" : "Website built successfully!");
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message ?? "Build failed");
      await fetchAll();
    } finally { setBuilding(false); }
  };

  const handleBulkBuild = async () => {
    if (!bulkConfig.template_id || bulkConfig.lead_ids.length === 0) { toast.error("Select a template and at least one lead"); return; }
    setBulkBuilding(true);
    setBulkProgress(null);
    try {
      const res = await fetch("/api/builds/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template_id: bulkConfig.template_id, lead_ids: bulkConfig.lead_ids }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Bulk build failed");
      setBulkProgress({ ...result.summary, results: result.results });
      toast.success(`🚀 ${result.summary.successful} sites deployed live!`);
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message ?? "Bulk build failed");
    } finally { setBulkBuilding(false); }
  };

  const handleDownload = async (build: Build) => {
    if (!build.output_path) return;
    const { data } = await supabase.storage.from("builds").createSignedUrl(build.output_path, 60);
    if (data?.signedUrl) { const a = document.createElement("a"); a.href = data.signedUrl; a.download = build.output_path.split("/").pop() ?? "website.zip"; a.click(); }
  };

  const filteredBuilds = builds.filter((b) => statusFilter === "all" || b.status === statusFilter);
  const statusCounts = {
    all: builds.length,
    pending: builds.filter((b) => b.status === "pending").length,
    building: builds.filter((b) => b.status === "building").length,
    done: builds.filter((b) => b.status === "done").length,
    failed: builds.filter((b) => b.status === "failed").length,
  };
  const toggleLeadSelection = (id: string) => setBulkConfig((prev) => ({ ...prev, lead_ids: prev.lead_ids.includes(id) ? prev.lead_ids.filter((l) => l !== id) : [...prev.lead_ids, id] }));

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
        description="Generate and deploy websites for your leads automatically"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={fetchAll} size="sm">Refresh</Button>
            <Button variant="secondary" icon={<Layers className="w-3.5 h-3.5" />} onClick={() => setBulkOpen(true)}>Bulk Build</Button>
            <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setNewBuildOpen(true)}>Build Website</Button>
          </div>
        }
      />

      {/* Live Sites Banner */}
      {builds.filter(b => (b as any).output_url).length > 0 && (
        <div className="mb-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Globe className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                {builds.filter(b => (b as any).output_url).length} Live Sites Deployed
              </p>
              <p className="text-xs text-emerald-600">All websites are live and accessible on the internet</p>
            </div>
          </div>
          <a href="/sites" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
            View Gallery <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-5 bg-white border border-surface-200 rounded-xl p-1 w-fit">
        {(["all", "pending", "building", "done", "failed"] as const).map((s) => {
          const meta = s === "all" ? null : BUILD_STATUS_META[s];
          return (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${statusFilter === s ? "bg-surface-100 text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {meta && <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />}
              <span className="capitalize">{s}</span>
              <span className={`text-[10px] px-1 rounded ${statusFilter === s ? "bg-white text-slate-600" : "text-slate-400"}`}>{statusCounts[s]}</span>
            </button>
          );
        })}
      </div>

      <Card padding="none">
        {loading ? (
          <div className="divide-y divide-surface-50">{Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}</div>
        ) : filteredBuilds.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Hammer className="w-5 h-5 text-slate-400" /></div>
            <p className="text-sm font-medium text-slate-600 mb-1">No builds yet</p>
            <p className="text-xs text-slate-400 mb-4">Click "Build Website" or "Bulk Build" to get started</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" icon={<Layers className="w-3.5 h-3.5" />} onClick={() => setBulkOpen(true)}>Bulk Build</Button>
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setNewBuildOpen(true)}>Build Website</Button>
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Business</th><th>Template</th><th>Status</th><th>Live URL</th><th>Duration</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredBuilds.map((build) => {
                const meta = BUILD_STATUS_META[build.status] ?? BUILD_STATUS_META.pending;
                const lead = (build as any).leads;
                const template = (build as any).templates;
                const outputUrl = (build as any).output_url;
                let duration = "—";
                if (build.started_at && build.completed_at) {
                  const ms = new Date(build.completed_at).getTime() - new Date(build.started_at).getTime();
                  duration = `${(ms / 1000).toFixed(1)}s`;
                }
                return (
                  <tr key={build.id} className="group">
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0"><Building2 className="w-4 h-4 text-slate-400" /></div>
                        <div><p className="font-semibold text-slate-800 text-xs">{lead?.company_name ?? "—"}</p><p className="text-slate-400 text-[11px]">{lead?.city}</p></div>
                      </div>
                    </td>
                    <td><div className="flex items-center gap-1.5"><FileCode2 className="w-3.5 h-3.5 text-violet-400" /><span className="text-xs text-slate-600">{template?.name ?? "—"}</span></div></td>
                    <td>
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${meta.bg} ${meta.color}`}>
                        <StatusIcon status={build.status} />{meta.label}
                      </span>
                    </td>
                    <td>
                      {outputUrl ? (
                        <a href={outputUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium">
                          <Globe className="w-3 h-3" />
                          <span className="max-w-[140px] truncate">{outputUrl.replace("https://", "")}</span>
                        </a>
                      ) : build.status === "done" ? (
                        <span className="text-[11px] text-slate-400">ZIP only</span>
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td><span className="text-xs text-slate-400">{duration}</span></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {outputUrl && (
                          <a href={outputUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                            <ExternalLink className="w-3 h-3" /> Visit Site
                          </a>
                        )}
                        {build.output_path && (
                          <button onClick={() => handleDownload(build)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 bg-surface-100 rounded-lg hover:bg-surface-200 transition-colors">
                            <Download className="w-3 h-3" /> ZIP
                          </button>
                        )}
                        {build.status === "failed" && (
                          <span className="text-[11px] text-red-500">{build.error_msg ?? "Failed"}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Single Build Modal */}
      <Modal isOpen={newBuildOpen} onClose={() => setNewBuildOpen(false)} title="Build & Deploy Website"
        footer={<><Button variant="secondary" onClick={() => setNewBuildOpen(false)}>Cancel</Button><Button onClick={handleCreateBuild} loading={building} icon={<Hammer className="w-3.5 h-3.5" />}>Build & Deploy</Button></>}>
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-emerald-700 mb-1">🌍 Auto-Deploy Enabled</p>
            <p className="text-xs text-emerald-600 leading-relaxed">BuildFactory will generate the website AND deploy it live to a unique Netlify URL automatically.</p>
          </div>
          <Select label="Select Lead *" value={newBuild.lead_id} onChange={(e) => setNewBuild((b) => ({ ...b, lead_id: e.target.value }))} options={[{ value: "", label: "— Choose a lead —" }, ...leads.map((l) => ({ value: l.id, label: `${l.company_name} (${l.city})` }))]} />
          <Select label="Select Template *" value={newBuild.template_id} onChange={(e) => setNewBuild((b) => ({ ...b, template_id: e.target.value }))} options={[{ value: "", label: "— Choose a template —" }, ...templates.map((t) => ({ value: t.id, label: `${t.name} [${t.category}]` }))]} />
        </div>
      </Modal>

      {/* Bulk Build Modal */}
      <Modal isOpen={bulkOpen} onClose={() => { setBulkOpen(false); setBulkProgress(null); setBulkConfig({ template_id: "", lead_ids: [] }); }} title="Bulk Build & Deploy" size="lg"
        footer={<><Button variant="secondary" onClick={() => setBulkOpen(false)}>Close</Button><Button onClick={handleBulkBuild} loading={bulkBuilding} icon={<Layers className="w-3.5 h-3.5" />} disabled={!bulkConfig.template_id || bulkConfig.lead_ids.length === 0}>Deploy {bulkConfig.lead_ids.length > 0 ? `${bulkConfig.lead_ids.length} Sites` : "Sites"}</Button></>}>
        <div className="space-y-5">
          {bulkProgress && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-emerald-700 mb-3">🚀 Bulk Deploy Complete!</p>
              <div className="grid grid-cols-3 gap-3 text-center mb-4">
                <div className="bg-white rounded-lg p-2 border border-emerald-100"><p className="text-lg font-bold text-slate-800">{bulkProgress.total}</p><p className="text-[11px] text-slate-500">Total</p></div>
                <div className="bg-white rounded-lg p-2 border border-emerald-100"><p className="text-lg font-bold text-emerald-600">{bulkProgress.successful}</p><p className="text-[11px] text-slate-500">Live</p></div>
                <div className="bg-white rounded-lg p-2 border border-emerald-100"><p className="text-lg font-bold text-red-500">{bulkProgress.failed}</p><p className="text-[11px] text-slate-500">Failed</p></div>
              </div>
              {bulkProgress.results && (
                <div className="space-y-1.5">
                  {bulkProgress.results.filter((r: any) => r.output_url).map((r: any, i: number) => (
                    <a key={i} href={r.output_url} target="_blank" rel="noreferrer"
                      className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-emerald-100 hover:border-emerald-300 transition-colors group">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-xs font-medium text-slate-700">{r.company_name}</span>
                      </div>
                      <span className="text-[11px] text-emerald-600 group-hover:text-emerald-700 flex items-center gap-1">
                        Visit <ExternalLink className="w-2.5 h-2.5" />
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          <Select label="Template to use *" value={bulkConfig.template_id} onChange={(e) => setBulkConfig((b) => ({ ...b, template_id: e.target.value }))} options={[{ value: "", label: "— Choose a template —" }, ...templates.map((t) => ({ value: t.id, label: `${t.name} [${t.category}]` }))]} />
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Select Leads * ({bulkConfig.lead_ids.length} selected)</label>
              <div className="flex gap-2">
                <button onClick={() => setBulkConfig((b) => ({ ...b, lead_ids: leads.map((l) => l.id) }))} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Select all</button>
                <span className="text-slate-300">·</span>
                <button onClick={() => setBulkConfig((b) => ({ ...b, lead_ids: [] }))} className="text-xs text-slate-500 hover:text-slate-700 font-medium">Clear</button>
              </div>
            </div>
            <div className="border border-surface-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              {leads.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No leads available</div> : leads.map((lead) => {
                const selected = bulkConfig.lead_ids.includes(lead.id);
                return (
                  <div key={lead.id} onClick={() => toggleLeadSelection(lead.id)} className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-surface-50 last:border-0 transition-colors ${selected ? "bg-brand-50" : "hover:bg-surface-50"}`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? "bg-brand-600 border-brand-600" : "border-surface-300"}`}>{selected && <span className="text-white text-[10px] font-bold">✓</span>}</div>
                    <div className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0"><Building2 className="w-3.5 h-3.5 text-slate-400" /></div>
                    <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-slate-800 truncate">{lead.company_name}</p><p className="text-[11px] text-slate-400">{lead.city} · {lead.category}</p></div>
                  </div>
                );
              })}
            </div>
          </div>
          {bulkConfig.lead_ids.length > 0 && bulkConfig.template_id && !bulkBuilding && !bulkProgress && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">This will build AND deploy <strong>{bulkConfig.lead_ids.length}</strong> live websites in parallel. Each gets a unique URL.</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
