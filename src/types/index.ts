// ─────────────────────────────────────────────
// Database types
// ─────────────────────────────────────────────

export type TemplateCategory =
  | "restaurant"
  | "salon"
  | "plumber"
  | "electrician"
  | "dentist"
  | "gym"
  | "retail"
  | "real-estate"
  | "lawyer"
  | "other";

export type LeadStatus = "new" | "contacted" | "converted";
export type BuildStatus = "pending" | "building" | "done" | "failed";

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory | string;
  description: string | null;
  file_path: string;
  file_size: number | null;
  preview_url: string | null;
  placeholders: string[];
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  company_name: string;
  category: string;
  city: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
}

export interface Build {
  id: string;
  lead_id: string;
  template_id: string | null;
  status: BuildStatus;
  output_path: string | null;
  output_url: string | null;
  netlify_site_id: string | null;
  error_msg: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  leads?: Lead;
  templates?: Template;
}

// ─────────────────────────────────────────────
// API / Form types
// ─────────────────────────────────────────────

export interface CreateLeadInput {
  company_name: string;
  category: string;
  city: string;
  phone?: string;
  email?: string;
  website?: string;
  notes?: string;
}

export interface CreateBuildInput {
  lead_id: string;
  template_id: string;
}

// ─────────────────────────────────────────────
// Dashboard stats
// ─────────────────────────────────────────────

export interface DashboardStats {
  totalLeads: number;
  totalTemplates: number;
  totalBuilds: number;
  successfulBuilds: number;
  pendingBuilds: number;
  failedBuilds: number;
}
