import type { MissionManualReviewDiagnostics } from './manual-review.ts'

export type MissionManualReviewDiagnosticsStatus = 'healthy' | 'warning' | 'empty'
export type MissionManualReviewDiagnosticsResponse = MissionManualReviewDiagnostics & { generatedAt: string; status: MissionManualReviewDiagnosticsStatus }

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))

export function manualReviewDiagnosticsStatus(diagnostics: MissionManualReviewDiagnostics, generatedAt: string): MissionManualReviewDiagnosticsStatus {
  if (diagnostics.total === 0) return 'empty'
  if (diagnostics.routed > 0 && diagnostics.newestRoutedAt && Date.parse(generatedAt) - Date.parse(diagnostics.newestRoutedAt) > 7 * 24 * 60 * 60 * 1000) return 'warning'
  return 'healthy'
}

export function createManualReviewDiagnosticsResponse(diagnostics: MissionManualReviewDiagnostics, generatedAt: string): MissionManualReviewDiagnosticsResponse {
  if (!isCount(diagnostics.total) || !isCount(diagnostics.routed) || diagnostics.routed > diagnostics.total || !isTimestamp(generatedAt)) throw new Error('invalid_manual_review_diagnostics')
  if ((diagnostics.oldestRoutedAt !== undefined && !isTimestamp(diagnostics.oldestRoutedAt)) || (diagnostics.newestRoutedAt !== undefined && !isTimestamp(diagnostics.newestRoutedAt)) || (diagnostics.duplicateRoutesPrevented !== undefined && !isCount(diagnostics.duplicateRoutesPrevented))) throw new Error('invalid_manual_review_diagnostics')
  return { generatedAt, total: diagnostics.total, routed: diagnostics.routed, ...(diagnostics.oldestRoutedAt ? { oldestRoutedAt: diagnostics.oldestRoutedAt } : {}), ...(diagnostics.newestRoutedAt ? { newestRoutedAt: diagnostics.newestRoutedAt } : {}), ...(diagnostics.duplicateRoutesPrevented !== undefined ? { duplicateRoutesPrevented: diagnostics.duplicateRoutesPrevented } : {}), status: manualReviewDiagnosticsStatus(diagnostics, generatedAt) }
}

export function parseManualReviewDiagnosticsResponse(value: unknown): MissionManualReviewDiagnosticsResponse | null {
  if (!isRecord(value) || !isTimestamp(value.generatedAt) || !isCount(value.total) || !isCount(value.routed) || value.routed > value.total || !['healthy', 'warning', 'empty'].includes(value.status as string)) return null
  if ((value.oldestRoutedAt !== undefined && !isTimestamp(value.oldestRoutedAt)) || (value.newestRoutedAt !== undefined && !isTimestamp(value.newestRoutedAt)) || (value.duplicateRoutesPrevented !== undefined && !isCount(value.duplicateRoutesPrevented))) return null
  return { generatedAt:value.generatedAt, total:value.total, routed:value.routed, ...(isTimestamp(value.oldestRoutedAt)?{oldestRoutedAt:value.oldestRoutedAt}:{}), ...(isTimestamp(value.newestRoutedAt)?{newestRoutedAt:value.newestRoutedAt}:{}), ...(isCount(value.duplicateRoutesPrevented)?{duplicateRoutesPrevented:value.duplicateRoutesPrevented}:{}), status:value.status as MissionManualReviewDiagnosticsStatus }
}
