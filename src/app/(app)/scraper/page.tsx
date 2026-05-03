"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import {
  Search, MapPin, Phone, Mail, Globe, Star,
  Plus, CheckCircle2, Loader2, Sparkles, Building2,
} from "lucide-react";
import toast from "react-hot-toast";

interface ScrapedBusiness {
  name: string;
  category: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  google_rating: number;
  review_count: number;
  google_maps_url: string;
  place_id: string;
  photos: string[];
  reviews: any[];
  opening_hours: any[];
  services: string[];
  instagram: string;
  facebook: string;
  tiktok: string;
  linkedin: string;
  youtube: string;
  sources: string[];
  selected: boolean;
  added: boolean;
}

interface ScrapeStats {
  total_found: number;
  with_website: number;
  without_website: number;
  with_phone: number;
  with_social: number;
}

const MOROCCAN_CITIES = [
  "Casablanca","Rabat","Marrakech","Fès","Tanger","Agadir",
  "Meknès","Oujda","Kenitra","Tétouan","Settat","El Jadida",
  "Mohammedia","Béni Mellal","Nador","Khouribga","Safi",
];

const NICHES = [
  { value: "restaurant", label: "🍽️ Restaurants & Cafés" },
  { value: "salon", label: "💇 Salons & Beauty" },
  { value: "gym", label: "🏋️ Gyms & Fitness" },
  { value: "dentist", label: "🦷 Dentists & Doctors" },
  { value: "garage", label: "🚗 Garages & Auto" },
  { value: "hotel", label: "🏨 Hotels & Riads" },
  { value: "pharmacy", label: "💊 Pharmacies" },
  { value: "lawyer", label: "⚖️ Lawyers" },
  { value: "real-estate", label: "🏠 Immobilier" },
  { value: "retail", label: "🛍️ Boutiques" },
  { value: "school", label: "🎓 Écoles & Formation" },
  { value: "other", label: "🔍 Other" },
];

