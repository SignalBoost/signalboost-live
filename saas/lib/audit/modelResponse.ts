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

export function parseAuditFindingsResponse(raw: string | null, file: string): ParsedAuditFinding[] {
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

  return findings.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`COS returned a malformed Audit finding at index ${index} for ${file}.`)
    }
    const value = item as Record<string, unknown>
    const severity = typeof value.severity === 'string' ? value.severity.toLowerCase() as Severity : null
    if (!severity || !SEVERITIES.includes(severity)) {
      throw new Error(`COS returned an invalid Audit severity at index ${index} for ${file}.`)
    }
    for (const field of ['category', 'title', 'detail', 'recommendation'] as const) {
      if (typeof value[field] !== 'string' || !value[field].trim()) {
        throw new Error(`COS returned a malformed Audit ${field} at index ${index} for ${file}.`)
      }
    }
    if (value.line !== undefined && (!Number.isInteger(value.line) || Number(value.line) < 1)) {
      throw new Error(`COS returned an invalid Audit line at index ${index} for ${file}.`)
    }
    return {
      file,
      severity,
      category: value.category as string,
      title: value.title as string,
      detail: value.detail as string,
      recommendation: value.recommendation as string,
      line: value.line as number | undefined,
    }
  })
}
