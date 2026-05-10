/**
 * Vercel Deploy Engine
 * Deploys generated websites to Vercel using the Vercel API
 */

import JSZip from "jszip";
import crypto from "crypto";

const VERCEL_TEAM_SLUG = "faissal-babiouis-projects";

interface VercelDeployment {
  id: string;
  url: string;
  readyState: string;
  alias?: string[];
}

interface VercelFile {
  file: string;
  sha: string;
  size: number;
}

/**
 * Deploy a ZIP buffer as a new Vercel project
 * Pass alias to set custom domain at creation time
 */
export async function deployToVercel(
  zipBuffer: Uint8Array,
  siteName: string,
  token: string,
  alias?: string
): Promise<{ deploymentId: string; url: string }> {
  const files = await extractZipFiles(zipBuffer);
  const uploadedFiles = await uploadFiles(files, token);
  const deployment = await createDeployment(siteName, uploadedFiles, token, alias);
  const ready = await waitForDeployment(deployment.id, token);

  // If alias was set, use it as the final URL
  const finalUrl = alias ? `https://${alias}` : getCleanUrl(ready);

  return {
    deploymentId: ready.id,
    url: finalUrl,
  };
}

/**
 * Get the cleanest public URL from deployment
 */
function getCleanUrl(deployment: VercelDeployment): string {
  if (deployment.alias && deployment.alias.length > 0) {
    const sorted = [...deployment.alias].sort((a, b) => a.length - b.length);
    const clean = sorted.find(a => !a.includes("git") && !a.includes(".now.sh"));
    if (clean) return `https://${clean}`;
    return `https://${sorted[0]}`;
  }
  return `https://${deployment.url}`;
}

/**
 * Extract files from ZIP, stripping single root folder if present
 */
async function extractZipFiles(
  zipBuffer: Uint8Array
): Promise<Record<string, Buffer>> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const files: Record<string, Buffer> = {};

  const allFiles = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
  const rootFolders = new Set(allFiles.map((f) => f.split("/")[0]));
  const hasSingleRoot =
    rootFolders.size === 1 && allFiles.every((f) => f.includes("/"));
  const rootPrefix = hasSingleRoot ? [...rootFolders][0] + "/" : "";

  for (const [filename, file] of Object.entries(zip.files)) {
    if ((file as any).dir) continue;
    const outputName =
      rootPrefix && filename.startsWith(rootPrefix)
        ? filename.slice(rootPrefix.length)
        : filename;
    if (!outputName) continue;
    const content = Buffer.from(await (file as any).async("arraybuffer"));
    files[outputName] = content;
  }

  return files;
}

/**
 * Upload files to Vercel's file store
 */
async function uploadFiles(
  files: Record<string, Buffer>,
  token: string
): Promise<VercelFile[]> {
  const uploaded: VercelFile[] = [];

  for (const [filename, content] of Object.entries(files)) {
    const sha = crypto.createHash("sha1").update(content).digest("hex");

    const res = await fetch(`${VERCEL_API}/v2/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "x-vercel-digest": sha,
        "Content-Length": content.length.toString(),
      },
      body: new Uint8Array(content),
    });

    if (!res.ok && res.status !== 409) {
      const err = await res.text();
      console.error(`Failed to upload ${filename}: ${err}`);
    }

    uploaded.push({ file: filename, sha, size: content.length });
  }

  return uploaded;
}

/**
 * Create a Vercel deployment with optional alias set at creation time
 */
async function createDeployment(
  siteName: string,
  files: VercelFile[],
  token: string,
  alias?: string
): Promise<VercelDeployment> {
  const sanitized = siteName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);

  const projectName = `${sanitized}-${Date.now()}`;

  const body: any = {
    name: projectName,
    files,
    projectSettings: {
      framework: null,
      outputDirectory: null,
      buildCommand: null,
      installCommand: null,
    },
    target: "production",
  };

  if (alias) {
    body.alias = [alias];
    console.log(`[DOMAIN] Setting alias at creation: ${alias}`);
  }

  const res = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create Vercel deployment: ${err}`);
  }

  return res.json();
}

/**
 * Poll until deployment is ready
 */
async function waitForDeployment(
  deploymentId: string,
  token: string,
  maxAttempts = 20
): Promise<VercelDeployment> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to check deployment status");

    const deployment: VercelDeployment = await res.json();

    if (deployment.readyState === "READY") return deployment;
    if (
      deployment.readyState === "ERROR" ||
      deployment.readyState === "CANCELED"
    ) {
      throw new Error(`Vercel deployment ${deployment.readyState}`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  throw new Error("Deployment timed out");
}
