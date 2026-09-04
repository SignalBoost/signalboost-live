// saas/lib/audit/reportTranslation.ts
// Durable translation support for previously generated audit reports.
// Original audit_findings rows remain unchanged because remediation must always
// operate on the exact findings that were approved. Translated display copies
// are stored separately in audit_logs and can be reused when a user switches
// back to a language that was already generated.

import { callAuditModel } from '@/lib/audit/modelRouter'
import { AUDIT_UNTRUSTED_DATA_RULE, encodeAuditUntrustedData } from '@/lib/audit/untrustedData'
import {
  normalizeReportLang,
  reportLanguageName,
  type ReportLang,
} from '@/lib/i18n/reportLanguage'

export const AUDIT_REPORT_TRANSLATION_KIND = 'audit_report_translation' as const

export type AuditReportTranslationFinding = {
  id: string
  category: string
  title: string
  detail: string
  recommendation: string
}

export type AuditReportTranslationPayload = {
  kind: typeof AUDIT_REPORT_TRANSLATION_KIND
  runId: string
  sourceLang: ReportLang
  targetLang: ReportLang
  findings: AuditReportTranslationFinding[]
  narrative: string
  generatedAt: string
}

type SourceFinding = {
  id?: string | number | null
  category?: string | null
  title?: string | null
  detail?: string | null
  recommendation?: string | null
}

type TranslatableFinding = {
  slot: number
  category: string
  title: string
  detail: string
  recommendation: string
}

const CHUNK_SIZE = 12

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function extractJsonArray(raw: string | null): unknown[] | null {
  if (!raw) return null
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(raw.slice(start, end + 1))
    return Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function extractJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(raw.slice(start, end + 1))
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function findingPrompt(
  rows: TranslatableFinding[],
  sourceLang: ReportLang,
  targetLang: ReportLang,
): string {
  return [
    `Translate the audit-report fields from ${reportLanguageName(sourceLang)} into ${reportLanguageName(targetLang)}.`,
    AUDIT_UNTRUSTED_DATA_RULE,
    'Translate only category, title, detail, and recommendation.',
    'Keep code identifiers, file paths, URLs, package names, route names, environment-variable names, SQL identifiers, and quoted code unchanged.',
    'Preserve every slot value, item order, item count, technical meaning, severity, certainty, and remediation intent.',
    'Return ONLY a valid JSON array with this exact shape:',
    '[{"slot":0,"category":"...","title":"...","detail":"...","recommendation":"..."}]',
    '',
    encodeAuditUntrustedData('audit_findings_translation', rows),
  ].join('\n')
}

function narrativePrompt(text: string, sourceLang: ReportLang, targetLang: ReportLang): string {
  return [
    `Translate this audit-report narrative from ${reportLanguageName(sourceLang)} into ${reportLanguageName(targetLang)}.`,
    AUDIT_UNTRUSTED_DATA_RULE,
    'Preserve headings, paragraphs, lists, technical meaning, certainty, code identifiers, file paths, URLs, package names, route names, and environment-variable names.',
    'Return ONLY valid JSON in the exact shape {"text":"..."}.',
    '',
    encodeAuditUntrustedData('audit_narrative_translation', { text }),
  ].join('\n')
}

async function translateFindingChunk(
  rows: TranslatableFinding[],
  sourceLang: ReportLang,
  targetLang: ReportLang,
): Promise<TranslatableFinding[]> {
  const raw = await callAuditModel({
    systemPrompt: `You are a precise professional translator for software audit reports. ${AUDIT_UNTRUSTED_DATA_RULE} Return only the requested JSON.`,
    prompt: findingPrompt(rows, sourceLang, targetLang),
    maxTokens: 4096,
  })
  const parsed = extractJsonArray(raw)
  if (!parsed || parsed.length !== rows.length) {
    throw new Error('Audit report translation returned an invalid finding count.')
  }

  const bySlot = new Map<number, Record<string, unknown>>()
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const slot = Number(record.slot)
    if (Number.isInteger(slot)) bySlot.set(slot, record)
  }

  return rows.map((row) => {
    const translated = bySlot.get(row.slot)
    if (!translated) throw new Error(`Audit report translation omitted slot ${row.slot}.`)
    return {
      slot: row.slot,
      category: stringValue(translated.category) || row.category,
      title: stringValue(translated.title) || row.title,
      detail: stringValue(translated.detail) || row.detail,
      recommendation: stringValue(translated.recommendation) || row.recommendation,
    }
  })
}

async function translateNarrative(
  narrative: string,
  sourceLang: ReportLang,
  targetLang: ReportLang,
): Promise<string> {
  if (!narrative.trim()) return ''
  const raw = await callAuditModel({
    systemPrompt: `You are a precise professional translator for software audit reports. ${AUDIT_UNTRUSTED_DATA_RULE} Return only the requested JSON.`,
    prompt: narrativePrompt(narrative, sourceLang, targetLang),
    maxTokens: 8192,
  })
  const parsed = extractJsonObject(raw)
  const translated = stringValue(parsed?.text)
  if (!translated) throw new Error('Audit report narrative translation was empty.')
  return translated
}

export async function translateAuditReport(params: {
  runId: string
  sourceLang?: string | null
  targetLang?: string | null
  findings: SourceFinding[]
  narrative?: string | null
}): Promise<AuditReportTranslationPayload> {
  const sourceLang = normalizeReportLang(params.sourceLang)
  const targetLang = normalizeReportLang(params.targetLang)
  const sourceRows: TranslatableFinding[] = params.findings.map((finding, slot) => ({
    slot,
    category: stringValue(finding.category),
    title: stringValue(finding.title),
    detail: stringValue(finding.detail),
    recommendation: stringValue(finding.recommendation),
  }))

  if (sourceLang === targetLang) {
    return {
      kind: AUDIT_REPORT_TRANSLATION_KIND,
      runId: params.runId,
      sourceLang,
      targetLang,
      findings: sourceRows.map((row, index) => ({
        id: String(params.findings[index]?.id ?? index),
        category: row.category,
        title: row.title,
        detail: row.detail,
        recommendation: row.recommendation,
      })),
      narrative: String(params.narrative || ''),
      generatedAt: new Date().toISOString(),
    }
  }

  const translatedRows: TranslatableFinding[] = []
  for (let start = 0; start < sourceRows.length; start += CHUNK_SIZE) {
    const chunk = sourceRows.slice(start, start + CHUNK_SIZE)
    translatedRows.push(...await translateFindingChunk(chunk, sourceLang, targetLang))
  }

  const narrative = await translateNarrative(String(params.narrative || ''), sourceLang, targetLang)

  return {
    kind: AUDIT_REPORT_TRANSLATION_KIND,
    runId: params.runId,
    sourceLang,
    targetLang,
    findings: translatedRows.map((row, index) => ({
      id: String(params.findings[index]?.id ?? index),
      category: row.category,
      title: row.title,
      detail: row.detail,
      recommendation: row.recommendation,
    })),
    narrative,
    generatedAt: new Date().toISOString(),
  }
}
