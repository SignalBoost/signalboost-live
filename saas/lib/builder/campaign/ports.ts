// saas/lib/builder/campaign/ports.ts
//
// WHAT A HOST MUST PROVIDE FOR A CAMPAIGN TO RUN. The runner (runner.ts) is pure and executes catalog items through
// these ports; a port the host leaves undefined makes its items BLOCKED with that cause. Every result carries the
// evidence the ledger records; the runner never invents one.

import type { CampaignEvidence, CampaignVerdict } from './ledger.ts'

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
  fault?: (fault: 'runpod_busy' | 'model_timeout' | 'output_truncation' | 'malformed_output', signal?: AbortSignal) => Promise<PortResult>
  browser?: (testId: string, signal?: AbortSignal) => Promise<PortResult>
  observability?: (correlationIds: readonly string[], signal?: AbortSignal) => Promise<PortResult>
  governance?: (signal?: AbortSignal) => Promise<PortResult>
  builderFixture?: (signal?: AbortSignal) => Promise<PortResult>
  release?: (productionCommit: string | null, signal?: AbortSignal) => Promise<PortResult>
}>
