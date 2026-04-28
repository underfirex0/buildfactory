import JSZip from "jszip";
import type { Lead } from "@/types";

// ─────────────────────────────────────────────
// TEMPLATE TYPE DETECTION
// ─────────────────────────────────────────────

type TemplateType = "react-vite" | "html-static";

function detectTemplateType(zip: JSZip): TemplateType {
  const files = Object.keys(zip.files);
  const hasBusinessConfig = files.some((f) => f.includes("businessConfig.ts") || f.includes("businessConfig.js"));
  const hasViteConfig = files.some((f) => f.includes("vite.config"));
  if (hasBusinessConfig || hasViteConfig) return "react-vite";
  return "html-static";
}

// ─────────────────────────────────────────────
// HTML STATIC: {{PLACEHOLDER}} replacement
// ─────────────────────────────────────────────

function buildPlaceholderMap(lead: Lead): Record<string, string> {
  return {
    "{{COMPANY_NAME}}": lead.company_name,
    "{{CATEGORY}}": lead.category,
    "{{CITY}}": lead.city,
    "{{PHONE}}": lead.phone ?? "",
    "{{EMAIL}}": lead.email ?? "",
    "{{WEBSITE}}": lead.website ?? "",
    "{{company_name}}": lead.company_name,
    "{{city}}": lead.city,
    "{{phone}}": lead.phone ?? "",
    "{{email}}": lead.email ?? "",
    "{{COMPANY_SLUG}}": lead.company_name.toLowerCase().replace(/\s+/g, "-"),
    "{{YEAR}}": new Date().getFullYear().toString(),
  };
}

function replacePlaceholders(content: string, map: Record<string, string>): string {
  let result = content;
  for (const [token, value] of Object.entries(map)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

// ─────────────────────────────────────────────
// REACT/VITE: businessConfig.ts field replacement
// ─────────────────────────────────────────────

function patchBusinessConfig(content: string, lead: Lead): string {
  const slug = lead.company_name.toLowerCase().replace(/\s+/g, "-");
  const email = lead.email ?? "contact@" + slug + ".com";
  const phone = lead.phone ?? "";
  const whatsapp = phone.replace(/[^0-9]/g, "");

  // Replace string fields using regex targeting quoted values
  const replacements: Array<[RegExp, string]> = [
    [/(business_name:\s*")[^"]*(")/g, `$1${lead.company_name}$2`],
    [/(city:\s*")[^"]*(")/g, `$1${lead.city}$2`],
    [/(phone:\s*")[^"]*(")/g, `$1${phone}$2`],
    [/(whatsapp:\s*")[^"]*(")/g, `$1${whatsapp}$2`],
    [/(email:\s*")[^"]*(")/g, `$1${email}$2`],
    // Update title/SEO fields
    [/(hero_title:\s*")[^"]*(")/g, `$1${lead.company_name.toUpperCase()} — ${lead.city.toUpperCase()}$2`],
    [/(tagline:\s*")[^"]*(")/g, `$1Your trusted ${lead.category} in ${lead.city}$2`],
    [/(address:\s*")[^"]*(")/g, `$1${lead.city}$2`],
    // Update hero subtitle
    [/(hero_subtitle:\s*")[^"]*(")/g, `$1Premium ${lead.category} services in ${lead.city}. Contact us today.$2`],
  ];

  let result = content;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function patchIndexHtml(content: string, lead: Lead): string {
  return content
    .replace(/<title>[^<]*<\/title>/, `<title>${lead.company_name} | ${lead.city}</title>`)
    .replace(/My Google AI Studio App/g, lead.company_name);
}

// ─────────────────────────────────────────────
// PLACEHOLDER DETECTION
// ─────────────────────────────────────────────

export async function detectPlaceholders(zipBuffer: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const type = detectTemplateType(zip);

  if (type === "react-vite") {
    // For React templates, return the config fields we'll patch
    return [
      "business_name", "city", "phone", "email",
      "whatsapp", "hero_title", "tagline", "address",
    ];
  }

  // HTML static: scan for {{TOKEN}} patterns
  const tokens = new Set<string>();
  const pattern = /\{\{[A-Z_a-z]+\}\}/g;
  for (const [, file] of Object.entries(zip.files)) {
    if (file.dir || !isTextFile(file.name)) continue;
    const content = await file.async("text");
    const matches = content.match(pattern);
    if (matches) matches.forEach((m) => tokens.add(m));
  }
  return Array.from(tokens);
}

// ─────────────────────────────────────────────
// CORE BUILD FUNCTION
// ─────────────────────────────────────────────

export async function processTemplate(
  templateBuffer: ArrayBuffer,
  lead: Lead
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const templateType = detectTemplateType(zip);
  const outputZip = new JSZip();

  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir) {
      outputZip.folder(filename);
      continue;
    }

    if (!isTextFile(filename)) {
      const content = await file.async("arraybuffer");
      outputZip.file(filename, content);
      continue;
    }

    let content = await file.async("text");

    if (templateType === "react-vite") {
      // Patch specific files for React/Vite templates
      const baseName = filename.split("/").pop() ?? "";
      if (baseName === "businessConfig.ts" || baseName === "businessConfig.js") {
        content = patchBusinessConfig(content, lead);
      } else if (baseName === "index.html") {
        content = patchIndexHtml(content, lead);
      }
      // All other files (components, CSS, etc.) are copied unchanged
    } else {
      // HTML static: replace {{PLACEHOLDER}} tokens everywhere
      const map = buildPlaceholderMap(lead);
      content = replacePlaceholders(content, map);
      filename; // keep name as-is (or replace placeholders in name too)
    }

    const processedName = templateType === "html-static"
      ? replacePlaceholders(filename, buildPlaceholderMap(lead))
      : filename;

    outputZip.file(processedName, content);
  }

  return outputZip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function isTextFile(filename: string): boolean {
  const textExts = [
    ".html", ".htm", ".css", ".js", ".ts", ".jsx", ".tsx",
    ".json", ".xml", ".txt", ".md", ".svg", ".php", ".env",
    ".yml", ".yaml", ".toml", ".njk", ".hbs", ".ejs",
  ];
  return textExts.some((ext) => filename.toLowerCase().endsWith(ext));
}
