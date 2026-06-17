// lib/infra-pr/redeploy.ts
// Fires a Vercel production redeploy. Preferred path: a Deploy Hook URL
// (VERCEL_DEPLOY_HOOK_URL) — a single POST, no token handling. Fallback:
// the Deployments API, which redeploys the latest production deployment.
type R = { ok: boolean; data?: any; error?: string };

export async function triggerProductionRedeploy(): Promise<R> {
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (hook) {
    try {
      const res = await fetch(hook, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: `Deploy hook returned ${res.status}` };
      return { ok: true, data: { via: 'deploy_hook', ...body } };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'deploy hook request failed' };
    }
  }

  // Fallback: Deployments API. Needs a token + project. Re-deploys the
  // most recent production deployment using its captured gitSource.
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID; // optional
  if (!token || !projectId) {
    return {
      ok: false,
      error:
        'No VERCEL_DEPLOY_HOOK_URL set, and VERCEL_TOKEN / VERCEL_PROJECT_ID missing for API fallback',
    };
  }

  const team = teamId ? `&teamId=${teamId}` : '';
  try {
    const listRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&target=production&limit=1${team}`,
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
    return { ok: true, data: { via: 'deployments_api', id: createBody?.id, url: createBody?.url } };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'redeploy API request failed' };
  }
}
