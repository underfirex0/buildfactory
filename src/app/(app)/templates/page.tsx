"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { supabase } from "@/lib/supabase";
import {
  TEMPLATE_CATEGORIES,
  formatDate,
  formatFileSize,
  cn,
} from "@/lib/utils";
import type { Template } from "@/types";
import {
  Upload,
  FileCode2,
  Trash2,
  Tag,
  HardDrive,
  Calendar,
  Code2,
  Plus,
  CloudUpload,
} from "lucide-react";
import toast from "react-hot-toast";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [form, setForm] = useState({
    name: "",
    category: "other",
    description: "",
    file: null as File | null,
  });

  const fileRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setTemplates(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".zip")) {
      setForm((f) => ({ ...f, file, name: f.name || file.name.replace(".zip", "") }));
    } else {
      toast.error("Please upload a ZIP file");
    }
  }, []);

  const handleUpload = async () => {
    if (!form.file || !form.name || !form.category) {
      toast.error("Please fill in all required fields");
      return;
    }

    setUploading(true);
    try {
      // Upload ZIP to Supabase Storage
      const filePath = `${Date.now()}-${form.file.name}`;
      const { error: storageError } = await supabase.storage
        .from("templates")
        .upload(filePath, form.file);

      if (storageError) throw storageError;

      // Detect placeholders from ZIP
      let placeholders: string[] = [];
      try {
        const { detectPlaceholders } = await import("@/lib/build-engine");
        const buffer = await form.file.arrayBuffer();
        placeholders = await detectPlaceholders(buffer);
      } catch {
        // Non-critical
      }

      // Save template record
      const { error: dbError } = await supabase.from("templates").insert({
        name: form.name,
        category: form.category,
        description: form.description || null,
        file_path: filePath,
        file_size: form.file.size,
        placeholders,
      });

      if (dbError) throw dbError;

      toast.success("Template uploaded successfully");
      setUploadOpen(false);
      setForm({ name: "", category: "other", description: "", file: null });
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (template: Template) => {
    if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("templates").delete().eq("id", template.id);
    if (!error) {
      toast.success("Template deleted");
      fetchTemplates();
    } else {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Templates"
        description="Upload and manage reusable website templates"
        actions={
          <Button
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setUploadOpen(true)}
          >
            Upload Template
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-surface-200 p-5 space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <div className="empty-state">
            <div className="empty-state-icon">
              <FileCode2 className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">No templates yet</p>
            <p className="text-xs text-slate-400 mb-4">
              Upload your first ZIP template to get started
            </p>
            <Button
              size="sm"
              icon={<Upload className="w-3.5 h-3.5" />}
              onClick={() => setUploadOpen(true)}
            >
              Upload Template
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} hover className="group flex flex-col">
              {/* Card header */}
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                  <Code2 className="w-5 h-5 text-violet-600" />
                </div>
                <button
                  onClick={() => handleDelete(template)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <h3 className="font-semibold text-slate-800 mb-1 text-sm leading-tight">
                {template.name}
              </h3>

              {template.description && (
                <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">
                  {template.description}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5 mb-4">
                <span className="inline-flex items-center gap-1 text-[11px] text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full font-medium">
                  <Tag className="w-2.5 h-2.5" />
                  {TEMPLATE_CATEGORIES.find((c) => c.value === template.category)?.label ??
                    template.category}
                </span>
                {template.placeholders?.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 bg-surface-100 border border-surface-200 px-2 py-0.5 rounded-full font-medium">
                    <Code2 className="w-2.5 h-2.5" />
                    {template.placeholders.length} placeholders
                  </span>
                )}
              </div>

              {/* Footer meta */}
              <div className="mt-auto pt-3 border-t border-surface-100 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <HardDrive className="w-3 h-3" />
                  {formatFileSize(template.file_size)}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Calendar className="w-3 h-3" />
                  {formatDate(template.created_at)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload Template"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} loading={uploading}>
              Upload Template
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
              dragActive
                ? "border-brand-400 bg-brand-50"
                : form.file
                ? "border-emerald-300 bg-emerald-50"
                : "border-surface-200 hover:border-brand-300 hover:bg-brand-50/30"
            )}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setForm((f) => ({ ...f, file, name: f.name || file.name.replace(".zip", "") }));
              }}
            />
            <CloudUpload
              className={cn(
                "w-8 h-8 mx-auto mb-2",
                form.file ? "text-emerald-500" : "text-slate-300"
              )}
            />
            {form.file ? (
              <>
                <p className="text-sm font-medium text-emerald-700">{form.file.name}</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {formatFileSize(form.file.size)}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-600">
                  Drop ZIP file here or click to browse
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Supports .zip archives with HTML/CSS/JS templates
                </p>
              </>
            )}
          </div>

          <Input
            label="Template Name *"
            placeholder="e.g. Modern Restaurant Site"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />

          <Select
            label="Category *"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            options={TEMPLATE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Description</label>
            <textarea
              rows={3}
              placeholder="Brief description of this template..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div className="bg-surface-50 rounded-lg p-3 border border-surface-100">
            <p className="text-xs font-semibold text-slate-600 mb-1">Available Placeholders</p>
            <div className="flex flex-wrap gap-1">
              {[
                "{{COMPANY_NAME}}",
                "{{CITY}}",
                "{{PHONE}}",
                "{{EMAIL}}",
                "{{CATEGORY}}",
                "{{YEAR}}",
                "{{COMPANY_SLUG}}",
              ].map((ph) => (
                <code key={ph} className="text-[10px] bg-white border border-surface-200 px-1.5 py-0.5 rounded text-brand-700 font-mono">
                  {ph}
                </code>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
