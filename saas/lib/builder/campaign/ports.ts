// saas/lib/builder/campaign/ports.ts
//
// WHAT A HOST MUST PROVIDE FOR A CAMPAIGN TO RUN. The runner (runner.ts) is pure and executes catalog items through
// these ports; a port the host leaves undefined makes its items BLOCKED with that cause. Every result carries the
// evidence the ledger records; the runner never invents one.

import type { CampaignEvidence, CampaignVerdict } from './ledger.ts'
import type { BrowserSession } from './browserChecks.ts'

export type PortResult = Readonly<{
  verdict: CampaignVerdict
  actual: string
  correlationId?: string | null
  evidence: readonly CampaignEvidence[]
  failureCause?: string | null
}>

export type AnalysisOutcome = Readonly<{
  /** HTTP status of the production path, or null when the request never completed. */
  status: number | null
  ok: boolean
  reply: string
  source: string
  correlationId: string | null
  latencyMs: number
  /** The revision the live site reported it served this request from (its own response header), or null. */
  servedCommit: string | null
  /** Provenance fields the production path returns; recorded, never interpreted beyond what is listed here. */
  model: string | null
  localModelInvoked: boolean | null
  executionAllowed: boolean | null
}>

export type CampaignPorts = Readonly<{
  /** The repository's current main commit. The production commit is what the live site reports serving each request. */
  deployment: () => Promise<Readonly<{ mainCommit: string | null }>>
  /** One real request on the production path. */
  analysis?: (prompt: string, signal?: AbortSignal) => Promise<AnalysisOutcome>
  /** One real request whose routing decision is read back (did it enter the Builder?). */
  routing?: (prompt: string, signal?: AbortSignal) => Promise<Readonly<{ outcome: AnalysisOutcome; enteredBuilder: boolean }>>
  /**
   * One controlled provider fault against the reasoner, in isolation. `productionCommit` is the revision under
   * test; a host whose own code is another revision must BLOCK, never certify production with code it lacks.
   */
  fault?: (fault: 'runpod_busy' | 'model_timeout' | 'output_truncation' | 'malformed_output', productionCommit: string | null, signal?: AbortSignal) => Promise<PortResult>
  /**
   * One real browser check (browserChecks.ts). The session carries the browser across slices: the port continues
   * a pending session, and `done` ends the sandbox once the last browser item has finished.
   */
  browser?: (testId: string, session: BrowserSession | null, slice: Readonly<{ remainingMs: () => number; last: boolean }>, signal?: AbortSignal) => Promise<
    | Readonly<{ status: 'done'; result: PortResult; session: BrowserSession }>
    | Readonly<{ status: 'pending'; session: BrowserSession }>
  >
  observability?: (correlationIds: readonly string[], signal?: AbortSignal) => Promise<PortResult>
  governance?: (signal?: AbortSignal) => Promise<PortResult>
  builderFixture?: (signal?: AbortSignal) => Promise<PortResult>
  release?: (productionCommit: string | null, signal?: AbortSignal) => Promise<PortResult>
}>
