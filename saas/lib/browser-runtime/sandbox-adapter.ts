import type { BrowserTask, BrowserTaskStep } from './contracts'

export const SANDBOX_ADAPTER_ID = 'signalboost.sandbox.v1'

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

export function buildSandboxBrowserTask(input: SandboxTaskInput): BrowserTask {
  const origin = normalizeBaseUrl(input.baseUrl)
  const steps: BrowserTaskStep[] = [
    { id: 'open-login', kind: 'navigate', url: `${origin}/browser-sandbox/login` },
    { id: 'wait-login', kind: 'wait_for', selector: '[data-browser-sandbox="login"]' },
    { id: 'fill-email', kind: 'fill', selector: '[name="email"]', valueRef: 'sandbox://credentials/email' },
    { id: 'fill-password', kind: 'fill', selector: '[name="password"]', valueRef: 'sandbox://credentials/password' },
    { id: 'submit-login', kind: 'click', selector: '[data-action="login"]' },
    { id: 'wait-dashboard', kind: 'wait_for', selector: '[data-browser-sandbox="dashboard"]' },
    { id: 'open-settings', kind: 'click', selector: '[data-action="open-settings"]' },
    { id: 'wait-settings', kind: 'wait_for', selector: '[data-browser-sandbox="settings"]' },
    { id: 'capture-ready', kind: 'screenshot', label: 'sandbox-settings-ready' },
    { id: 'approval-checkpoint', kind: 'checkpoint', label: 'Ready to prepare sandbox change', requiresApproval: true },
  ]

  return {
    taskId: input.taskId,
    incidentId: input.incidentId,
    provider: 'sandbox',
    adapterId: SANDBOX_ADAPTER_ID,
    mode: input.mode ?? 'observe',
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    allowedOrigins: [origin],
    steps,
    approvalToken: input.approvalToken,
    metadata: { sandboxVersion: 'v1' },
  }
}
