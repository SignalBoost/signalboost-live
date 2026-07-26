// saas/lib/browser-runtime/sandbox-adapter.ts

import type { BrowserTask, BrowserTaskStep } from './contracts.ts'
import { SANDBOX_ADAPTER_ID } from './adapter-identifiers.ts'

export { SANDBOX_ADAPTER_ID } from './adapter-identifiers.ts'

export interface SandboxTaskInput {
  taskId: string
  incidentId: string
  baseUrl: string
  issuedAt: string
  expiresAt: string
  approvalToken: string
  mode?: 'observe' | 'prepare_change'
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Unsupported sandbox protocol: ${url.protocol}`)
  }
  return url.origin
}

function navigationSteps(origin: string): BrowserTaskStep[] {
  return [
    { id: 'open-login', kind: 'navigate', url: `${origin}/browser-sandbox/login` },
    { id: 'wait-login', kind: 'wait_for', selector: '[data-browser-sandbox="login"]' },
    { id: 'fill-email', kind: 'fill', selector: '[name="email"]', valueRef: 'sandbox://credentials/email' },
    { id: 'fill-password', kind: 'fill', selector: '[name="password"]', valueRef: 'sandbox://credentials/password' },
    { id: 'submit-login', kind: 'click', selector: '[data-action="login"]' },
    { id: 'wait-dashboard', kind: 'wait_for', selector: '[data-browser-sandbox="dashboard"]' },
    { id: 'open-settings', kind: 'click', selector: '[data-action="open-settings"]' },
    { id: 'wait-settings', kind: 'wait_for', selector: '[data-browser-sandbox="settings"]' },
  ]
}

function protectedSaveSteps(): BrowserTaskStep[] {
  return [
    { id: 'protected-save', kind: 'click', selector: '[data-action="protected-save"]' },
    { id: 'wait-save-success', kind: 'wait_for', selector: '[data-browser-sandbox="save-success"]' },
    { id: 'capture-after-save', kind: 'screenshot', label: 'sandbox-after-protected-save' },
  ]
}

export function buildSandboxBrowserTask(input: SandboxTaskInput): BrowserTask {
  const origin = normalizeBaseUrl(input.baseUrl)
  const steps: BrowserTaskStep[] = [
    ...navigationSteps(origin),
    { id: 'fill-sandbox-value', kind: 'fill', selector: '[name="sandboxValue"]', valueRef: 'sandbox://settings/value' },
    { id: 'capture-ready', kind: 'screenshot', label: 'sandbox-settings-ready' },
    { id: 'approval-checkpoint', kind: 'checkpoint', label: 'Ready to save sandbox change', requiresApproval: true },
    ...protectedSaveSteps(),
  ]

  return {
    taskId: input.taskId,
    incidentId: input.incidentId,
    provider: 'sandbox',
    adapterId: SANDBOX_ADAPTER_ID,
    mode: input.mode ?? 'prepare_change',
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    allowedOrigins: [origin],
    steps,
    approvalToken: input.approvalToken,
    metadata: { sandboxVersion: 'v1', phase: 'two-phase-resumable' },
  }
}

export function buildSandboxProtectedSaveTask(input: SandboxTaskInput): BrowserTask {
  const origin = normalizeBaseUrl(input.baseUrl)
  const steps: BrowserTaskStep[] = [
    ...navigationSteps(origin),
    { id: 'fill-sandbox-value', kind: 'fill', selector: '[name="sandboxValue"]', valueRef: 'sandbox://settings/value' },
    { id: 'capture-before-save', kind: 'screenshot', label: 'sandbox-before-protected-save' },
    ...protectedSaveSteps(),
  ]

  return {
    taskId: input.taskId,
    incidentId: input.incidentId,
    provider: 'sandbox',
    adapterId: SANDBOX_ADAPTER_ID,
    mode: 'prepare_change',
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    allowedOrigins: [origin],
    steps,
    approvalToken: input.approvalToken,
    metadata: { sandboxVersion: 'v1', phase: 'approved-save-legacy-replay' },
  }
}
