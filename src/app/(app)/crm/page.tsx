"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import {
  Snowflake, Zap, Flame, Calendar, User,
  Phone, Building2, RefreshCw, MessageCircle,
  ExternalLink, Globe, ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadStatus = "cold" | "warm" | "hot" | "booked" | "human_takeover";

interface CRMLead {
  phone: string;
  lead_name: string | null;
  lead_id: string | null;
  status: LeadStatus;
  last_message: string;
  last_at: string;
  message_count: number;
  // joined from leads table
  company_name?: string;
  city?: string;
  category?: string;
  live_url?: string | null;
}

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: {
  status: LeadStatus;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  dot: string;
  headerBg: string;
}[] = [
  {
    status: "cold",
    label: "Cold",
    icon: Snowflake,
    color: "text-slate-600",
    bg: "bg-slate-50",
    border: "border-slate-200",
    dot: "bg-slate-400",
    headerBg: "bg-slate-100",
  },
  {
    status: "warm",
    label: "Warm",
    icon: Zap,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    dot: "bg-amber-400",
    headerBg: "bg-amber-50",
  },
  {
    status: "hot",
    label: "Hot",
    icon: Flame,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    dot: "bg-red-400",
    headerBg: "bg-red-50",
  },
  {
    status: "booked",
    label: "Booked",
    icon: Calendar,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
    headerBg: "bg-emerald-50",
  },
  {
    status: "human_takeover",
    label: "You're On",
    icon: User,
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
    dot: "bg-purple-500",
    headerBg: "bg-purple-50",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatPhone(phone: string) {
  return phone.replace(/(\+212)(\d{3})(\d{3})(\d{3})/, "$1 $2-$3-$4");
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  col,
  onMove,
  onOpenInbox,
}: {
  lead: CRMLead;
  col: (typeof COLUMNS)[0];
  onMove: (phone: string, status: LeadStatus) => void;
  onOpenInbox: (phone: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const otherStatuses = COLUMNS.filter((c) => c.status !== col.status);

  return (
    <div
      className={`rounded-xl border ${col.border} bg-white p-4 shadow-sm hover:shadow-md transition-all duration-150 cursor-pointer group`}
      onClick={() => setShowActions((v) => !v)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {lead.company_name || lead.lead_name || lead.phone}
          </p>
          {lead.city && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3" />
              {lead.city}
            </p>
          )}
        </div>
        <span className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0 mt-0.5">
          {timeAgo(lead.last_at)}
        </span>
      </div>

      {/* Last message preview */}
      <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">
        {lead.last_message}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Phone className="w-3 h-3 text-slate-400" />
          <span className="text-[11px] text-slate-500">{formatPhone(lead.phone)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400">{lead.message_count} msgs</span>
          {lead.live_url && (
            <a
              href={`https://${lead.live_url}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ml-1 text-emerald-500 hover:text-emerald-700"
              title="Visit live site"
            >
              <Globe className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Actions (toggled) */}
      {showActions && (
        <div
          className="mt-3 pt-3 border-t border-slate-100 space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onOpenInbox(lead.phone)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-slate-400" />
            View conversation
          </button>

          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
              Move to
            </p>
            {otherStatuses.map((s) => (
              <button
                key={s.status}
                onClick={() => onMove(lead.phone, s.status)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${s.color} hover:${s.bg} transition-colors`}
              >
                <s.icon className="w-3 h-3" />
                {s.label}
                <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  leads,
  onMove,
  onOpenInbox,
}: {
  col: (typeof COLUMNS)[0];
  leads: CRMLead[];
  onMove: (phone: string, status: LeadStatus) => void;
  onOpenInbox: (phone: string) => void;
}) {
  const Icon = col.icon;
  return (
    <div className="flex flex-col min-w-[240px] max-w-[280px] flex-1">
      {/* Column header */}
      <div
        className={`flex items-center justify-between px-3 py-2.5 rounded-xl mb-3 border ${col.border} ${col.headerBg}`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-3.5 h-3.5 ${col.color}`} />
          <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
        </div>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${col.bg} ${col.color} border ${col.border}`}
        >
          {leads.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-3 flex-1 min-h-[120px]">
        {leads.length === 0 ? (
          <div className="flex-1 rounded-xl border border-dashed border-slate-200 flex items-center justify-center py-8">
            <p className="text-xs text-slate-300">No leads yet</p>
          </div>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.phone}
              lead={lead}
              col={col}
              onMove={onMove}
              onOpenInbox={onOpenInbox}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Stats
  const totalQualified = leads.filter((l) => l.status !== "cold").length;
  const hotCount = leads.filter((l) => l.status === "hot").length;
  const bookedCount = leads.filter((l) => l.status === "booked").length;

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    // Aggregate conversations: one row per phone, latest message, status
    const { data: convData, error } = await supabase
      .from("bot_conversations")
      .select("phone, lead_name, lead_id, status, message, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load CRM data");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Group by phone — keep latest message, status, count
    const byPhone = new Map<string, CRMLead>();
    for (const row of convData ?? []) {
      if (!byPhone.has(row.phone)) {
        byPhone.set(row.phone, {
          phone: row.phone,
          lead_name: row.lead_name,
          lead_id: row.lead_id,
          status: (row.status as LeadStatus) || "cold",
          last_message: row.message,
          last_at: row.created_at,
          message_count: 1,
        });
      } else {
        byPhone.get(row.phone)!.message_count++;
      }
    }

    // Only keep qualified statuses (skip "open" catch-all)
    const qualifiedStatuses: LeadStatus[] = ["cold", "warm", "hot", "booked", "human_takeover"];
    const qualified = Array.from(byPhone.values()).filter((l) =>
      qualifiedStatuses.includes(l.status)
    );

    // Enrich with lead data (company_name, city, live_url)
    const leadIds = qualified.map((l) => l.lead_id).filter(Boolean) as string[];
    if (leadIds.length > 0) {
      const { data: leadsData } = await supabase
        .from("leads")
        .select("id, company_name, city, category")
        .in("id", leadIds);

      // Get live sites
      const { data: buildsData } = await supabase
        .from("builds")
        .select("lead_id, output_url")
        .in("lead_id", leadIds)
        .eq("status", "done")
        .order("created_at", { ascending: false });

      const leadsMap = new Map((leadsData ?? []).map((l: any) => [l.id, l]));
      // latest build per lead
      const buildsMap = new Map<string, string>();
      for (const b of buildsData ?? []) {
        if (!buildsMap.has(b.lead_id) && b.output_url) {
          buildsMap.set(b.lead_id, b.output_url);
        }
      }

      for (const lead of qualified) {
        if (lead.lead_id) {
          const l = leadsMap.get(lead.lead_id) as any;
          if (l) {
            lead.company_name = l.company_name;
            lead.city = l.city;
            lead.category = l.category;
          }
          lead.live_url = buildsMap.get(lead.lead_id) ?? null;
        }
      }
    }

    setLeads(qualified);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // ─── Move lead to another status ───────────────────────────────────────────
  const handleMove = async (phone: string, newStatus: LeadStatus) => {
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.phone === phone ? { ...l, status: newStatus } : l))
    );

    const { error } = await supabase
      .from("bot_conversations")
      .update({ status: newStatus })
      .eq("phone", phone);

    if (error) {
      toast.error("Failed to update status");
      fetchLeads(true);
    } else {
      toast.success(`Moved to ${newStatus.replace("_", " ")}`);
    }
  };

  // ─── Open inbox for this phone ──────────────────────────────────────────────
  const handleOpenInbox = (phone: string) => {
    window.location.href = `/inbox?phone=${encodeURIComponent(phone)}`;
  };

  // ─── Filter by search ──────────────────────────────────────────────────────
  const filtered = leads.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.phone.includes(q) ||
      l.company_name?.toLowerCase().includes(q) ||
      l.lead_name?.toLowerCase().includes(q) ||
      l.city?.toLowerCase().includes(q)
    );
  });

  const getColumnLeads = (status: LeadStatus) =>
    filtered
      .filter((l) => l.status === status)
      .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="CRM Pipeline"
        description="Qualified leads from WhatsApp conversations"
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />}
            onClick={() => fetchLeads(true)}
            loading={refreshing}
          >
            Refresh
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{leads.length}</p>
              <p className="text-xs text-slate-400">Total qualified</p>
            </div>
          </div>
        </Card>
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
              <Flame className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{hotCount}</p>
              <p className="text-xs text-slate-400">Hot leads</p>
            </div>
          </div>
        </Card>
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{bookedCount}</p>
              <p className="text-xs text-slate-400">Booked / closed</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          placeholder="Search by name, phone, city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm h-9 px-4 text-sm rounded-lg border border-surface-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder:text-slate-400"
        />
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-sm text-slate-400">Loading pipeline...</div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: "60vh" }}>
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.status}
              col={col}
              leads={getColumnLeads(col.status)}
              onMove={handleMove}
              onOpenInbox={handleOpenInbox}
            />
          ))}
        </div>
      )}
    </div>
  );
}
