/**
 * Vercel Deploy Engine
 * Deploys generated websites to Vercel using the Vercel API
 */

import JSZip from "jszip";
import crypto from "crypto";

const VERCEL_API = "https://api.vercel.com";
const VERCEL_TEAM_ID = "team_wy3WeSZgVNxFhj1wzSMo67SP";

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
 * Deploy a ZIP buffer as a new Vercel deployment under the team
 * Then assign the custom alias
 */
export async function deployToVercel(
  zipBuffer: Uint8Array,
  siteName: string,
  token: string,
  alias?: string
): Promise<{ deploymentId: string; url: string }> {
  const files = await extractZipFiles(zipBuffer);
  const uploadedFiles = await uploadFiles(files, token);
  const deployment = await createDeployment(siteName, uploadedFiles, token);
  const ready = await waitForDeployment(deployment.id, token);

  // Assign custom alias after deployment is ready
  if (alias) {
    await assignAlias(ready.id, alias, token);
  }

  const finalUrl = alias ? `https://${alias}` : `https://${ready.url}`;

  return {
    deploymentId: ready.id,
    url: finalUrl,
  };
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
 * Upload files to Vercel's file store under the team
 */
async function uploadFiles(
  files: Record<string, Buffer>,
  token: string
): Promise<VercelFile[]> {
  const uploaded: VercelFile[] = [];

  for (const [filename, content] of Object.entries(files)) {
    const sha = crypto.createHash("sha1").update(content).digest("hex");

    const res = await fetch(`${VERCEL_API}/v2/files?teamId=${VERCEL_TEAM_ID}`, {
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
 * Create a Vercel deployment under the team
 */
async function createDeployment(
  siteName: string,
  files: VercelFile[],
  token: string
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

  const res = await fetch(`${VERCEL_API}/v13/deployments?teamId=${VERCEL_TEAM_ID}`, {
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
 * Poll until deployment is READY
 */
async function waitForDeployment(
  deploymentId: string,
  token: string,
  maxAttempts = 30
): Promise<VercelDeployment> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${VERCEL_API}/v13/deployments/${deploymentId}?teamId=${VERCEL_TEAM_ID}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) throw new Error("Failed to check deployment status");

    const deployment: VercelDeployment = await res.json();

    if (deployment.readyState === "READY") return deployment;
    if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
      throw new Error(`Vercel deployment ${deployment.readyState}`);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error("Deployment timed out");
}

/**
 * Assign a custom alias to a ready deployment
 * Uses the deployment URL (vercel.app) as the ID format required by the API
 */
async function assignAlias(
  deploymentId: string,
  alias: string,
  token: string
): Promise<void> {
  const url = `${VERCEL_API}/v2/deployments/${deploymentId}/aliases?teamId=${VERCEL_TEAM_ID}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ alias }),
  });

  const data = await res.json();
  console.log(`[ALIAS] ${alias} → status ${res.status}:`, JSON.stringify(data));

  if (!res.ok && res.status !== 409) {
    console.error(`[ALIAS] ❌ Failed to assign ${alias}: ${JSON.stringify(data)}`);
  } else {
    console.log(`[ALIAS] ✅ Assigned ${alias}`);
  }
}
