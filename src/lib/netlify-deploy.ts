/**
 * Netlify Deploy Engine
 * Deploys a ZIP buffer as a new Netlify site and returns the live URL
 */

const NETLIFY_API = "https://api.netlify.com/api/v1";

interface NetlifySite {
  id: string;
  name: string;
  ssl_url: string;
  url: string;
}

interface NetlifyDeploy {
  id: string;
  site_id: string;
  ssl_url: string;
  url: string;
  state: string;
}

/**
 * Create a new Netlify site and deploy the ZIP to it
 */
export async function deployToNetlify(
  zipBuffer: Uint8Array,
  siteName: string,
  token: string
): Promise<{ siteId: string; url: string }> {
  // 1. Create a new site
  const site = await createSite(siteName, token);

  // 2. Deploy the ZIP to the site
  const deploy = await deployZip(site.id, zipBuffer, token);

  // 3. Wait for deploy to be ready
  const readyDeploy = await waitForDeploy(site.id, deploy.id, token);

  return {
    siteId: site.id,
    url: readyDeploy.ssl_url || readyDeploy.url,
  };
}

/**
 * Update an existing Netlify site with new ZIP
 */
export async function redeployToNetlify(
  siteId: string,
  zipBuffer: Uint8Array,
  token: string
): Promise<{ url: string }> {
  const deploy = await deployZip(siteId, zipBuffer, token);
  const readyDeploy = await waitForDeploy(siteId, deploy.id, token);
  return { url: readyDeploy.ssl_url || readyDeploy.url };
}

async function createSite(name: string, token: string): Promise<NetlifySite> {
  // Sanitize site name for Netlify subdomain
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);

  const uniqueName = `${sanitized}-${Date.now()}`;

  const res = await fetch(`${NETLIFY_API}/sites`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: uniqueName,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create Netlify site: ${err}`);
  }

  return res.json();
}

async function deployZip(
  siteId: string,
  zipBuffer: Uint8Array,
  token: string
): Promise<NetlifyDeploy> {
  const res = await fetch(`${NETLIFY_API}/sites/${siteId}/deploys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/zip",
    },
    body: zipBuffer,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to deploy ZIP to Netlify: ${err}`);
  }

  return res.json();
}

async function waitForDeploy(
  siteId: string,
  deployId: string,
  token: string,
  maxAttempts = 30
): Promise<NetlifyDeploy> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${NETLIFY_API}/sites/${siteId}/deploys/${deployId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) throw new Error("Failed to check deploy status");

    const deploy: NetlifyDeploy = await res.json();

    if (deploy.state === "ready") return deploy;
    if (deploy.state === "error") throw new Error("Netlify deploy failed");

    // Wait 2 seconds before next poll
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error("Deploy timed out after 60 seconds");
}

/**
 * Delete a Netlify site
 */
export async function deleteNetlifySite(
  siteId: string,
  token: string
): Promise<void> {
  await fetch(`${NETLIFY_API}/sites/${siteId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
