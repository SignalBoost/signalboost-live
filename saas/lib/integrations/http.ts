import type { IntegrationResult } from './types.ts'

export type FetchLike = typeof fetch

export function integrationOk(data: any, mode: string): IntegrationResult {
  return { ok: true, data, mode }
}

export function integrationBad(mode: string, error?: string): IntegrationResult {
  return { ok: false, mode, error }
}

export async function integrationJson(
  fetcher: FetchLike,
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: any; headers: Headers }> {
  const response = await fetcher(url, init)
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, data, headers: response.headers }
}

export function bearer(token?: string): Record<string, string> {
  return { Authorization: `Bearer ${String(token || '')}`, 'Content-Type': 'application/json' }
}
