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

function parseCandidate(candidate: string): unknown | null {
  try { return JSON.parse(candidate) } catch { return null }
}

function structuredPayload(raw: string): unknown | null {
  const trimmed = raw.trim()
  const candidates: string[] = [trimmed]

  // Local and hosted reasoners occasionally wrap otherwise-valid JSON in a
  // markdown fence or a short explanatory prefix despite the JSON-only contract.
  // Recover the structured payload without weakening the finding schema below.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())

  const arrayStart = trimmed.indexOf('[')
  const arrayEnd = trimmed.lastIndexOf(']')
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(trimmed.slice(arrayStart, arrayEnd + 1))

  const objectStart = trimmed.indexOf('{')
  const objectEnd = trimmed.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(trimmed.slice(objectStart, objectEnd + 1))

  for (const candidate of Array.from(new Set(candidates))) {
    const parsed = parseCandidate(candidate)
    if (parsed !== null) return parsed
  }
  return null
}

export function parseAuditFindingsResponse(raw: string | null, file: string): ParsedAuditFinding[] {
  if (raw === null || !raw.trim()) throw new Error(`COS returned no Audit analysis for ${file}.`)

  const decoded = structuredPayload(raw)
  if (decoded === null) throw new Error(`COS returned invalid Audit JSON for ${file}.`)
  const parsed = Array.isArray(decoded)
    ? decoded
    : decoded && typeof decoded === 'object' && Array.isArray((decoded as Record<string, unknown>).findings)
      ? (decoded as { findings: unknown[] }).findings
      : null
  if (!parsed) throw new Error(`COS Audit response was not an array for ${file}.`)

  return parsed.map((item, index) => {
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
