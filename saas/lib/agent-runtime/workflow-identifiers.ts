export interface WorkflowIdentifierFactory { create(prefix: 'audit' | 'workspace'): string }

const CONTROL = /[\u0000-\u001f\u007f]/g
const PATH_TRAVERSAL = /(?:^|[\\/])\.\.(?:[\\/]|$)/
const ABSOLUTE_PATH = /^(?:[\\/]|[a-zA-Z]:[\\/])/ 
const URL_OR_CREDENTIAL = /(?:https?:\/\/|(?:api[ _-]?key|token|secret|password)\s*[=:]|bearer\s+)/i
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

export class WorkflowIdentifierError extends Error { constructor(message: string) { super(message); this.name = 'WorkflowIdentifierError' } }

export function normalizeWorkflowIdentifier(value: string, maximumLength = 128): string {
  if (typeof value !== 'string') throw new WorkflowIdentifierError('Identifier must be a string.')
  const normalized = value.replace(CONTROL, '').trim()
  if (!normalized || normalized.length > maximumLength || PATH_TRAVERSAL.test(normalized) || ABSOLUTE_PATH.test(normalized) || URL_OR_CREDENTIAL.test(normalized) || !SAFE.test(normalized)) throw new WorkflowIdentifierError('Identifier is invalid.')
  return normalized
}
export const normalizeRequestId = (value: string) => normalizeWorkflowIdentifier(value, 128)
export const normalizeWorkflowId = (value: string) => normalizeWorkflowIdentifier(value, 128)
export const normalizeUserId = (value: string) => normalizeWorkflowIdentifier(value, 128)
export const normalizeAuditEventId = (value: string) => normalizeWorkflowIdentifier(value, 128)
export const normalizeVirtualWorkspaceId = (value: string) => normalizeWorkflowIdentifier(value, 128)
export function createWorkflowAuditId(factory: WorkflowIdentifierFactory): string { return normalizeAuditEventId(factory.create('audit')) }
export function createVirtualWorkspaceId(workflowId: string, factory?: WorkflowIdentifierFactory): string { return normalizeVirtualWorkspaceId(factory ? factory.create('workspace') : `workspace:${normalizeWorkflowId(workflowId)}`) }
