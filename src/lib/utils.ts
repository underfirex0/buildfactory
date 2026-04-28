import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), "MMM d, yyyy");
}

export function formatDateRelative(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const TEMPLATE_CATEGORIES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "salon", label: "Hair & Beauty Salon" },
  { value: "plumber", label: "Plumber" },
  { value: "electrician", label: "Electrician" },
  { value: "dentist", label: "Dentist" },
  { value: "gym", label: "Gym & Fitness" },
  { value: "retail", label: "Retail Shop" },
  { value: "real-estate", label: "Real Estate" },
  { value: "lawyer", label: "Law Firm" },
  { value: "other", label: "Other" },
] as const;

export const BUILD_STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; dot: string }
> = {
  pending: {
    label: "Pending",
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    dot: "bg-amber-400",
  },
  building: {
    label: "Building",
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    dot: "bg-blue-400",
  },
  done: {
    label: "Done",
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-400",
  },
  failed: {
    label: "Failed",
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    dot: "bg-red-400",
  },
};

export const LEAD_STATUS_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  new: { label: "New", color: "text-brand-700", bg: "bg-brand-50 border-brand-200" },
  contacted: {
    label: "Contacted",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
  converted: {
    label: "Converted",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
  },
};
