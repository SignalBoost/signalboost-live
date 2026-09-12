// saas/lib/ai/cos/practiceOutputDiagnostics.ts
/**
 * Diagnostic label for a practice reply no parser layer could read. The queue row is service-role
 * only and holds no rubric; the sample is a bounded prefix of the model's own output, kept short
 * enough that last_error stays readable and long enough to show whether the reply was empty,
 * truncated mid-string, prose instead of JSON, or a refusal.
 */
export function describeUnparseablePractice(raw: unknown): string {
  const text = String(raw ?? '')
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return `practice_json_unparseable:chars=${text.length}:sample=${collapsed.slice(0, 300) || '(empty)'}`
}
