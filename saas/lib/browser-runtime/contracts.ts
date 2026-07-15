// Portable Browser Runtime contracts.
// This module must remain independent of Next.js, SignalBoost UI, Supabase, and provider SDKs.

export type BrowserTaskMode = 'observe' | 'prepare_change' | 'execute_change'
export type BrowserTaskStatus = 'completed' | 'paused' | 'blocked' | 'failed'

export type BrowserTaskStep =
  | { id: string; kind: 'navigate'; url: string }
  | { id: string; kind: 'click'; selector: string }
  | { id: string; kind: 'fill'; selector: string; valueRef: string }
  | { id: string; kind: 'wait_for'; selector: string; timeoutMs?: number }
  | { id: string; kind: 'screenshot'; label: string }
  | { id: string; kind: 'checkpoint'; label: string; requiresApproval: true }

export interface BrowserTask {
  taskId: string
  incidentId: string
  provider: string
  adapterId: string
  mode: BrowserTaskMode
  issuedAt: string
  expiresAt: string
  allowedOrigins: string[]
  steps: BrowserTaskStep[]
  approvalToken: string
  metadata?: Record<string, unknown>
}

export interface BrowserEvidence {
  sequence: number
  timestamp: string
  stepId: string
  kind: 'navigation' | 'interaction' | 'screenshot' | 'checkpoint' | 'error'
  summary: string
  artifactRef?: string
  url?: string
}

export interface BrowserEvidencePackage {
  taskId: string
  incidentId: string
  provider: string
  adapterId: string
  approvalTokenDigest: string
  startedAt: string
  completedAt: string
  orderedActionLog: BrowserEvidence[]
  screenshots: string[]
  finalUrl: string
  browserRuntimeVersion: string
  evidenceHash: string
}

export interface BrowserVerificationResult {
  ok: boolean
  checkedAt: string
  errors: string[]
}

export interface BrowserTaskResult {
  taskId: string
  incidentId: string
  provider: string
  status: BrowserTaskStatus
  startedAt: string
  finishedAt: string
  completedStepIds: string[]
  pausedAtStepId?: string
  executionId?: string
  evidence: BrowserEvidence[]
  evidencePackage?: BrowserEvidencePackage
  verification: 'pending' | BrowserVerificationResult
  error?: string
}

export interface BrowserAdapterContext {
  resolveSecretRef(valueRef: string): Promise<string>
  captureScreenshot(label: string): Promise<string>
}

export interface BrowserPagePort {
  url(): string
  goto(url: string): Promise<void>
  click(selector: string): Promise<void>
  fill(selector: string, value: string): Promise<void>
  waitForSelector(selector: string, timeoutMs?: number): Promise<void>
  textContent?(selector: string): Promise<string | null>
}

export interface BrowserSessionPort {
  page: BrowserPagePort
  close(): Promise<void>
}

export interface BrowserSessionFactory {
  open(task: BrowserTask): Promise<BrowserSessionPort>
}
