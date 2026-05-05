/**
 * Vercel Deploy Engine v3
 * KEY FIX: All sites deployed under the SAME project name "build-factory"
 * This is required for Hobby plan — custom domains only work on projects
 * that already have the domain configured.
 */

import JSZip from "jszip";
import crypto from "crypto";

const VERCEL_API = "https://api.vercel.com";

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

export async function deployToVercel(
  zipBuffer: Uint8Array,
  siteName: string,
  token: string,
  alias?: string
): Promise<{ deploymentId: string; url: string }> {
  const files = await extractZipFiles(zipBuffer);
  const uploadedFiles = await uploadFiles(files, token);
  const deployment = await createDeployment(uploadedFiles, token, alias);
  const ready = await waitForDeployment(deployment.id, token);

  let finalUrl = `https://${ready.url}`;

  if (alias) {
    try {
      await assignAlias(ready.id, alias, token);
      finalUrl = `https://${alias}`;
      console.log(`[DOMAIN] ✅ Alias assigned: ${alias}`);
    } catch (e: any) {
      console.error(`[DOMAIN] ❌ Failed: ${e.message}`);
      finalUrl = `https://${ready.url}`;
    }
  }

  return { deploymentId: ready.id, url: finalUrl };
}

async function assignAlias(deploymentId: string, alias: string, token: string): Promise<void> {
  const res = await fetch(`${VERCEL_API}/v2/deployments/${deploymentId}/aliases`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ alias }),
  });

  const data = await res.json();

  // 409 = already assigned to this deployment = OK
  if (res.status === 409) {
    console.log(`[DOMAIN] Already assigned: ${alias}`);
    return;
  }

  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }
}

async function extractZipFiles(zipBuffer: Uint8Array): Promise<Record<string, Buffer>> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const files: Record<string, Buffer> = {};
  const allFiles = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
  const rootFolders = new Set(allFiles.map((f) => f.split("/")[0]));
  const hasSingleRoot = rootFolders.size === 1 && allFiles.every((f) => f.includes("/"));
  const rootPrefix = hasSingleRoot ? [...rootFolders][0] + "/" : "";

  for (const [filename, file] of Object.entries(zip.files)) {
    if ((file as any).dir) continue;
    const outputName = rootPrefix && filename.startsWith(rootPrefix)
      ? filename.slice(rootPrefix.length) : filename;
    if (!outputName) continue;
    files[outputName] = Buffer.from(await (file as any).async("arraybuffer"));
  }
  return files;
}

async function uploadFiles(files: Record<string, Buffer>, token: string): Promise<VercelFile[]> {
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
      console.error(`Failed to upload ${filename}: ${await res.text()}`);
    }
    uploaded.push({ file: filename, sha, size: content.length });
  }
  return uploaded;
}

async function createDeployment(
  files: VercelFile[],
  token: string,
  alias?: string
): Promise<VercelDeployment> {
  // ── THE KEY FIX ──────────────────────────────────────────────────────────
  // Always use "build-factory" as the project name so all deployments go
  // under the same Vercel project that already has *.yako.studio configured.
  // Creating a new project per site fails on Hobby plan (403 on custom domains).
  // ─────────────────────────────────────────────────────────────────────────
  const body: any = {
    name: "build-factory",
    files,
    projectSettings: {
      framework: null,
      outputDirectory: null,
      buildCommand: null,
      installCommand: null,
    },
    target: "production",
  };

  if (alias) body.alias = [alias];

  const res = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Vercel deployment failed: ${await res.text()}`);
  }

  return res.json();
}

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
    if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
      throw new Error(`Deployment ${deployment.readyState}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Deployment timed out");
}
