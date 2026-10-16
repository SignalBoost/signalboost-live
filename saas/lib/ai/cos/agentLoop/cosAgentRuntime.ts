// saas/lib/ai/cos/agentLoop/cosAgentRuntime.ts
//
// Production bindings for the COS agent loop: the platform's search, the SSRF-guarded public
// fetch, the Vercel Sandbox Python session, the governed Playwright port (owner only, pinned to
// the one origin being opened). The model turn is owned by the canonical COS agent seam
// (cosAgentDecision.ts → runCosAgentToolTurn).
// A buyer replaces these bindings, not the loop.

import { getExternalInfo } from '../../tools/getExternalInfo.ts'
import { assertPublicHttpUrl, guardedPublicFetch } from '../../../security/publicFetchGuard.ts'
import { createBuilderPlaywrightCliPort } from '../../../builder/playwright-cli-port.ts'
import { VercelPythonSession } from './pythonSandbox.ts'
import type { AgentBrowseResult, AgentToolPolicy, AgentToolPorts } from './cosAgentTools.ts'

const FETCH_HEADERS = Object.freeze({
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
  accept: 'application/json,text/csv,text/html;q=0.9,*/*;q=0.8',
})

/** Code execution is open to every surface with per-turn caps; the real browser stays owner-only. */
export function cosAgentToolPolicy(input: { ownerAuthenticated: boolean; signedIn: boolean }): AgentToolPolicy {
  return Object.freeze({ maxPythonRuns: input.signedIn || input.ownerAuthenticated ? 4 : 2, browserAllowed: input.ownerAuthenticated })
}

async function browseWithPlaywright(url: string, budgetMs: number): Promise<AgentBrowseResult> {
  let origin: string
  try {
    const parsed = await assertPublicHttpUrl(url)
    if (parsed.protocol !== 'https:') return { ok: false, text: '', error: 'https_required' }
    origin = parsed.origin
  } catch {
    return { ok: false, text: '', error: 'destination_rejected' }
  }
  // The governed Builder port, with its network and origin allowlist narrowed to this one origin.
  const port = createBuilderPlaywrightCliPort({ ownerAuthorized: true, env: { ...process.env, BUILDER_PLAYWRIGHT_CLI_ALLOWED_ORIGINS: origin } })
  const work = (async (): Promise<AgentBrowseResult> => {
    const opened = await port.invoke({ action: 'open', url })
    if (!opened.ok) return { ok: false, text: '', error: opened.failureCode || 'open_failed' }
    const snapshot = await port.invoke({ action: 'snapshot' })
    return snapshot.ok ? { ok: true, text: snapshot.stdout } : { ok: false, text: '', error: snapshot.failureCode || 'snapshot_failed' }
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<AgentBrowseResult>(resolve => { timer = setTimeout(() => resolve({ ok: false, text: '', error: 'browser_budget_exceeded' }), budgetMs) })
  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer) clearTimeout(timer)
    await port.close().catch(() => undefined)
  }
}

export function createCosAgentPorts(policy: AgentToolPolicy): AgentToolPorts {
  return Object.freeze({
    async search(query: string) {
      const found = await getExternalInfo(query, 8, { bypassCache: true })
      return found.results.map(result => ({ title: result.title, url: result.url, snippet: result.snippet }))
    },
    fetchPublic: (url: string) => guardedPublicFetch(url, { headers: { ...FETCH_HEADERS }, timeoutMs: 12_000, maxBytes: 3_000_000 }),
    python: new VercelPythonSession(),
    ...(policy.browserAllowed ? { browse: browseWithPlaywright } : {}),
  })
}
