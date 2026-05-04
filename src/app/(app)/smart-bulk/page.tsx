"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import type { Lead, Template } from "@/types";
import {
  Zap, Building2, FileCode2, CheckCircle2, XCircle,
  Loader2, ChevronDown, ChevronUp, RefreshCw,
  Globe, AlertCircle, BarChart2, Layers,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Sector config ──────────────────────────────────────────────────────────
const SECTORS = [
  { key: "gym",    label: "Gyms & Fitness",  emoji: "💪", keywords: ["gym", "fitness", "sport", "musculation", "salle"] },
  { key: "salon",  label: "Salons & Beauty", emoji: "💇", keywords: ["salon", "coiffure", "beauté", "beauty", "hammam", "spa"] },
  { key: "lavage", label: "Lavage Auto",     emoji: "🚗", keywords: ["lavage", "auto", "car wash", "voiture"] },
  { key: "resto",  label: "Restaurants",     emoji: "🍽️", keywords: ["restaurant", "café", "snack", "pizza", "burger"] },
];

function detectSector(category: string): string {
  const cat = category.toLowerCase();
  for (const s of SECTORS) {
    if (s.keywords.some(k => cat.includes(k))) return s.key;
  }
  return "other";
}

interface SectorConfig {
  sector_key: string;
  enabled: boolean;
  lead_ids: string[];
  template_ids: string[];
  onlyNoSite: boolean;
}

interface BatchResult {
  batch_offset: number;
  successful: number;
  failed: number;
  size: number;
  results: any[];
}

interface TemplateStats {
  template_id: string;
  template_name: string;
  total_built: number;
  total_assigned: number;
}

export default function SmartBulkPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSector, setExpandedSector] = useState<string | null>("gym");

  // Sector configs
  const [sectorConfigs, setSectorConfigs] = useState<Record<string, SectorConfig>>(
    Object.fromEntries(SECTORS.map(s => [s.key, {
      sector_key: s.key, enabled: false,
      lead_ids: [], template_ids: [], onlyNoSite: true,
    }]))
  );

  // Build state
  const [running, setRunning] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [done, setDone] = useState(false);
  const [templateStats, setTemplateStats] = useState<TemplateStats[]>([]);
  const abortRef = useRef(false);

  // ─── Fetch data ────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [leadsRes, tplRes, buildsRes] = await Promise.all([
      supabase.from("leads").select("id,company_name,city,category,phone,website").order("company_name"),
      supabase.from("templates").select("id,name,category").order("name"),
      supabase.from("builds").select("lead_id").eq("status", "done"),
    ]);

    const builtIds = new Set((buildsRes.data ?? []).map((b: any) => b.lead_id));
    const leadsData = (leadsRes.data ?? []) as Lead[];
    setLeads(leadsData);
    setTemplates((tplRes.data ?? []) as Template[]);

    // Auto-populate lead_ids per sector
    setSectorConfigs(prev => {
      const next = { ...prev };
      for (const sector of SECTORS) {
        const sectorLeads = leadsData.filter(l => detectSector(l.category) === sector.key);
        const cfg = next[sector.key];
        next[sector.key] = {
          ...cfg,
          lead_ids: sectorLeads
            .filter(l => cfg.onlyNoSite ? (!builtIds.has(l.id) && !(l as any).website) : true)
            .map(l => l.id),
        };
      }
      return next;
    });

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Recompute lead_ids when onlyNoSite changes
  const updateSectorFilter = (sectorKey: string, onlyNoSite: boolean) => {
    const builtIds = new Set(
      leads.filter(l => (l as any).status === "done").map(l => l.id)
    );
    const sectorLeads = leads.filter(l => detectSector(l.category) === sectorKey);
    const lead_ids = sectorLeads
      .filter(l => onlyNoSite ? !(l as any).website : true)
      .map(l => l.id);
    updateConfig(sectorKey, { onlyNoSite, lead_ids });
  };

  const updateConfig = (sectorKey: string, patch: Partial<SectorConfig>) => {
    setSectorConfigs(prev => ({ ...prev, [sectorKey]: { ...prev[sectorKey], ...patch } }));
  };

  const toggleTemplate = (sectorKey: string, tplId: string) => {
    const cfg = sectorConfigs[sectorKey];
    const has = cfg.template_ids.includes(tplId);
    updateConfig(sectorKey, {
      template_ids: has ? cfg.template_ids.filter(id => id !== tplId) : [...cfg.template_ids, tplId],
    });
  };

  // ─── Summary ───────────────────────────────────────────────────────────────
  const enabledSectors = SECTORS.filter(s => sectorConfigs[s.key].enabled);
  const totalLeads = enabledSectors.reduce((acc, s) => acc + sectorConfigs[s.key].lead_ids.length, 0);
  const totalBatchCount = Math.ceil(totalLeads / 50);
  const totalBuilt = batchResults.reduce((acc, b) => acc + b.successful, 0);
  const totalFailed = batchResults.reduce((acc, b) => acc + b.failed, 0);

  // ─── Validate ──────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (enabledSectors.length === 0) return "Enable at least one sector";
    for (const s of enabledSectors) {
      const cfg = sectorConfigs[s.key];
      if (cfg.template_ids.length === 0) return `Select at least one template for ${s.label}`;
      if (cfg.lead_ids.length === 0) return `No leads found for ${s.label}`;
    }
    return null;
  };

  // ─── Build ─────────────────────────────────────────────────────────────────
  const handleBuild = async (startOffset = 0) => {
    const err = validate();
    if (err) { toast.error(err); return; }

    setRunning(true);
    setDone(false);
    abortRef.current = false;
    if (startOffset === 0) {
      setBatchResults([]);
      setTemplateStats([]);
      setCurrentBatch(0);
      setTotalBatches(totalBatchCount);
    }

    const sectors = enabledSectors.map(s => ({
      sector_key: s.key,
      lead_ids: sectorConfigs[s.key].lead_ids,
      template_ids: sectorConfigs[s.key].template_ids,
    }));

    let offset = startOffset;

    while (true) {
      if (abortRef.current) {
        toast("Stopped.");
        break;
      }

      setCurrentBatch(offset + 1);

      try {
        const res = await fetch("/api/builds/smart-bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectors, batch_offset: offset }),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error ?? "Batch failed");

        setBatchResults(prev => [...prev, {
          batch_offset: offset,
          successful: data.summary.successful,
          failed: data.summary.failed,
          size: data.summary.total,
          results: data.results ?? [],
        }]);

        // Update template stats
        if (data.template_stats) {
          setTemplateStats(prev => {
            const map = new Map(prev.map(t => [t.template_id, t]));
            for (const stat of data.template_stats) {
              const tpl = templates.find(t => t.id === stat.template_id);
              const existing = map.get(stat.template_id);
              map.set(stat.template_id, {
                template_id: stat.template_id,
                template_name: tpl?.name ?? stat.template_id,
                total_built: (existing?.total_built ?? 0) + stat.built,
                total_assigned: (existing?.total_assigned ?? 0) + stat.assigned,
              });
            }
            return Array.from(map.values());
          });
        }

        if (data.done || data.next_batch_offset === null) {
          setDone(true);
          toast.success(`✅ All done! ${totalBuilt + data.summary.successful} sites built.`);
          break;
        }

        offset = data.next_batch_offset;
      } catch (e: any) {
        toast.error(`Batch ${offset + 1} failed: ${e.message}`);
        break;
      }
    }

    setRunning(false);
  };

  const handleStop = () => { abortRef.current = true; };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="animate-fade-in max-w-5xl">
      <PageHeader
        title="⚡ Smart Bulk Build"
        description="Multi-sector, multi-template bulk builder with round-robin assignment"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={fetchAll}>Refresh</Button>
            {running ? (
              <Button variant="danger" onClick={handleStop} icon={<XCircle className="w-3.5 h-3.5" />}>Stop</Button>
            ) : (
              <Button
                onClick={() => handleBuild(0)}
                disabled={enabledSectors.length === 0}
                icon={<Zap className="w-3.5 h-3.5" />}
                className="bg-brand-600 hover:bg-brand-700"
              >
                Build {totalLeads > 0 ? `${totalLeads} Sites` : ""}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card padding="sm">
          <p className="text-xs text-slate-500 mb-1">Total leads selected</p>
          <p className="text-2xl font-bold text-slate-900">{totalLeads}</p>
          <p className="text-[11px] text-slate-400">{totalBatchCount} batches of 50</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500 mb-1">Built so far</p>
          <p className="text-2xl font-bold text-emerald-600">{totalBuilt}</p>
          {totalFailed > 0 && <p className="text-[11px] text-red-500">{totalFailed} failed</p>}
        </Card>
        <Card padding="sm">
          <p className="text-xs text-slate-500 mb-1">Progress</p>
          <p className="text-2xl font-bold text-slate-900">{running ? `Batch ${currentBatch}/${totalBatchCount}` : done ? "Done ✅" : "Ready"}</p>
          {running && (
            <div className="mt-2 h-1.5 bg-surface-200 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${Math.round((currentBatch / totalBatchCount) * 100)}%` }} />
            </div>
          )}
        </Card>
      </div>

      {/* Sector configs */}
      <div className="space-y-3 mb-6">
        {SECTORS.map(sector => {
          const cfg = sectorConfigs[sector.key];
          const isExpanded = expandedSector === sector.key;
          const sectorLeads = leads.filter(l => detectSector(l.category) === sector.key);
          const sectorTemplates = templates; // show all templates, let user pick

          return (
            <Card key={sector.key} padding="none" className={`overflow-hidden transition-all ${cfg.enabled ? "border-brand-200" : ""}`}>
              {/* Header */}
              <div
                className={`flex items-center gap-4 px-5 py-4 cursor-pointer ${cfg.enabled ? "bg-brand-50" : "bg-white"}`}
                onClick={() => setExpandedSector(isExpanded ? null : sector.key)}
              >
                {/* Enable toggle */}
                <div onClick={e => { e.stopPropagation(); updateConfig(sector.key, { enabled: !cfg.enabled }); }}>
                  <div className={`w-10 h-6 rounded-full transition-colors relative ${cfg.enabled ? "bg-brand-600" : "bg-slate-200"}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${cfg.enabled ? "left-5" : "left-1"}`} />
                  </div>
                </div>

                <span className="text-2xl">{sector.emoji}</span>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${cfg.enabled ? "text-brand-700" : "text-slate-700"}`}>{sector.label}</p>
                  <p className="text-[11px] text-slate-400">
                    {cfg.lead_ids.length} leads · {cfg.template_ids.length} templates selected
                    {cfg.template_ids.length > 0 && cfg.lead_ids.length > 0 && (
                      <span className="ml-2 text-brand-500">→ round-robin across {cfg.template_ids.length} template{cfg.template_ids.length > 1 ? "s" : ""}</span>
                    )}
                  </p>
                </div>

                {cfg.enabled && cfg.lead_ids.length > 0 && cfg.template_ids.length > 0 && (
                  <span className="text-[11px] bg-brand-100 text-brand-700 px-2 py-1 rounded-full font-semibold">
                    ~{Math.ceil(cfg.lead_ids.length / 50)} batch{Math.ceil(cfg.lead_ids.length / 50) > 1 ? "es" : ""}
                  </span>
                )}

                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>

              {/* Expanded config */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-surface-100 space-y-4 pt-4">

                  {/* Lead filter */}
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">Leads ({sectorLeads.length} total in this sector)</p>
                    <div className="flex gap-2">
                      <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-all ${cfg.onlyNoSite ? "border-brand-400 bg-brand-50 text-brand-700" : "border-surface-200 text-slate-600"}`}>
                        <input type="radio" name={`filter-${sector.key}`} checked={cfg.onlyNoSite} onChange={() => updateSectorFilter(sector.key, true)} />
                        Without website ({sectorLeads.filter(l => !(l as any).website).length})
                      </label>
                      <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-all ${!cfg.onlyNoSite ? "border-brand-400 bg-brand-50 text-brand-700" : "border-surface-200 text-slate-600"}`}>
                        <input type="radio" name={`filter-${sector.key}`} checked={!cfg.onlyNoSite} onChange={() => updateSectorFilter(sector.key, false)} />
                        All leads ({sectorLeads.length})
                      </label>
                    </div>
                  </div>

                  {/* Template selection */}
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">
                      Templates <span className="text-slate-400 font-normal">(select multiple → round-robin)</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {sectorTemplates.map(tpl => {
                        const selected = cfg.template_ids.includes(tpl.id);
                        const assignedCount = cfg.lead_ids.length > 0 && cfg.template_ids.length > 0
                          ? (selected
                            ? Math.ceil(cfg.lead_ids.length / cfg.template_ids.length)
                            : 0)
                          : 0;
                        return (
                          <div
                            key={tpl.id}
                            onClick={() => toggleTemplate(sector.key, tpl.id)}
                            className={`flex items-center gap-2.5 p-2.5 rounded-lg border-2 cursor-pointer transition-all ${selected ? "border-brand-500 bg-brand-50" : "border-surface-200 hover:border-surface-300"}`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? "bg-brand-600 border-brand-600" : "border-slate-300"}`}>
                              {selected && <span className="text-white text-[10px] font-bold">✓</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium truncate ${selected ? "text-brand-700" : "text-slate-700"}`}>{tpl.name}</p>
                              <p className="text-[10px] text-slate-400">{tpl.category}</p>
                            </div>
                            {selected && assignedCount > 0 && (
                              <span className="text-[10px] text-brand-600 font-semibold flex-shrink-0">~{assignedCount}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Round-robin preview */}
                  {cfg.template_ids.length > 1 && cfg.lead_ids.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <p className="text-[11px] font-semibold text-slate-600 mb-2">Round-robin assignment preview:</p>
                      <div className="space-y-1">
                        {cfg.template_ids.map((tplId, i) => {
                          const tpl = templates.find(t => t.id === tplId);
                          const count = Math.floor(cfg.lead_ids.length / cfg.template_ids.length) + (i < cfg.lead_ids.length % cfg.template_ids.length ? 1 : 0);
                          return (
                            <div key={tplId} className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400 w-4">{i + 1}.</span>
                              <span className="text-[11px] text-slate-700 flex-1 truncate">{tpl?.name ?? tplId}</span>
                              <span className="text-[11px] font-semibold text-brand-600">{count} leads</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Validation warning */}
      {enabledSectors.length > 0 && validate() && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">{validate()}</p>
        </div>
      )}

      {/* Build summary + continue button */}
      {!done && batchResults.length > 0 && !running && (
        <div className="mb-5 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-blue-700 mb-2">Batch {currentBatch}/{totalBatchCount} complete — {totalBuilt} sites built so far</p>
          <Button onClick={() => handleBuild(currentBatch)} icon={<Zap className="w-3.5 h-3.5" />}>
            Continue — Build Next Batch
          </Button>
        </div>
      )}

      {/* Template performance stats */}
      {templateStats.length > 0 && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-brand-600" />
            <p className="text-sm font-semibold text-slate-700">Template Assignment Stats</p>
            <p className="text-xs text-slate-400 ml-auto">WA reply rate tracked in CRM</p>
          </div>
          <div className="space-y-2">
            {templateStats.map(stat => (
              <div key={stat.template_id} className="flex items-center gap-3">
                <div className="w-32 flex-shrink-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{stat.template_name}</p>
                </div>
                <div className="flex-1 h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full"
                    style={{ width: `${stat.total_assigned > 0 ? (stat.total_built / stat.total_assigned) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-slate-600 w-20 text-right">
                  {stat.total_built}/{stat.total_assigned} built
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Batch results log */}
      {batchResults.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Batch Log</p>
          {batchResults.map((b, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-white border border-surface-200 rounded-lg">
              <span className="text-xs text-slate-400">Batch {b.batch_offset + 1}</span>
              <span className="text-xs font-medium text-slate-700">{b.size} leads</span>
              <span className="text-xs text-emerald-600 font-semibold ml-auto">{b.successful} ✅</span>
              {b.failed > 0 && <span className="text-xs text-red-500">{b.failed} ❌</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
