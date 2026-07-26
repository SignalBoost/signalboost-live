// saas/lib/hub/browser-agent-dry-run.ts
import { createHash } from 'crypto'

import { buildProviderActionPreviewFromRequest } from './provider-action-preview-request.ts'
import { createProviderExecutionPolicy, type ProviderExecutionPolicy } from './provider-execution-modes.ts'

export type BrowserAgentDryRunPackage = Readonly<{
  packageId: string
  schemaVersion: 'hub-browser-agent-dry-run-v1'
  mode: 'dry_run'
  adapterId: string
  approvedOrigin: string
  preview: ReturnType<typeof buildProviderActionPreviewFromRequest>['preview']
  approvalRequired: true
  runtimeApprovalCreated: false
  browserLaunched: false
  providerMutationExecuted: false
  createdAt: string
}>

export function createBrowserAgentPolicy(input: {
  adapterId: string
  approvedOrigin: string
}): ProviderExecutionPolicy {
  return createProviderExecutionPolicy({
    preferredMode: 'browser_agent',
    capabilities: [{
      mode: 'browser_agent',
      available: true,
      endpoint: '/api/hub/action/browser-agent/dry-run',
      browserAdapterId: input.adapterId,
      approvedOrigin: input.approvedOrigin,
    }],
  })
}

export function buildBrowserAgentDryRunPackage(input: {
  templateId: string
  payload: Record<string, unknown>
  adapterId: string
  approvedOrigin: string
  now?: Date
}): BrowserAgentDryRunPackage {
  const adapterId = String(input.adapterId || '').trim()
  if (!adapterId) throw new Error('browser_adapter_required')

  const policy = createBrowserAgentPolicy({ adapterId, approvedOrigin: input.approvedOrigin })
  const preview = buildProviderActionPreviewFromRequest({
    templateId: input.templateId,
    payload: input.payload,
    mode: 'browser_agent',
    policy,
  }).preview

  const createdAt = (input.now ?? new Date()).toISOString()
  const packageId = createHash('sha256')
    .update(JSON.stringify({
      templateId: preview.templateId,
      adapterId,
      approvedOrigin: input.approvedOrigin,
      payload: preview.payload,
      createdAt,
    }))
    .digest('hex')

  return Object.freeze({
    packageId,
    schemaVersion: 'hub-browser-agent-dry-run-v1',
    mode: 'dry_run',
    adapterId,
    approvedOrigin: input.approvedOrigin,
    preview,
    approvalRequired: true,
    runtimeApprovalCreated: false,
    browserLaunched: false,
    providerMutationExecuted: false,
    createdAt,
  })
}
