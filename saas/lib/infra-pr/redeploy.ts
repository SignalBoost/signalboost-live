// lib/infra-pr/redeploy.ts
// Production redeploy. General callers may use a deploy hook; governed Self-Healing retries require
// the authenticated Deployments API because later objective verification must name the exact
// deployment created by this operation.
type R = { ok: boolean; data?: any; error?: string };

export async function triggerProductionRedeploy(options: { requireExactIdentity?: boolean } = {}): Promise<R> {
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!options.requireExactIdentity && hook) {
    try {
      const res = await fetch(hook, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: `Deploy hook returned ${res.status}` };
      return { ok: true, data: { ...body, via: 'deploy_hook' } };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'deploy hook request failed' };
    }
  }

  if (!token || !projectId) {
    return {
      ok: false,
      error: options.requireExactIdentity
        ? 'VERCEL_TOKEN / VERCEL_PROJECT_ID are required for an exactly verifiable production redeploy'
        : 'No VERCEL_DEPLOY_HOOK_URL, and VERCEL_TOKEN / VERCEL_PROJECT_ID missing for fallback',
    };
  }

  const team = teamId ? `&teamId=${encodeURIComponent(teamId)}` : '';
  try {
    const listRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=1${team}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const listBody = await listRes.json();
    if (!listRes.ok) {
      return { ok: false, error: listBody?.error?.message || `list deployments ${listRes.status}` };
    }
    const latest = (listBody?.deployments || [])[0];
    if (!latest) return { ok: false, error: 'No prior production deployment to redeploy' };

    const createRes = await fetch(`https://api.vercel.com/v13/deployments?${team.slice(1)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: latest.name,
        project: projectId,
        target: 'production',
        deploymentId: latest.uid,
        meta: { redeployReason: 'infra-pr-merge' },
      }),
    });
    const createBody = await createRes.json();
    if (!createRes.ok) {
      return { ok: false, error: createBody?.error?.message || `redeploy ${createRes.status}` };
    }
    const deploymentId = typeof createBody?.id === 'string' ? createBody.id.trim() : '';
    if (options.requireExactIdentity && !deploymentId) {
      return { ok: false, error: 'Vercel redeploy succeeded without returning an exact deployment id' };
    }
    const deploymentUrl = typeof createBody?.url === 'string' && createBody.url.trim()
      ? (createBody.url.startsWith('http://') || createBody.url.startsWith('https://') ? createBody.url : `https://${createBody.url}`)
      : null;
    return {
      ok: true,
      data: {
        via: 'deployments_api',
        id: deploymentId || undefined,
        url: createBody?.url,
        deploymentId: deploymentId || undefined,
        deploymentUrl,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'redeploy API request failed' };
  }
}
