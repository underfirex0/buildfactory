"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { formatDateRelative } from "@/lib/utils";
import type { Lead, Build } from "@/types";
import {
  MessageCircle, Send, Layers, CheckCircle2,
  Building2, Globe, Phone, Search, Edit3,
  AlertCircle, RefreshCw, XCircle,
} from "lucide-react";
import toast from "react-hot-toast";

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

  const getWhatsAppLink = (lead: LeadWithBuild): string => {
    const phone = (lead.phone ?? "").replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(buildMessage(lead));
    return `https://wa.me/${phone}?text=${msg}`;
  };

  const handleSendSingle = async (lead: LeadWithBuild) => {
    if (!lead.phone) { toast.error("No phone number for this lead"); return; }
    setSending(lead.id);

    // Mark as sent in DB
    await supabase.from("leads").update({
      whatsapp_sent: true,
      whatsapp_sent_at: new Date().toISOString(),
      status: "contacted",
    }).eq("id", lead.id);

    // Log message
    await supabase.from("whatsapp_messages").insert({
      lead_id: lead.id,
      build_id: lead.build?.id ?? null,
      phone: lead.phone,
      message: buildMessage(lead),
      status: "sent",
    }).select();

    // Open WhatsApp
    window.open(getWhatsAppLink(lead), "_blank");

    toast.success(`Message opened for ${lead.company_name}`);
    setSending(null);
    fetchLeads();
  };

  const handleBulkSend = async () => {
    if (selected.length === 0) { toast.error("Select at least one lead"); return; }
    setBulkSending(true);

    const selectedLeads = filteredLeads.filter(l => selected.includes(l.id));
    let sent = 0;

    for (const lead of selectedLeads) {
      if (!lead.phone) continue;
      await supabase.from("leads").update({
        whatsapp_sent: true,
        whatsapp_sent_at: new Date().toISOString(),
        status: "contacted",
      }).eq("id", lead.id);

      await supabase.from("whatsapp_messages").insert({
        lead_id: lead.id,
        build_id: lead.build?.id ?? null,
        phone: lead.phone,
        message: buildMessage(lead),
        status: "sent",
      });

      sent++;
    }

    // Open WhatsApp for each (with delay)
    for (let i = 0; i < selectedLeads.length; i++) {
      const lead = selectedLeads[i];
      if (!lead.phone) continue;
      setTimeout(() => {
        window.open(getWhatsAppLink(lead), "_blank");
      }, i * 800);
    }

    toast.success(`Opened ${sent} WhatsApp conversations!`);
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

  const selectAll = () => setSelected(filteredLeads.map(l => l.id));
  const clearAll = () => setSelected([]);

  const stats = {
    total: leads.length,
    withSite: leads.filter(l => !!l.build?.output_url).length,
    sent: leads.filter(l => l.whatsapp_sent).length,
    notSent: leads.filter(l => !l.whatsapp_sent).length,
  };

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
          <button onClick={selectAll} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Select all</button>
          <span className="text-slate-300">·</span>
          <button onClick={clearAll} className="text-xs text-slate-500 hover:text-slate-700 font-medium">Clear</button>
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
                        disabled={!hasPhone}
                        icon={<Send className="w-3 h-3" />}
                        onClick={() => handleSendSingle(lead)}
                        className={!lead.whatsapp_sent ? "bg-green-600 hover:bg-green-700 border-0" : ""}
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
