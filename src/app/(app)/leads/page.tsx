"use client";

import { AIGenerateButton } from "@/components/AIGenerateButton";
import { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { supabase } from "@/lib/supabase";
import { TEMPLATE_CATEGORIES, LEAD_STATUS_META, formatDateRelative } from "@/lib/utils";
import type { Lead, CreateLeadInput } from "@/types";
import {
  Plus, Upload, Users, Building2, MapPin, Phone,
  Mail, Search, Trash2, FileUp, Sparkles, Star,
  CheckCircle2, Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import Papa from "papaparse";

const EMPTY_FORM: CreateLeadInput = {
  company_name: "",
  category: "other",
  city: "",
  phone: "",
  email: "",
  website: "",
  notes: "",
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState<CreateLeadInput>(EMPTY_FORM);
  const [csvPreview, setCsvPreview] = useState<CreateLeadInput[]>([]);
  const [enriching, setEnriching] = useState<string | null>(null);
  const [enrichedLead, setEnrichedLead] = useState<any>(null);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    setLeads(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const filteredLeads = leads.filter(
    (l) =>
      l.company_name.toLowerCase().includes(search.toLowerCase()) ||
      l.city.toLowerCase().includes(search.toLowerCase()) ||
      l.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.company_name || !form.city || !form.category) {
      toast.error("Company name, city and category are required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("leads").insert({
      ...form,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      notes: form.notes || null,
    });
    if (!error) {
      toast.success("Lead added");
      setAddOpen(false);
      setForm(EMPTY_FORM);
      fetchLeads();
    } else {
      toast.error("Failed to add lead");
    }
    setSaving(false);
  };

  const handleDelete = async (lead: Lead) => {
    if (!confirm(`Delete "${lead.company_name}"?`)) return;
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (!error) {
      toast.success("Lead deleted");
      fetchLeads();
    } else {
      toast.error("Delete failed");
    }
  };

  // ─── ENRICH LEAD ─────────────────────────────────────────────────────────
  const handleEnrich = async (lead: Lead) => {
    setEnriching(lead.id);
    toast.loading(`Scraping Google Maps for ${lead.company_name}...`, { id: "enrich" });

    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(
          `✅ Enriched! ${data.data.photos} photos, ${data.data.reviews} reviews, rating ${data.data.rating}⭐`,
          { id: "enrich", duration: 5000 }
        );
        setEnrichedLead({ ...lead, ...data.data });
        setEnrichOpen(true);
        fetchLeads();
      } else {
        toast.error(data.error || "Not found on Google Maps", { id: "enrich" });
      }
    } catch {
      toast.error("Enrichment failed", { id: "enrich" });
    }

    setEnriching(null);
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const parsed: CreateLeadInput[] = data
          .map((row) => ({
            company_name: row.company_name || row["Company Name"] || row.name || "",
            category: row.category || row.Category || "other",
            city: row.city || row.City || "",
            phone: row.phone || row.Phone || "",
            email: row.email || row.Email || "",
            website: row.website || row.Website || "",
            notes: row.notes || row.Notes || "",
          }))
          .filter((r) => r.company_name && r.city);
        if (parsed.length === 0) {
          toast.error("No valid rows found. Check your CSV headers.");
          return;
        }
        setCsvPreview(parsed);
        setCsvOpen(true);
      },
      error: () => toast.error("Failed to parse CSV"),
    });
    e.target.value = "";
  };

  const handleCsvImport = async () => {
    setImporting(true);
    const { error } = await supabase.from("leads").insert(
      csvPreview.map((r) => ({
        ...r,
        phone: r.phone || null,
        email: r.email || null,
        website: r.website || null,
        notes: r.notes || null,
      }))
    );
    if (!error) {
      toast.success(`Imported ${csvPreview.length} leads`);
      setCsvOpen(false);
      setCsvPreview([]);
      fetchLeads();
    } else {
      toast.error("Import failed");
    }
    setImporting(false);
  };

  const enrichedCount = leads.filter((l: any) => l.enriched).length;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Leads"
        description="Manage local business leads for website generation"
        actions={
          <div className="flex items-center gap-2">
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
            <Button variant="secondary" icon={<FileUp className="w-3.5 h-3.5" />} onClick={() => csvRef.current?.click()}>
              Import CSV
            </Button>
            <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddOpen(true)}>
              Add Lead
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card padding="md">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center mb-3">
            <Users className="w-4 h-4 text-brand-600" />
          </div>
          <p className="text-xl font-bold text-slate-900">{leads.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">Total Leads</p>
        </Card>
        <Card padding="md">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
            <Sparkles className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-bold text-slate-900">{enrichedCount}</p>
          <p className="text-xs text-slate-500 mt-0.5">Enriched with Google Data</p>
        </Card>
        <Card padding="md">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </div>
          <p className="text-xl font-bold text-slate-900">{leads.length - enrichedCount}</p>
          <p className="text-xs text-slate-500 mt-0.5">Pending Enrichment</p>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder:text-slate-400"
          />
        </div>
        <span className="text-xs text-slate-500 ml-auto">{filteredLeads.length} leads</span>
      </div>

      {/* Table */}
      <Card padding="none">
        {loading ? (
          <div className="divide-y divide-surface-50">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Users className="w-5 h-5 text-slate-400" /></div>
            <p className="text-sm font-medium text-slate-600 mb-1">
              {search ? "No leads match your search" : "No leads yet"}
            </p>
            {!search && <p className="text-xs text-slate-400 mb-4">Add leads manually or import a CSV file</p>}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Category</th>
                <th>Contact</th>
                <th>Google Data</th>
                <th>Status</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead: any) => {
                const statusMeta = LEAD_STATUS_META[lead.status];
                const isEnriching = enriching === lead.id;
                return (
                  <tr key={lead.id} className="group">
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {lead.photos?.[0] ? (
                            <img src={lead.photos[0]} alt="" className="w-full h-full object-cover"/>
                          ) : (
                            <Building2 className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-xs leading-tight">{lead.company_name}</p>
                          <span className="flex items-center gap-1 text-slate-400 text-[11px]">
                            <MapPin className="w-2.5 h-2.5" />{lead.city}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs text-slate-500 capitalize">{lead.category}</span>
                    </td>
                    <td>
                      <div className="space-y-0.5">
                        {lead.phone && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Phone className="w-2.5 h-2.5" /> {lead.phone}
                          </span>
                        )}
                        {lead.email && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Mail className="w-2.5 h-2.5" /> {lead.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {lead.enriched ? (
                        <div className="flex items-center gap-1.5">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span className="text-xs font-semibold text-slate-700">{lead.google_rating}</span>
                          <span className="text-[11px] text-slate-400">({lead.review_count})</span>
                          <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium ml-1">
                            {lead.photos?.length || 0} photos
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEnrich(lead)}
                          disabled={isEnriching}
                          className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition-all disabled:opacity-50"
                        >
                          {isEnriching ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Scraping...</>
                          ) : (
                            <><Sparkles className="w-3 h-3" /> Enrich</>
                          )}
                        </button>
                      )}
                    </td>
                    <td>
                      <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusMeta.bg} ${statusMeta.color}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-slate-400">{formatDateRelative(lead.created_at)}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <AIGenerateButton lead={lead} />
                      <button
                        onClick={() => handleDelete(lead)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Enrichment Result Modal */}
      <Modal
        isOpen={enrichOpen}
        onClose={() => setEnrichOpen(false)}
        title="✅ Lead Enriched Successfully"
        size="lg"
        footer={<Button onClick={() => setEnrichOpen(false)}>Done</Button>}
      >
        {enrichedLead && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{enrichedLead.photos}</p>
                <p className="text-xs text-amber-600">Photos scraped</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{enrichedLead.reviews}</p>
                <p className="text-xs text-blue-600">Real reviews</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{enrichedLead.rating}⭐</p>
                <p className="text-xs text-green-600">Google rating</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              This lead is now enriched with real Google Maps data. When you build their website, it will automatically include their real photos, reviews, and business information.
            </p>
          </div>
        )}
      </Modal>

      {/* Add Lead Modal */}
      <Modal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Lead"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save Lead</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="Company Name *" placeholder="e.g. The Golden Spoon" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
          </div>
          <Select label="Category *" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} options={TEMPLATE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
          <Input label="City *" placeholder="e.g. Casablanca" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          <Input label="Phone" placeholder="+212 6XX XXX XXX" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          <Input label="Email" type="email" placeholder="contact@business.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <div className="col-span-2">
            <Input label="Website" placeholder="https://..." value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <Textarea label="Notes" placeholder="Any additional notes..." rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* CSV Preview Modal */}
      <Modal
        isOpen={csvOpen}
        onClose={() => setCsvOpen(false)}
        title={`Import ${csvPreview.length} Leads`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCsvOpen(false)}>Cancel</Button>
            <Button onClick={handleCsvImport} loading={importing} icon={<Upload className="w-3.5 h-3.5" />}>Import All</Button>
          </>
        }
      >
        <p className="text-xs text-slate-500 mb-4">
          Preview of the first rows from your CSV. All <strong>{csvPreview.length}</strong> rows will be imported.
        </p>
        <div className="overflow-x-auto rounded-lg border border-surface-100">
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th><th>Category</th><th>City</th><th>Phone</th><th>Email</th>
              </tr>
            </thead>
            <tbody>
              {csvPreview.slice(0, 10).map((row, i) => (
                <tr key={i}>
                  <td className="font-medium text-xs">{row.company_name}</td>
                  <td className="text-xs">{row.category}</td>
                  <td className="text-xs">{row.city}</td>
                  <td className="text-xs text-slate-400">{row.phone || "—"}</td>
                  <td className="text-xs text-slate-400">{row.email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {csvPreview.length > 10 && (
          <p className="text-xs text-slate-400 mt-2 text-center">...and {csvPreview.length - 10} more rows</p>
        )}
      </Modal>
    </div>
  );
}
