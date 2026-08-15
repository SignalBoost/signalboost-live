import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import type { AuthoritativeEvidenceSource } from '@/lib/ai/cos/cosAuthoritativeResearch'

export type EvidenceSynthesisStatus = 'answered' | 'insufficient' | 'conflict' | 'failed'

export type EvidenceSynthesisResult = {
  status: EvidenceSynthesisStatus
  answer: string | null
  sourceIds: string[]
  model: string
  attempted: boolean
  error: string | null
}

type ParsedSynthesis = {
  status?: string
  answer?: string
  sourceIds?: unknown
}

function evidenceBlock(sources: AuthoritativeEvidenceSource[]): string {
  return sources.map(source => [
    `[${source.id}] ${source.title}`,
    `URL: ${source.url}`,
    `AUTHORITY: ${source.authorityTier} (${source.authorityScore})`,
    `EVIDENCE: ${source.snippet}`,
  ].join('\n')).join('\n\n')
}

function parseJsonObject(text: string): ParsedSynthesis | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(unfenced) as ParsedSynthesis } catch {}
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(unfenced.slice(start, end + 1)) as ParsedSynthesis } catch { return null }
}

function validSourceIds(raw: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const value of raw) {
    const id = String(value || '').trim()
    if (!allowed.has(id) || out.includes(id)) continue
    out.push(id)
  }
  return out
}

/**
 * One bounded local model call whose only job is to synthesize retrieved evidence.
 * The model is explicitly prohibited from contributing facts from pretrained memory.
 */
export async function synthesizeAuthoritativeEvidence(input: {
  question: string
  sources: AuthoritativeEvidenceSource[]
  minimumCitations: number
}): Promise<EvidenceSynthesisResult> {
  const config = localInferenceConfigFromEnv()
  const model = config.model
  const allowed = new Set(input.sources.map(source => source.id))
  const minimum = Math.max(1, Math.min(input.minimumCitations || 1, input.sources.length))
  const systemPrompt = [
    'You are the COS evidence synthesizer. You are NOT a factual authority.',
    'Use ONLY the supplied evidence records. Do not use pretrained knowledge, memory, assumptions, or unstated facts.',
    'If the evidence conflicts on the requested fact, return status="conflict" and do not choose a side.',
    'If the evidence is insufficient to answer, return status="insufficient" and do not guess.',
    `If you can answer, cite at least ${minimum} supplied source id(s).`,
    'Return JSON only with exactly these keys: status, answer, sourceIds.',
    'status must be one of: answered, insufficient, conflict.',
  ].join(' ')

  const prompt = [
    `QUESTION: ${String(input.question || '').trim()}`,
    '',
    'AUTHORITATIVE EVIDENCE:',
    evidenceBlock(input.sources),
  ].join('\n')

  const raw = await callLocalModel({ prompt, systemPrompt, maxTokens: 700, temperature: 0 }, config)
  if (!raw) return { status: 'failed', answer: null, sourceIds: [], model, attempted: true, error: 'Local evidence synthesizer returned no response.' }

  const parsed = parseJsonObject(raw)
  if (!parsed) return { status: 'failed', answer: null, sourceIds: [], model, attempted: true, error: 'Local evidence synthesizer returned invalid JSON.' }

  const status = String(parsed.status || '').toLowerCase()
  if (status === 'conflict') return { status: 'conflict', answer: null, sourceIds: validSourceIds(parsed.sourceIds, allowed), model, attempted: true, error: null }
  if (status === 'insufficient') return { status: 'insufficient', answer: null, sourceIds: validSourceIds(parsed.sourceIds, allowed), model, attempted: true, error: null }
  if (status !== 'answered') return { status: 'failed', answer: null, sourceIds: [], model, attempted: true, error: `Unexpected synthesis status: ${status || 'missing'}.` }

  const answer = String(parsed.answer || '').trim()
  const sourceIds = validSourceIds(parsed.sourceIds, allowed)
  if (!answer) return { status: 'failed', answer: null, sourceIds, model, attempted: true, error: 'Evidence synthesis produced an empty answer.' }
  if (sourceIds.length < minimum) {
    return { status: 'failed', answer: null, sourceIds, model, attempted: true, error: `Evidence synthesis cited ${sourceIds.length} source(s); ${minimum} required.` }
  }

  return { status: 'answered', answer, sourceIds, model, attempted: true, error: null }
}

export function renderEvidenceGroundedReply(
  answer: string,
  sourceIds: string[],
  sources: AuthoritativeEvidenceSource[],
  retrievedAt: string,
): string {
  const byId = new Map(sources.map(source => [source.id, source]))
  const cited = sourceIds.map(id => byId.get(id)).filter((source): source is AuthoritativeEvidenceSource => Boolean(source))
  const lines = cited.map(source => `- [${source.id}] ${source.title} — ${source.url}`)
  return `${String(answer || '').trim()}\n\nSources (retrieved ${retrievedAt}):\n${lines.join('\n')}`
}
