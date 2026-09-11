type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface ParsedAuditFinding {
  file: string
  severity: Severity
  category: string
  title: string
  detail: string
  recommendation: string
  line?: number
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

export type IsolatedAuditParseResult = Readonly<{
  findings: ParsedAuditFinding[]
  rejected: string[]
}>

export function parseAuditFindingsResponseIsolated(raw: string | null, file: string): IsolatedAuditParseResult {
  if (raw === null || !raw.trim()) throw new Error(`COS returned no Audit analysis for ${file}.`)

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.trim())
  } catch {
    throw new Error(`COS returned invalid Audit JSON for ${file}.`)
  }

  // The structured local-inference transport enforces a JSON object, so the
  // canonical response is { findings: [...] }. Keep legacy raw arrays readable
  // for older stored/tests without weakening malformed-output validation.
  const findings = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as Record<string, unknown>).findings)
      ? (parsed as { findings: unknown[] }).findings
      : null
  if (!findings) throw new Error(`COS Audit response did not contain a findings array for ${file}.`)

  const accepted: ParsedAuditFinding[] = []
  const rejected: string[] = []
  for (const [index, item] of findings.entries()) {
    let error = ''
    if (!item || typeof item !== 'object' || Array.isArray(item)) error = `COS returned a malformed Audit finding at index ${index} for ${file}.`
    const value = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
    const severity = typeof value.severity === 'string' ? value.severity.toLowerCase() as Severity : null
    if (!error && (!severity || !SEVERITIES.includes(severity))) error = `COS returned an invalid Audit severity at index ${index} for ${file}.`
    for (const field of ['category', 'title', 'detail', 'recommendation'] as const) {
      if (!error && (typeof value[field] !== 'string' || !value[field].trim())) error = `COS returned a malformed Audit ${field} at index ${index} for ${file}.`
    }
    if (!error && value.line !== undefined && (!Number.isInteger(value.line) || Number(value.line) < 1)) error = `COS returned an invalid Audit line at index ${index} for ${file}.`
    if (error || !severity) {
      rejected.push(error || `COS returned a malformed Audit finding at index ${index} for ${file}.`)
      continue
    }
    accepted.push({
      file,
      severity,
      category: value.category as string,
      title: value.title as string,
      detail: value.detail as string,
      recommendation: value.recommendation as string,
      line: value.line as number | undefined,
    })
  }
  return Object.freeze({ findings: accepted, rejected })
}

export function parseAuditFindingsResponse(raw: string | null, file: string): ParsedAuditFinding[] {
  const parsed = parseAuditFindingsResponseIsolated(raw, file)
  if (parsed.rejected.length) throw new Error(parsed.rejected[0])
  return parsed.findings
}
