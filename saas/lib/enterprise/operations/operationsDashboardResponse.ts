import { parseOperationsIntelligenceSnapshot } from './operationsSnapshotStore'
import type { OperationsIntelligenceSnapshot } from './operationsIntelligence'

export const OPERATIONS_RESPONSE_SCHEMA_VERSION = 'operations-intelligence-response-v1' as const

export type OperationsDashboardApiResponse = Readonly<{
  schemaVersion: typeof OPERATIONS_RESPONSE_SCHEMA_VERSION
  snapshot?: OperationsIntelligenceSnapshot
  error?: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseOperationsDashboardApiResponse(value: unknown): OperationsDashboardApiResponse {
  if (!isRecord(value)) throw new Error('Operations response must be an object.')
  if (value.schemaVersion !== OPERATIONS_RESPONSE_SCHEMA_VERSION) throw new Error('Operations response schema is unsupported.')

  const error = value.error
  if (error !== undefined && (typeof error !== 'string' || !error.trim())) throw new Error('Operations response error is invalid.')

  const snapshot = value.snapshot === undefined ? undefined : parseOperationsIntelligenceSnapshot(value.snapshot)
  if (!snapshot && !error) throw new Error('Operations response requires a snapshot or error.')
  if (snapshot && error) throw new Error('Operations response cannot contain both snapshot and error.')

  return {
    schemaVersion: OPERATIONS_RESPONSE_SCHEMA_VERSION,
    ...(snapshot ? { snapshot } : {}),
    ...(typeof error === 'string' ? { error } : {}),
  }
}
