export interface WorkflowIdentifierFactory { create(prefix: 'audit' | 'workspace'): string }

const CONTROL = /[\u0000-\u001f\u007f]/g
const TRAVERSAL = /(?:^|[\\/])\.\.(?:[\\/]|$)/
const ABSOLUTE = /^(?:[\\/]|[A-Za-z]:[\\/])/
const SECRET = /(?:https?:\/\/|bearer\s+|(?:api[_ -]?key|token|secret|password|authorization)\s*[=:])/i
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

export class WorkflowIdentifierError extends Error { constructor(message = 'Identifier is invalid.') { super(message); this.name = 'WorkflowIdentifierError' } }

/** Logical identifiers only: this module never turns an identifier into a host path. */
export function normalizeWorkflowIdentifier(value: string, maximumLength = 128): string {
  if (typeof value !== 'string') throw new WorkflowIdentifierError()
  const normalized = value.replace(CONTROL, '').trim()
  if (!normalized || normalized.length > maximumLength || TRAVERSAL.test(normalized) || ABSOLUTE.test(normalized) || SECRET.test(normalized) || !SAFE.test(normalized)) throw new WorkflowIdentifierError()
  return normalized
}
export const normalizeRequestId = (value: string) => normalizeWorkflowIdentifier(value, 128)
export const normalizeWorkflowId = (value: string) => normalizeWorkflowIdentifier(value, 128)
export const normalizeUserId = (value: string) => normalizeWorkflowIdentifier(value, 128)
export const normalizeAuditEventId = (value: string) => normalizeWorkflowIdentifier(value, 128)
export const normalizeVirtualWorkspaceId = (value: string) => normalizeWorkflowIdentifier(value, 128)
export const createWorkflowAuditId = (factory: WorkflowIdentifierFactory) => normalizeAuditEventId(factory.create('audit'))
export const createVirtualWorkspaceId = (workflowId: string, factory?: WorkflowIdentifierFactory) => normalizeVirtualWorkspaceId(factory ? factory.create('workspace') : `workspace:${normalizeWorkflowId(workflowId)}`)
