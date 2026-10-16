// saas/lib/ai/cos/agentLoop/agentLiveFactRelease.ts
//
// The live-evidence release gate for answers the agent loop produces to live-fact questions. The
// one-pass fresh synthesis releases an answer only when it cites retrieved evidence that meets the
// question's citation requirement (office-holder authority, independent corroboration, life status).
// Agent answers meet the SAME requirement: the loop verifies numbers and URLs, but an answer that
// cites nothing it retrieved could be model memory and is not released as grounded (Codex #4564).

import { replyCitesRequiredFreshEvidence } from '../cosFreshAuthority.ts'
import { freshEvidenceHost, type FreshEvidenceSource } from '../cosFreshGroundingBase.ts'

const URL_IN_TEXT = /https?:\/\/[^\s)\]>"']+/g

const urlKey = (value: string): string => {
  try {
    const url = new URL(value)
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return value.trim().toLowerCase()
  }
}

/** Retrieved sources as structured evidence records (id, title, url), for release checks and provenance. */
export function agentEvidenceSources(urls: readonly string[], known: readonly FreshEvidenceSource[] = []): FreshEvidenceSource[] {
  const byKey = new Map(known.map(source => [urlKey(source.url), source] as const))
  const seen = new Set<string>()
  const sources: FreshEvidenceSource[] = []
  for (const url of urls) {
    const key = urlKey(url)
    if (seen.has(key)) continue
    seen.add(key)
    const match = byKey.get(key)
    sources.push({ ...(match || { title: freshEvidenceHost(url) || url, url, snippet: '' }), id: `LIVE${sources.length + 1}` })
  }
  return sources
}

/** The retrieved sources the reply actually cites. */
export function citedAgentSources(reply: string, retrieved: readonly FreshEvidenceSource[]): FreshEvidenceSource[] {
  const cited = new Set([...String(reply || '').matchAll(URL_IN_TEXT)].map(match => urlKey(match[0].replace(/[.,;:]+$/, ''))))
  return retrieved.filter(source => cited.has(urlKey(source.url)))
}

/** True when the reply cites retrieved evidence that satisfies the question's citation requirement. */
export function agentLiveFactReleasable(reply: string, input: string, retrieved: readonly FreshEvidenceSource[]): boolean {
  const cited = citedAgentSources(reply, retrieved)
  if (!cited.length) return false
  const probe = cited.map(source => `[${source.id}] (${source.url})`).join(' ')
  return replyCitesRequiredFreshEvidence(probe, input, cited)
}
