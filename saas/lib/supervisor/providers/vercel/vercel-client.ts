import type { VercelDeployment, VercelDeploymentsPage, VercelProjectMetadata, VercelReadOnlyClient } from './vercel-types.ts'
import { VercelObserverError } from './errors.ts'
import { sanitizeString } from './incident-mapper.ts'

const API = 'https://api.vercel.com'
function qs(params: Record<string, string | number | undefined>): string { const u = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.set(k, String(v)); return u.toString() ? `?${u.toString()}` : '' }
function retryAfterMs(value: string | null): number | undefined { if (!value) return undefined; const n = Number(value); if (Number.isFinite(n)) return Math.max(0, n * 1000); const d = Date.parse(value); return Number.isNaN(d) ? undefined : Math.max(0, d - Date.now()) }
async function readJson(res: Response): Promise<any> { try { return await res.json() } catch { return {} } }
async function handle(res: Response): Promise<any> {
  if (res.ok) return readJson(res)
  const status = res.status
  const category = status === 401 || status === 403 ? 'auth' : (status === 429 || status >= 500 ? 'unavailable' : 'unknown')
  throw new VercelObserverError(`Vercel API request failed with HTTP ${status}: ${sanitizeString((await readJson(res))?.error?.message || res.statusText, 200)}`, category, status, retryAfterMs(res.headers.get('retry-after')))
}
export class FetchVercelReadOnlyClient implements VercelReadOnlyClient {
  private async get(path: string, token: string): Promise<any> { return handle(await fetch(`${API}${path}`, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store' })) }
  async getProjectMetadata(input: { projectId: string; teamId?: string; token: string }): Promise<VercelProjectMetadata> { const data = await this.get(`/v9/projects/${encodeURIComponent(input.projectId)}${qs({ teamId: input.teamId })}`, input.token); return { id: String(data.id || input.projectId), name: data.name ? String(data.name) : undefined, targets: Array.isArray(data.targets) ? data.targets.map(String) : undefined } }
  async listRecentDeployments(input: { projectId: string; teamId?: string; environment?: any; limit: number; since: Date; token: string }): Promise<VercelDeploymentsPage> { const data = await this.get(`/v6/deployments${qs({ projectId: input.projectId, teamId: input.teamId, limit: input.limit, since: input.since.getTime(), target: input.environment === 'production' ? 'production' : input.environment === 'preview' ? 'preview' : undefined })}`, input.token); const deployments: VercelDeployment[] = Array.isArray(data.deployments) ? data.deployments.map((d: any) => ({ id: String(d.uid || d.id || ''), projectId: String(d.projectId || input.projectId), state: String(d.state || ''), target: d.target ? String(d.target) : undefined, createdAt: d.createdAt || d.created || 0, ready: d.ready || d.readyAt || null, url: d.url, meta: d.meta, error: d.error || d.errorMessage ? { code: d.errorCode, message: d.errorMessage || d.error } : null })) : []; return { deployments: deployments.filter(d => d.id) } }
  async getDeployment(input: { deploymentId: string; teamId?: string; token: string }): Promise<VercelDeployment> { const d = await this.get(`/v13/deployments/${encodeURIComponent(input.deploymentId)}${qs({ teamId: input.teamId })}`, input.token); return { id: String(d.uid || d.id || input.deploymentId), projectId: d.projectId, state: String(d.state || ''), target: d.target, createdAt: d.createdAt || d.created || 0, ready: d.ready || d.readyAt || null, url: d.url, meta: d.meta, error: d.error || d.errorMessage ? { code: d.errorCode, message: d.errorMessage || d.error } : null } }
}
