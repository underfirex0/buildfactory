"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { formatDateRelative } from "@/lib/utils";
import type { Lead, Build } from "@/types";
import {
  MessageCircle, Send, Layers, CheckCircle2,
  Building2, Globe, Phone, Search, Edit3,
  AlertCircle, RefreshCw, XCircle, Wifi, WifiOff,
  QrCode, Loader2, ZapOff,
} from "lucide-react";
import toast from "react-hot-toast";

const WA_SERVER = "/api/wa";
const WA_KEY = "";

const DEFAULT_MESSAGE = `Ahlan 👋
{{COMPANY_NAME}} 3endkom khedma top, walakin bla site web rah clients kay9elbo 3la les concurrents f Google.
khdemna likom site Wajed, nadi. 👇
🔗{{WEBSITE_URL}}
Hadchi kolo b 990 DH — investissement li kayrja3 vite fait o kayb9a ijib des client dima 📈
Chouf, ou ndakrou, n9addou ay haja tout de suite. Ghir nwi 😉`;

interface LeadWithBuild extends Lead {
  build?: Build;
  whatsapp_sent?: boolean;
  whatsapp_sent_at?: string;
}

type WaStatus = "disconnected" | "initializing" | "qr_ready" | "connected";

export default function WhatsAppPage() {
  const [leads, setLeads] = useState<LeadWithBuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MESSAGE);
  const [editingMessage, setEditingMessage] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "with-site" | "no-site" | "not-sent">("with-site");

  // WA connection state
  const [waStatus, setWaStatus] = useState<WaStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ─── WA Server helpers ──────────────────────────────────────────────────────
  const waFetch = useCallback(async (path: string, options?: RequestInit) => {
    const res = await fetch(`${WA_SERVER}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    });
    return res.json();
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const data = await waFetch("/status");
      setWaStatus(data.status as WaStatus);

      if (data.status === "qr_ready") {
        const qrData = await waFetch("/qr");
        if (qrData.qr) setQrCode(qrData.qr);
      }

      if (data.status === "connected") {
        setQrCode(null);
      }
    } catch {
      setWaStatus("disconnected");
    }
  }, [waFetch]);

  // Poll every 3 seconds when not connected
  useEffect(() => {
    pollStatus();
    pollRef.current = setInterval(() => {
      if (waStatus !== "connected") pollStatus();
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pollStatus, waStatus]);

  const handleInit = async () => {
    setInitLoading(true);
    try {
      await waFetch("/init", { method: "POST" });
      setWaStatus("initializing");
      toast.success("Initializing WhatsApp...");
    } catch {
      toast.error("Cannot reach WA server");
    }
    setInitLoading(false);
  };

  const handleDisconnect = async () => {
    await waFetch("/disconnect", { method: "POST" });
    setWaStatus("disconnected");
    setQrCode(null);
    toast.success("Disconnected");
  };

  // ─── Leads ──────────────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const { data: leadsData } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: buildsData } = await supabase
      .from("builds")
      .select("lead_id, output_url, status")
      .eq("status", "done")
      .not("output_url", "is", null);

    const buildsByLead: Record<string, any> = {};
    (buildsData ?? []).forEach((b: any) => {
      if (!buildsByLead[b.lead_id]) buildsByLead[b.lead_id] = b;
    });

    const merged = (leadsData ?? []).map((lead: any) => ({
      ...lead,
      build: buildsByLead[lead.id] ?? null,
    }));

    setLeads(merged);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const buildMessage = (lead: LeadWithBuild): string => {
    const siteUrl = lead.build?.output_url ?? lead.website ?? "https://yoursite.com";
    return messageTemplate
      .replace(/{{COMPANY_NAME}}/g, lead.company_name)
      .replace(/{{WEBSITE_URL}}/g, siteUrl)
      .replace(/{{CITY}}/g, lead.city)
      .replace(/{{PHONE}}/g, lead.phone ?? "");
  };

  const markSent = async (lead: LeadWithBuild, message: string, status: "sent" | "failed") => {
    await supabase.from("leads").update({
      whatsapp_sent: status === "sent",
      whatsapp_sent_at: new Date().toISOString(),
      status: status === "sent" ? "contacted" : lead.status,
    }).eq("id", lead.id);

    await supabase.from("whatsapp_messages").insert({
      lead_id: lead.id,
      build_id: lead.build?.id ?? null,
      phone: lead.phone,
      message,
      status,
    });
  };

  const handleSendSingle = async (lead: LeadWithBuild) => {
    if (!lead.phone) { toast.error("No phone number"); return; }

    if (waStatus !== "connected") {
      toast.error("WhatsApp not connected — scan the QR first!");
      return;
    }

    setSending(lead.id);
    const message = buildMessage(lead);

    try {
      const res = await waFetch("/send", {
        method: "POST",
        body: JSON.stringify({ phone: lead.phone, message }),
      });

      if (res.success) {
        await markSent(lead, message, "sent");
        toast.success(`✅ Sent to ${lead.company_name}`);
      } else {
        await markSent(lead, message, "failed");
        toast.error(`Failed: ${res.error}`);
      }
    } catch (err) {
      await markSent(lead, message, "failed");
      toast.error("Server error");
    }

    setSending(null);
    fetchLeads();
  };

  const handleBulkSend = async () => {
    if (selected.length === 0) { toast.error("Select at least one lead"); return; }
    if (waStatus !== "connected") { toast.error("WhatsApp not connected — scan the QR first!"); return; }

    setBulkSending(true);
    const selectedLeads = filteredLeads.filter(l => selected.includes(l.id) && l.phone);

    const messages = selectedLeads.map(lead => ({
      phone: lead.phone!,
      message: buildMessage(lead),
    }));

    try {
      const res = await waFetch("/send-bulk", {
        method: "POST",
        body: JSON.stringify({ messages, delayMs: 3000 }),
      });

      if (res.success) {
        // Optimistically mark all as sent
        for (const lead of selectedLeads) {
          await markSent(lead, buildMessage(lead), "sent");
        }
        toast.success(`🚀 Sending to ${selectedLeads.length} leads...`);
      } else {
        toast.error(`Failed: ${res.error}`);
      }
    } catch {
      toast.error("Server error");
    }

    setSelected([]);
    setBulkSending(false);
    fetchLeads();
  };

  const filteredLeads = leads.filter(l => {
    const matchSearch = !search ||
      l.company_name.toLowerCase().includes(search.toLowerCase()) ||
      l.city.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ? true :
      filter === "with-site" ? !!l.build?.output_url :
      filter === "no-site" ? !l.build?.output_url :
      filter === "not-sent" ? !l.whatsapp_sent : true;
    return matchSearch && matchFilter;
  });

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const stats = {
    total: leads.length,
    withSite: leads.filter(l => !!l.build?.output_url).length,
    sent: leads.filter(l => l.whatsapp_sent).length,
    notSent: leads.filter(l => !l.whatsapp_sent).length,
  };

  // ─── Connection status UI ───────────────────────────────────────────────────
  const statusConfig = {
    disconnected: { color: "bg-red-50 border-red-200", dot: "bg-red-500", text: "text-red-700", label: "Disconnected" },
    initializing: { color: "bg-amber-50 border-amber-200", dot: "bg-amber-500 animate-pulse", text: "text-amber-700", label: "Initializing..." },
    qr_ready:     { color: "bg-blue-50 border-blue-200", dot: "bg-blue-500 animate-pulse", text: "text-blue-700", label: "Scan QR Code" },
    connected:    { color: "bg-green-50 border-green-200", dot: "bg-green-500", text: "text-green-700", label: "Connected ✓" },
  }[waStatus] ?? { color: "bg-red-50 border-red-200", dot: "bg-red-500", text: "text-red-700", label: "Disconnected" };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="WhatsApp Outreach"
        description="Send personalized messages to your leads with their live website link"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={fetchLeads}>
              Refresh
            </Button>
            {selected.length > 0 && (
              <Button
                icon={<Layers className="w-3.5 h-3.5" />}
                onClick={handleBulkSend}
                loading={bulkSending}
                className="bg-green-600 hover:bg-green-700"
              >
                Send to {selected.length} Leads
              </Button>
            )}
          </div>
        }
      />

      {/* ── WhatsApp Connection Card ── */}
      <Card className={`mb-6 border-2 ${statusConfig.color}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${statusConfig.dot}`} />
            <div>
              <p className={`text-sm font-semibold ${statusConfig.text}`}>{statusConfig.label}</p>
              <p className="text-xs text-slate-500">
                {waStatus === "disconnected" && "Click Initialize to connect your WhatsApp"}
                {waStatus === "initializing" && "Starting up, please wait..."}
                {waStatus === "qr_ready" && "Open WhatsApp on your phone → scan QR code below"}
                {waStatus === "connected" && "Ready to send messages directly from BuildFactory"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {waStatus === "connected" ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<ZapOff className="w-3.5 h-3.5" />}
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                icon={initLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                onClick={handleInit}
                loading={initLoading}
                disabled={waStatus === "initializing"}
                className="bg-green-600 hover:bg-green-700"
              >
                {waStatus === "initializing" ? "Initializing..." : "Initialize"}
              </Button>
            )}
          </div>
        </div>

        {/* QR Code */}
        {waStatus === "qr_ready" && qrCode && (
          <div className="mt-4 flex flex-col items-center gap-3 py-4 border-t border-blue-200">
            <p className="text-sm font-medium text-blue-700">Scan with WhatsApp on your phone</p>
            <img
              src={qrCode}
              alt="WhatsApp QR Code"
              className="w-52 h-52 rounded-xl border-4 border-white shadow-lg"
            />
            <p className="text-xs text-slate-500">WhatsApp → More Options → Linked Devices → Link a Device</p>
          </div>
        )}

        {waStatus === "initializing" && !qrCode && (
          <div className="mt-4 flex items-center justify-center gap-2 py-4 border-t border-amber-200">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
            <p className="text-sm text-amber-700">Launching browser, QR will appear in a few seconds...</p>
          </div>
        )}
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Leads", value: stats.total, icon: Building2, color: "text-brand-600", bg: "bg-brand-50" },
          { label: "With Live Site", value: stats.withSite, icon: Globe, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Messages Sent", value: stats.sent, icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Not Contacted", value: stats.notSent, icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50" },
        ].map(stat => (
          <Card key={stat.label} padding="md">
            <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
          </Card>
        ))}
      </div>

      {/* Message Template Editor */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-semibold text-slate-700">Message Template</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={editingMessage ? <XCircle className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
            onClick={() => setEditingMessage(!editingMessage)}
          >
            {editingMessage ? "Close" : "Edit"}
          </Button>
        </div>

        {editingMessage ? (
          <div className="space-y-3">
            <textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm text-slate-900 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="flex flex-wrap gap-2">
              {["{{COMPANY_NAME}}", "{{WEBSITE_URL}}", "{{CITY}}", "{{PHONE}}"].map(token => (
                <button
                  key={token}
                  onClick={() => setMessageTemplate(prev => prev + token)}
                  className="text-[11px] bg-brand-50 border border-brand-200 text-brand-700 px-2 py-1 rounded font-mono hover:bg-brand-100 transition-colors"
                >
                  {token}
                </button>
              ))}
              <button
                onClick={() => setMessageTemplate(DEFAULT_MESSAGE)}
                className="text-[11px] bg-surface-100 border border-surface-200 text-slate-600 px-2 py-1 rounded hover:bg-surface-200 transition-colors ml-auto"
              >
                Reset to default
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">BF</span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                  {messageTemplate
                    .replace(/{{COMPANY_NAME}}/g, "La Maison")
                    .replace(/{{WEBSITE_URL}}/g, "https://la-maison.vercel.app")
                    .replace(/{{CITY}}/g, "Casablanca")}
                </p>
                <p className="text-[10px] text-slate-400 mt-2">Preview with sample data</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Filters & Search */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-white border border-surface-200 rounded-xl p-1">
          {(["all", "with-site", "no-site", "not-sent"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f ? "bg-surface-100 text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {f === "all" ? "All" : f === "with-site" ? "Has Website" : f === "no-site" ? "No Website" : "Not Sent"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setSelected(filteredLeads.map(l => l.id))} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Select all</button>
          <span className="text-slate-300">·</span>
          <button onClick={() => setSelected([])} className="text-xs text-slate-500 hover:text-slate-700 font-medium">Clear</button>
          <span className="text-xs text-slate-400">{filteredLeads.length} leads</span>
        </div>
      </div>

      {/* Leads Table */}
      <Card padding="none">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading leads...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><MessageCircle className="w-5 h-5 text-slate-400" /></div>
            <p className="text-sm font-medium text-slate-600">No leads found</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Business</th>
                <th>Phone</th>
                <th>Live Website</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map(lead => {
                const isSelected = selected.includes(lead.id);
                const hasPhone = !!lead.phone;
                const hasSite = !!lead.build?.output_url;

                return (
                  <tr key={lead.id} className={`group ${isSelected ? "bg-brand-50/50" : ""}`}>
                    <td>
                      <div
                        onClick={() => toggleSelect(lead.id)}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${isSelected ? "bg-brand-600 border-brand-600" : "border-surface-300 hover:border-brand-400"}`}
                      >
                        {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">{lead.company_name}</p>
                          <p className="text-slate-400 text-[11px]">{lead.city}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      {hasPhone ? (
                        <span className="flex items-center gap-1 text-xs text-slate-600">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {lead.phone}
                        </span>
                      ) : (
                        <span className="text-[11px] text-red-400">No phone</span>
                      )}
                    </td>
                    <td>
                      {hasSite ? (
                        <a
                          href={lead.build!.output_url!}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium"
                        >
                          <Globe className="w-3 h-3" />
                          <span className="max-w-[160px] truncate">
                            {lead.build!.output_url!.replace("https://", "")}
                          </span>
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-400">No site yet</span>
                      )}
                    </td>
                    <td>
                      {lead.whatsapp_sent ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700">
                          <CheckCircle2 className="w-3 h-3" />
                          Sent {lead.whatsapp_sent_at ? formatDateRelative(lead.whatsapp_sent_at) : ""}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Not sent</span>
                      )}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant={lead.whatsapp_sent ? "secondary" : "primary"}
                        loading={sending === lead.id}
                        disabled={!hasPhone || waStatus !== "connected"}
                        icon={<Send className="w-3 h-3" />}
                        onClick={() => handleSendSingle(lead)}
                        className={!lead.whatsapp_sent && waStatus === "connected" ? "bg-green-600 hover:bg-green-700 border-0" : ""}
                      >
                        {lead.whatsapp_sent ? "Resend" : "Send"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
