/**
 * Netlify Deploy Engine - File Digest Method
 * Correctly deploys HTML sites via Netlify API
 */

import JSZip from "jszip";
import crypto from "crypto";

const NETLIFY_API = "https://api.netlify.com/api/v1";

interface NetlifySite { id: string; name: string; ssl_url: string; url: string; }
interface NetlifyDeploy { id: string; site_id: string; ssl_url: string; url: string; state: string; required?: string[]; }

export async function deployToNetlify(zipBuffer: Uint8Array, siteName: string, token: string): Promise<{ siteId: string; url: string }> {
  const site = await createSite(siteName, token);
  const url = await deployFiles(site.id, zipBuffer, token);
  return { siteId: site.id, url };
}

export async function redeployToNetlify(siteId: string, zipBuffer: Uint8Array, token: string): Promise<{ url: string }> {
  const url = await deployFiles(siteId, zipBuffer, token);
  return { url };
}

async function createSite(name: string, token: string): Promise<NetlifySite> {
  const sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").substring(0, 50);
  const uniqueName = `${sanitized}-${Date.now()}`;
  const res = await fetch(`${NETLIFY_API}/sites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: uniqueName }),
  });
  if (!res.ok) throw new Error(`Failed to create Netlify site: ${await res.text()}`);
  return res.json();
}

async function deployFiles(siteId: string, zipBuffer: Uint8Array, token: string): Promise<string> {
  // Extract files from ZIP
  const zip = await JSZip.loadAsync(zipBuffer);
  const files: Record<string, { content: Buffer; sha1: string }> = {};

  // Detect and strip single root folder prefix
  const allFiles = Object.keys(zip.files).filter(f => !zip.files[f].dir);
  const rootFolders = new Set(allFiles.map(f => f.split("/")[0]));
  const hasSingleRoot = rootFolders.size === 1 && allFiles.every(f => f.includes("/"));
  const rootPrefix = hasSingleRoot ? [...rootFolders][0] + "/" : "";

  for (const [filename, file] of Object.entries(zip.files)) {
    if ((file as any).dir) continue;
    const outputName = rootPrefix && filename.startsWith(rootPrefix) ? filename.slice(rootPrefix.length) : filename;
    if (!outputName) continue;
    const content = Buffer.from(await (file as any).async("arraybuffer"));
    const sha1 = crypto.createHash("sha1").update(content).digest("hex");
    files["/" + outputName] = { content, sha1 };
  }

  // Build file digest map
  const fileDigests: Record<string, string> = {};
  for (const [path, { sha1 }] of Object.entries(files)) fileDigests[path] = sha1;

  // Create deploy with file digests
  const deployRes = await fetch(`${NETLIFY_API}/sites/${siteId}/deploys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ files: fileDigests }),
  });
  if (!deployRes.ok) throw new Error(`Failed to create deploy: ${await deployRes.text()}`);
  const deploy: NetlifyDeploy = await deployRes.json();

  // Upload required files
  const required = deploy.required ?? Object.values(fileDigests);
  for (const [path, { content, sha1 }] of Object.entries(files)) {
    if (!required.includes(sha1)) continue;
    await fetch(`${NETLIFY_API}/deploys/${deploy.id}/files${path}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": getContentType(path) },
      body: content,
    });
  }

  // Wait for ready
  const ready = await waitForDeploy(siteId, deploy.id, token);
  return ready.ssl_url || ready.url;
}

async function waitForDeploy(siteId: string, deployId: string, token: string, maxAttempts = 30): Promise<NetlifyDeploy> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${NETLIFY_API}/sites/${siteId}/deploys/${deployId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Failed to check deploy status");
    const deploy: NetlifyDeploy = await res.json();
    if (deploy.state === "ready") return deploy;
    if (deploy.state === "error") throw new Error("Netlify deploy failed");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Deploy timed out");
}

function getContentType(path: string): string {
  if (path.endsWith(".html") || path.endsWith(".htm")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

export async function deleteNetlifySite(siteId: string, token: string): Promise<void> {
  await fetch(`${NETLIFY_API}/sites/${siteId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
}