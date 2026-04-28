"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/Header";
import { supabase } from "@/lib/supabase";
import { formatDateRelative } from "@/lib/utils";
import { Globe, ExternalLink, Building2, Search, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import toast from "react-hot-toast";

interface LiveSite {
  id: string;
  output_url: string;
  output_path: string;
  created_at: string;
  completed_at: string;
  leads: { company_name: string; city: string; category: string };
  templates: { name: string };
}

export default function SitesPage() {
  const [sites, setSites] = useState<LiveSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchSites = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("builds")
      .select("id, output_url, output_path, created_at, completed_at, leads(company_name, city, category), templates(name)")
      .eq("status", "done")
      .not("output_url", "is", null)
      .order("completed_at", { ascending: false });
    setSites((data ?? []) as unknown as LiveSite[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  const handleDownload = async (site: LiveSite) => {
    if (!site.output_path) return;
    const { data } = await supabase.storage.from("builds").createSignedUrl(site.output_path, 60);
    if (data?.signedUrl) { const a = document.createElement("a"); a.href = data.signedUrl; a.download = `${site.leads?.company_name ?? "website"}.zip`; a.click(); }
    else toast.error("Download failed");
  };

  const filtered = sites.filter(s =>
    !search ||
    s.leads?.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.leads?.city?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Live Sites"
        description="All deployed websites — live on the internet"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={fetchSites}>
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Live Sites", value: sites.length, icon: Globe, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Cities Covered", value: new Set(sites.map(s => s.leads?.city)).size, icon: Building2, color: "text-brand-600", bg: "bg-brand-50" },
          { label: "This Week", value: sites.filter(s => new Date(s.completed_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length, icon: ExternalLink, color: "text-violet-600", bg: "bg-violet-50" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-surface-200 p-5 shadow-card">
            <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-slate-900 mb-0.5">{stat.value}</p>
            <p className="text-xs text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Search sites..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      {/* Sites Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-surface-200 h-48 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-200 p-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
            <Globe className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-600 mb-1">
            {search ? "No sites match your search" : "No live sites yet"}
          </p>
          <p className="text-xs text-slate-400">
            Build websites from the Build Queue to see them here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((site) => (
            <div key={site.id} className="bg-white rounded-xl border border-surface-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 overflow-hidden group">
              {/* Preview iframe */}
              <div className="relative h-36 bg-surface-100 overflow-hidden">
                <iframe
                  src={site.output_url}
                  className="w-full h-full scale-[0.5] origin-top-left pointer-events-none"
                  style={{ width: "200%", height: "200%" }}
                  sandbox="allow-scripts allow-same-origin"
                  title={site.leads?.company_name}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/20" />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors flex items-center justify-center">
                  <a
                    href={site.output_url}
                    target="_blank"
                    rel="noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-slate-900 text-xs font-semibold px-4 py-2 rounded-lg shadow-lg flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Site
                  </a>
                </div>
              </div>

              {/* Card info */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{site.leads?.company_name}</p>
                    <p className="text-[11px] text-slate-400">{site.leads?.city} · {site.leads?.category}</p>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                </div>

                <p className="text-[10px] text-slate-400 truncate mb-3">{site.output_url}</p>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{formatDateRelative(site.completed_at)}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDownload(site)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-surface-100 transition-colors"
                      title="Download ZIP"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={site.output_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Visit
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
