import JSZip from "jszip";
import type { Lead, Template } from "@/types";

/**
 * Maps lead fields to template placeholder tokens.
 * Template authors use {{COMPANY_NAME}}, {{CITY}}, etc.
 */
function buildPlaceholderMap(lead: Lead): Record<string, string> {
  return {
    "{{COMPANY_NAME}}": lead.company_name,
    "{{CATEGORY}}": lead.category,
    "{{CITY}}": lead.city,
    "{{PHONE}}": lead.phone ?? "",
    "{{EMAIL}}": lead.email ?? "",
    "{{WEBSITE}}": lead.website ?? "",
    // Convenience variants
    "{{company_name}}": lead.company_name,
    "{{city}}": lead.city,
    "{{phone}}": lead.phone ?? "",
    "{{email}}": lead.email ?? "",
    // Slug versions
    "{{COMPANY_SLUG}}": lead.company_name.toLowerCase().replace(/\s+/g, "-"),
    "{{YEAR}}": new Date().getFullYear().toString(),
  };
}

/**
 * Replace all placeholders in a string
 */
function replacePlaceholders(
  content: string,
  map: Record<string, string>
): string {
  let result = content;
  for (const [token, value] of Object.entries(map)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

/**
 * Detects all {{PLACEHOLDER}} tokens in a ZIP's text files
 */
export async function detectPlaceholders(zipBuffer: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const tokens = new Set<string>();
  const pattern = /\{\{[A-Z_a-z]+\}\}/g;

  for (const [, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    if (!isTextFile(file.name)) continue;

    const content = await file.async("text");
    const matches = content.match(pattern);
    if (matches) matches.forEach((m) => tokens.add(m));
  }

  return Array.from(tokens);
}

/**
 * Core build function: takes template ZIP buffer + lead, returns output ZIP buffer
 */
export async function processTemplate(
  templateBuffer: ArrayBuffer,
  lead: Lead
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const outputZip = new JSZip();
  const placeholderMap = buildPlaceholderMap(lead);

  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir) {
      outputZip.folder(filename);
      continue;
    }

    if (isTextFile(filename)) {
      const content = await file.async("text");
      const processed = replacePlaceholders(content, placeholderMap);
      // Also rename files that contain placeholders in their name
      const processedName = replacePlaceholders(filename, placeholderMap);
      outputZip.file(processedName, processed);
    } else {
      // Binary files (images, fonts, etc.) are copied as-is
      const content = await file.async("arraybuffer");
      outputZip.file(filename, content);
    }
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