export default function ScraperPage() {
  const [niche, setNiche] = useState("restaurant");
  const [city, setCity] = useState("Casablanca");
  const [customCity, setCustomCity] = useState("");
  const [maxResults, setMaxResults] = useState("20");
  const [websiteFilter, setWebsiteFilter] = useState("all");
  const [scraping, setScraping] = useState(false);
  const [results, setResults] = useState<ScrapedBusiness[]>([]);
  const [stats, setStats] = useState<ScrapeStats | null>(null);
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");

  const selectedCount = results.filter(r => r.selected && !r.added).length;
  const addedCount = results.filter(r => r.added).length;

  const handleScrape = async () => {
    setScraping(true);
    setResults([]);
    setStats(null);
    setProgress(0);

    const targetCity = city === "custom" ? customCity : city;

    try {
      setProgressMsg(`🔍 Scraping Google Maps for ${niche} in ${targetCity}...`);
      setProgress(15);

      const progressInterval = setInterval(() => {
        setProgress(p => Math.min(p + 2, 85));
      }, 2000);

      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          city: targetCity,
          maxResults: parseInt(maxResults),
          websiteFilter,
        }),
      });

      clearInterval(progressInterval);
      setProgress(95);
      setProgressMsg("Processing results...");

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scraping failed");

      const businesses: ScrapedBusiness[] = (data.results || []).map((b: any) => ({
        ...b,
        selected: true,
        added: false,
      }));

      setResults(businesses);
      setStats(data.stats);
      setProgress(100);
      setProgressMsg(`✅ Found ${businesses.length} businesses!`);
      toast.success(`Found ${businesses.length} businesses in ${targetCity}!`);

    } catch (e: any) {
      toast.error(e.message || "Scraping failed");
      setProgressMsg("❌ " + e.message);
    }

    setScraping(false);
  };

  const toggleSelect = (idx: number) => {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const selectAll = () => setResults(prev => prev.map(r => ({ ...r, selected: !r.added })));
  const selectNone = () => setResults(prev => prev.map(r => ({ ...r, selected: false })));

  const handleAddToLeads = async () => {
    const toAdd = results.filter(r => r.selected && !r.added);
    if (!toAdd.length) { toast.error("Select at least one business"); return; }
    setAdding(true);
    let count = 0;
    for (const biz of toAdd) {
      try {
        const { error } = await supabase.from("leads").insert({
          company_name: biz.name,
          category: biz.category || niche,
          city: biz.city,
          phone: biz.phone || null,
          email: biz.email || null,
          website: biz.website || null,
          notes: biz.description || null,
          enriched: true,
          enriched_at: new Date().toISOString(),
          google_rating: biz.google_rating || null,
          review_count: biz.review_count || 0,
          google_maps_url: biz.google_maps_url || null,
          place_id: biz.place_id || null,
          photos: biz.photos || [],
          real_reviews: biz.reviews || [],
          real_services: biz.services || [],
          opening_hours: biz.opening_hours || [],
          description: biz.description || null,
        });
        if (!error) {
          count++;
          setResults(prev => prev.map(r => r.name === biz.name ? { ...r, added: true, selected: false } : r));
        }
      } catch {}
    }
    toast.success(`✅ Added ${count} businesses to leads!`);
    setAdding(false);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Business Scraper"
        description="Scrape businesses from Google Maps + Social Media — filter by website presence"
        actions={
          selectedCount > 0 ? (
            <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={handleAddToLeads} loading={adding} className="bg-green-600 hover:bg-green-700">
              Add {selectedCount} to Leads
            </Button>
          ) : undefined
        }
      />

      {/* Search Panel */}
      <Card className="mb-6">
        <div className="grid grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Business Type</label>
            <select value={niche} onChange={e => setNiche(e.target.value)} className="w-full h-9 px-3 text-sm bg-white border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
              {NICHES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">City</label>
            <select value={city} onChange={e => setCity(e.target.value)} className="w-full h-9 px-3 text-sm bg-white border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
              {MOROCCAN_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="custom">Other...</option>
            </select>
            {city === "custom" && (
              <input type="text" placeholder="Enter city..." value={customCity} onChange={e => setCustomCity(e.target.value)} className="w-full h-9 px-3 text-sm bg-white border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 mt-2" />
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Website Filter</label>
            <select value={websiteFilter} onChange={e => setWebsiteFilter(e.target.value)} className="w-full h-9 px-3 text-sm bg-white border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="all">All businesses</option>
              <option value="no_website">🎯 No website (best leads!)</option>
              <option value="has_website">Has website</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Max Results</label>
            <select value={maxResults} onChange={e => setMaxResults(e.target.value)} className="w-full h-9 px-3 text-sm bg-white border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          <Button icon={scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} onClick={handleScrape} loading={scraping} className="h-9">
            {scraping ? "Scraping..." : "Scrape Now"}
          </Button>
        </div>

        {/* Progress */}
        {(scraping || progress > 0) && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">{progressMsg}</span>
              <span className="text-xs font-semibold text-brand-600">{progress}%</span>
            </div>
            <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-600 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </Card>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total Found", value: stats.total_found, color: "text-slate-700", bg: "bg-slate-50" },
            { label: "No Website 🎯", value: stats.without_website, color: "text-red-600", bg: "bg-red-50" },
            { label: "Has Website", value: stats.with_website, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "With Phone", value: stats.with_phone, color: "text-green-600", bg: "bg-green-50" },
            { label: "Has Social", value: stats.with_social, color: "text-purple-600", bg: "bg-purple-50" },
          ].map(s => (
            <Card key={s.label} padding="md" className={s.bg}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-700">{results.length} businesses found</span>
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Select all</button>
              <span className="text-slate-300">·</span>
              <button onClick={selectNone} className="text-xs text-slate-500 hover:text-slate-700 font-medium">Clear</button>
              {selectedCount > 0 && (
                <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={handleAddToLeads} loading={adding} className="bg-green-600 hover:bg-green-700 border-0 ml-2">
                  Add {selectedCount} to Leads
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {results.map((biz, idx) => (
              <Card key={idx} padding="none" className={`overflow-hidden transition-all ${biz.added ? "opacity-50" : ""} ${biz.selected && !biz.added ? "ring-2 ring-brand-400" : ""}`}>
                <div className="flex">
                  {/* Photo */}
                  <div className="w-36 h-32 flex-shrink-0 bg-surface-100 relative overflow-hidden">
                    {biz.photos?.[0] ? (
                      <img src={biz.photos[0]} alt={biz.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="w-8 h-8 text-slate-300" />
                      </div>
                    )}
                    {biz.photos?.length > 1 && (
                      <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                        +{biz.photos.length - 1}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-bold text-slate-800 text-sm">{biz.name}</h3>
                          {biz.google_rating > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                              <Star className="w-2.5 h-2.5 fill-amber-500" /> {biz.google_rating} ({biz.review_count})
                            </span>
                          )}
                          {!biz.website && (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                              🎯 No Website
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
                          {biz.address && <span className="flex items-center gap-1 text-[11px] text-slate-500"><MapPin className="w-2.5 h-2.5" />{biz.address.slice(0, 50)}</span>}
                          {biz.phone && <span className="flex items-center gap-1 text-[11px] text-slate-600 font-medium"><Phone className="w-2.5 h-2.5" />{biz.phone}</span>}
                          {biz.email && <span className="flex items-center gap-1 text-[11px] text-slate-500"><Mail className="w-2.5 h-2.5" />{biz.email}</span>}
                          {biz.website && <a href={biz.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-brand-600"><Globe className="w-2.5 h-2.5" />Website</a>}
                        </div>

                        {/* Social + Tags */}
                        <div className="flex flex-wrap gap-1">
                          {biz.instagram && <a href={biz.instagram} target="_blank" rel="noreferrer" className="text-[10px] bg-pink-50 border border-pink-200 text-pink-600 px-1.5 py-0.5 rounded-full hover:bg-pink-100">📸 Instagram</a>}
                          {biz.facebook && <a href={biz.facebook} target="_blank" rel="noreferrer" className="text-[10px] bg-blue-50 border border-blue-200 text-blue-600 px-1.5 py-0.5 rounded-full hover:bg-blue-100">👤 Facebook</a>}
                          {biz.tiktok && <a href={biz.tiktok} target="_blank" rel="noreferrer" className="text-[10px] bg-slate-50 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full hover:bg-slate-100">🎵 TikTok</a>}
                          {biz.linkedin && <a href={biz.linkedin} target="_blank" rel="noreferrer" className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5 rounded-full hover:bg-blue-100">💼 LinkedIn</a>}
                          {biz.youtube && <a href={biz.youtube} target="_blank" rel="noreferrer" className="text-[10px] bg-red-50 border border-red-200 text-red-600 px-1.5 py-0.5 rounded-full hover:bg-red-100">▶️ YouTube</a>}
                          {biz.photos?.length > 0 && <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-600 px-1.5 py-0.5 rounded-full">{biz.photos.length} photos</span>}
                          {biz.reviews?.length > 0 && <span className="text-[10px] bg-green-50 border border-green-200 text-green-600 px-1.5 py-0.5 rounded-full">{biz.reviews.length} reviews</span>}
                          {biz.opening_hours?.length > 0 && <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-600 px-1.5 py-0.5 rounded-full">⏰ Hours</span>}
                        </div>
                      </div>

                      {/* Checkbox */}
                      <div className="flex-shrink-0 pt-1">
                        {biz.added ? (
                          <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                            <CheckCircle2 className="w-4 h-4" /> Added
                          </div>
                        ) : (
                          <div
                            onClick={() => toggleSelect(idx)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${biz.selected ? "bg-brand-600 border-brand-600" : "border-surface-300 hover:border-brand-400"}`}
                          >
                            {biz.selected && <span className="text-white text-[10px] font-bold">✓</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Empty State */}
      {!scraping && results.length === 0 && (
        <Card className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <Search className="w-7 h-7 text-brand-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Ready to scrape</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            Select business type, city, and filter. The <strong>"No website"</strong> filter finds your best leads — businesses that need you most!
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
            <span>📍 Google Maps</span>
            <span>📸 Instagram</span>
            <span>👤 Facebook</span>
            <span>🎵 TikTok</span>
            <span>💼 LinkedIn</span>
          </div>
        </Card>
      )}
    </div>
  );
}
