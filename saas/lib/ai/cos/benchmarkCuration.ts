import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export type CapabilityFailureKind =
  | 'low_confidence'
  | 'user_correction'
  | 'clarification'
  | 'timeout_retry'
  | 'tool_error'
  | 'schema_error'
  | 'unhandled_error'

export type CapabilityFailureInput = {
  prompt: string
  track?: string
  failureKind: CapabilityFailureKind
  requiredTerms?: string[]
  forbiddenTerms?: string[]
  requiresLocalReasoning?: boolean
  sourceMetadata?: Record<string, unknown>
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_RE = /(?<!\d)(?:\+?\d[\d .()\-]{7,}\d)(?!\d)/g
const TOKEN_RE = /\b(?:bearer\s+)?(?:sk-[A-Za-z0-9_-]{12,}|[A-Za-z0-9_-]{32,})\b/gi
const URL_SECRET_RE = /([?&](?:token|key|secret|signature|sig|auth)=)[^&\s]+/gi

function compactTerms(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map(value => String(value).trim().toLowerCase()).filter(Boolean))].slice(0, 20)
}

export function sanitizeBenchmarkPrompt(raw: string): string {
  return String(raw ?? '')
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, '[phone]')
    .replace(TOKEN_RE, '[secret]')
    .replace(URL_SECRET_RE, '$1[secret]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2400)
}

export function benchmarkCandidateFingerprint(track: string, prompt: string): string {
  return createHash('sha256')
    .update(`${track.trim().toLowerCase()}\n${prompt.trim().toLowerCase()}`)
    .digest('hex')
}

export async function recordCapabilityFailure(input: CapabilityFailureInput) {
  const db = cosServiceDb()
  if (!db) return { ok: false as const, error: 'COS service database is not configured.' }

  const prompt = sanitizeBenchmarkPrompt(input.prompt)
  if (prompt.length < 12) return { ok: false as const, error: 'Candidate prompt is too short after sanitization.' }

  const track = String(input.track || 'general').trim().slice(0, 120) || 'general'
  const fingerprint = benchmarkCandidateFingerprint(track, prompt)
  const safeMetadata = {
    source: String(input.sourceMetadata?.source || 'runtime').slice(0, 80),
    route: String(input.sourceMetadata?.route || '').slice(0, 160),
    statusCode: Number(input.sourceMetadata?.statusCode) || undefined,
  }

  const result = await db.rpc('record_cos_benchmark_candidate', {
    p_fingerprint: fingerprint,
    p_track: track,
    p_sanitized_prompt: prompt,
    p_required_terms: compactTerms(input.requiredTerms),
    p_forbidden_terms: compactTerms(input.forbiddenTerms),
    p_requires_local_reasoning: input.requiresLocalReasoning !== false,
    p_failure_kind: input.failureKind,
    p_source_metadata: safeMetadata,
  })

  if (result.error) return { ok: false as const, error: result.error.message }
  return { ok: true as const, candidateId: String(result.data) }
}

export async function promoteBenchmarkCandidates(options: { minOccurrences?: number; limit?: number } = {}) {
  const db = cosServiceDb()
  if (!db) return { ok: false as const, error: 'COS service database is not configured.' }

  const minOccurrences = Math.max(2, Math.floor(options.minOccurrences || 2))
  const limit = Math.max(1, Math.min(20, Math.floor(options.limit || 10)))
  const candidates = await db
    .from('cos_capability_benchmark_candidates')
    .select('id,track,sanitized_prompt,required_terms,forbidden_terms,requires_local_reasoning,occurrence_count')
    .eq('status', 'pending')
    .gte('occurrence_count', minOccurrences)
    .order('occurrence_count', { ascending: false })
    .order('last_seen_at', { ascending: false })
    .limit(limit)

  if (candidates.error) return { ok: false as const, error: candidates.error.message }

  let promoted = 0
  for (const candidate of candidates.data ?? []) {
    const created = await db.from('cos_capability_benchmark_cases').insert({
      active: true,
      track: candidate.track,
      prompt: candidate.sanitized_prompt,
      required_terms: candidate.required_terms ?? [],
      forbidden_terms: candidate.forbidden_terms ?? [],
      requires_local_reasoning: candidate.requires_local_reasoning !== false,
      origin: 'runtime_failure',
      source_candidate_id: candidate.id,
      difficulty_score: Math.min(5, 1 + Math.log2(Math.max(1, Number(candidate.occurrence_count) || 1))),
      promoted_at: new Date().toISOString(),
    }).select('id').single()

    if (created.error || !created.data) continue
    await db.from('cos_capability_benchmark_candidates').update({
      status: 'promoted',
      promoted_case_id: created.data.id,
      promoted_at: new Date().toISOString(),
    }).eq('id', candidate.id)
    promoted += 1
  }

  return { ok: true as const, considered: candidates.data?.length ?? 0, promoted }
}

export async function capabilityBenchmarkGate(options: { threshold?: number; minimumAttempts?: number; maxRuns?: number } = {}) {
  const db = cosServiceDb()
  if (!db) return { ok: false as const, error: 'COS service database is not configured.' }

  const threshold = Math.min(1, Math.max(0.5, Number(options.threshold ?? 0.95)))
  const minimumAttempts = Math.max(10, Math.floor(options.minimumAttempts || 20))
  const maxRuns = Math.max(5, Math.min(100, Math.floor(options.maxRuns || 50)))
  const runs = await db.from('cos_capability_benchmark_runs')
    .select('attempted,passed,completed_at,status')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(maxRuns)

  if (runs.error) return { ok: false as const, error: runs.error.message }

  let attempted = 0
  let passed = 0
  for (const run of runs.data ?? []) {
    attempted += Number(run.attempted) || 0
    passed += Number(run.passed) || 0
    if (attempted >= minimumAttempts) break
  }

  const passRate = attempted ? passed / attempted : 0
  const eligible = attempted >= minimumAttempts
  return {
    ok: true as const,
    threshold,
    minimumAttempts,
    attempted,
    passed,
    passRate,
    eligible,
    gatePassed: eligible && passRate >= threshold,
  }
}
