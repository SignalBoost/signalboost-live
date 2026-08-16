// saas/lib/ai/cos/cognitiveCouncil.ts
import { createHash } from 'node:crypto'
import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { runCouncilMembersConcurrently } from '@/lib/ai/cos/councilConcurrency'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'
import {
  COUNCIL_MACHINE_FACT_PATHS,
  COUNCIL_MACHINE_OPERATORS,
  normalizeCouncilMachinePrediction,
  type CouncilMachinePrediction,
} from '@/lib/ai/cos/councilMachinePrediction'

export type CouncilRole = 'architect' | 'sre' | 'database' | 'security' | 'business' | 'skeptic'
export type CouncilMetacognitiveRegion = 'strong' | 'developing' | 'weak' | 'untested' | 'conflicted' | 'unknown'

export type CouncilTriggerEvidence = {
  region: CouncilMetacognitiveRegion
  repeatedGapCount: number
  evidenceSparse: boolean
  highConsequence: boolean
  complexProblem: boolean
}

export type CouncilTriggerAssessment = CouncilTriggerEvidence & {
  trigger: boolean
  reasons: string[]
}

export type CouncilClaim = {
  claim: string
  evidence: string[]
  assumptions: string[]
  observable: string
  falsifier: string
  machinePrediction?: CouncilMachinePrediction
}

export type CouncilOpinion = {
  role: CouncilRole
  conclusion: string
  claims: CouncilClaim[]
  confidence: number
  verificationRequests: string[]
  credibilityWeight: number
}

export type CouncilAdvisory = {
  sessionId: string | null
  problemClass: string
  trigger: CouncilTriggerAssessment
  roles: CouncilRole[]
  opinions: CouncilOpinion[]
  advisory: string
}

type RoleDefinition = {
  role: CouncilRole
  label: string
  focus: string
  keywords: string[]
}

const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: 'architect',
    label: 'Systems Architect',
    focus: 'architecture, system boundaries, distributed failure modes, scaling, tenancy, interfaces and design tradeoffs',
    keywords: ['architecture', 'architect', 'system', 'distributed', 'multi-tenant', 'multitenant', 'scal', 'integration', 'design', 'software', 'service', 'queue', 'worker'],
  },
  {
    role: 'sre',
    label: 'Site Reliability Engineer',
    focus: 'production behavior, latency, availability, queues, saturation, deployment, observability, incident isolation and rollback-safe verification',
    keywords: ['incident', 'latency', 'outage', '5xx', 'deploy', 'vercel', 'cloud', 'monitor', 'reliab', 'production', 'timeout', 'traffic', 'availability'],
  },
  {
    role: 'database',
    label: 'Database Specialist',
    focus: 'PostgreSQL/data systems, query plans, locks, waits, connection pools, cardinality, indexes, replicas, storage and tenant skew',
    keywords: ['database', 'postgres', 'sql', 'query', 'pool', 'lock', 'replica', 'supabase', 'index', 'cardinality', 'transaction', 'storage'],
  },
  {
    role: 'security',
    label: 'Security Engineer',
    focus: 'authorization, secrets, identity, attack paths, least privilege, data exposure, policy boundaries and safe verification',
    keywords: ['security', 'auth', 'credential', 'permission', 'vulnerab', 'encrypt', 'threat', 'secret', 'token', 'identity', 'attack', 'breach'],
  },
  {
    role: 'business',
    label: 'Business and Revenue Specialist',
    focus: 'buyer impact, marketing, sales, pricing, revenue, customer segmentation, operating constraints and measurable commercial outcomes',
    keywords: ['sales', 'marketing', 'revenue', 'campaign', 'prospect', 'crm', 'pricing', 'buyer', 'customer', 'market', 'conversion', 'pipeline', 'business'],
  },
  {
    role: 'skeptic',
    label: 'Skeptic / Red-Team Reviewer',
    focus: 'challenge unsupported assumptions, identify alternative explanations, demand falsifiers, and flag claims that outrun the supplied evidence',
    keywords: [],
  },
]

function clamp01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(1, numeric))
}

function safeText(value: unknown, max = 1200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function capabilityKey(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180)
  return normalized || 'general-reasoning'
}

function problemClassFromQuestion(question: string): string {
  return classifyProblemClass(question)
}

function extractQuestion(prompt: string): string {
  const marker = 'USER QUESTION:'
  const index = prompt.lastIndexOf(marker)
  if (index >= 0) return prompt.slice(index + marker.length).trim().slice(0, 4000)
  return prompt.trim().slice(-4000)
}

function allowedEvidenceLabels(prompt: string): Set<string> {
  const labels = new Set<string>()
  for (const match of prompt.matchAll(/\[(KG|CL|OEM|EM|SK)\d{1,2}\]/g)) labels.add(match[0])
  return labels
}

function factualEvidenceCount(prompt: string): number {
  return new Set([...prompt.matchAll(/\[(KG|CL|OEM)\d{1,2}\]/g)].map(match => match[0])).size
}

function looksComplex(question: string): boolean {
  return /\b(diagnos|investigat|root cause|architect|design|incident|latency|outage|database|postgres|security|strategy|campaign|sales|revenue|integration|deploy|failure|risk|compare|tradeoff|multi-tenant|multitenant|scal|performance|bottleneck)\w*/i.test(question)
}

function looksHighConsequence(question: string): boolean {
  return /\b(production|outage|security|breach|credential|secret|data loss|delete|destructive|payment|financial|legal|compliance|deploy|rollback|customer environment|privilege|permission|incident)\b/i.test(question)
}

/**
 * Council is a cost/latency tradeoff, so it stays off the routine path. It activates for evidence of
 * uncertainty or consequence, not because a response needs a cosmetic confidence increase.
 */
export function assessCouncilTrigger(evidence: CouncilTriggerEvidence): CouncilTriggerAssessment {
  const reasons: string[] = []
  if (evidence.region === 'conflicted') reasons.push('metacognitive capability is conflicted')
  if (evidence.region === 'weak' && evidence.complexProblem) reasons.push('complex problem falls in a weak capability region')
  if (evidence.region === 'untested' && evidence.complexProblem) reasons.push('complex problem falls in an untested capability region')
  if (evidence.region === 'developing' && evidence.repeatedGapCount >= 1) reasons.push('developing capability has an unresolved recurring gap')
  if (evidence.repeatedGapCount >= 2) reasons.push('same problem class has repeated unresolved failures')
  if (evidence.evidenceSparse && evidence.complexProblem) reasons.push('complex problem has sparse factual evidence')
  if (evidence.highConsequence) reasons.push('question is high-consequence enough to justify independent challenge')
  return { ...evidence, trigger: reasons.length > 0, reasons }
}

export function selectCouncilRoles(question: string): CouncilRole[] {
  const lower = question.toLowerCase()
  const ranked = ROLE_DEFINITIONS
    .filter(definition => definition.role !== 'skeptic')
    .map(definition => ({
      role: definition.role,
      score: definition.keywords.reduce((score, keyword) => score + (lower.includes(keyword) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score || left.role.localeCompare(right.role))

  const selected = ranked.filter(item => item.score > 0).slice(0, 2).map(item => item.role)
  for (const fallback of ['architect', 'sre'] as CouncilRole[]) {
    if (selected.length >= 2) break
    if (!selected.includes(fallback)) selected.push(fallback)
  }
  return [...selected.slice(0, 2), 'skeptic']
}

/** Neutral prior until at least five externally verified cases exist for that role/problem class. */
export function councilCredibilityWeight(verifiedCases: number, correctCases: number): number {
  const verified = Math.max(0, Math.floor(Number(verifiedCases) || 0))
  const correct = Math.max(0, Math.min(verified, Math.floor(Number(correctCases) || 0)))
  if (verified < 5) return 1
  const posterior = (correct + 2) / (verified + 4)
  return Math.max(0.75, Math.min(1.25, 0.75 + posterior * 0.5))
}

async function readTriggerState(question: string): Promise<CouncilTriggerAssessment> {
  const problemClass = problemClassFromQuestion(question)
  const key = capabilityKey(problemClass)
  const db = cosServiceDb()
  let region: CouncilMetacognitiveRegion = 'unknown'
  let repeatedGapCount = 0

  if (db) {
    try {
      const capability = await db.from('cos_metacognitive_capabilities')
        .select('region')
        .eq('capability_key', key)
        .maybeSingle()
      const value = String(capability.data?.region || '')
      if (['strong', 'developing', 'weak', 'untested', 'conflicted'].includes(value)) region = value as CouncilMetacognitiveRegion
    } catch {}

    try {
      const gap = await db.from('cos_learning_gaps')
        .select('repeated_count')
        .eq('subject', problemClass)
        .in('status', ['pending', 'learning', 'failed'])
        .order('repeated_count', { ascending: false })
        .limit(1)
      repeatedGapCount = Number(gap.data?.[0]?.repeated_count || 0)
    } catch {}
  }

  return assessCouncilTrigger({
    region,
    repeatedGapCount,
    evidenceSparse: false,
    highConsequence: looksHighConsequence(question),
    complexProblem: looksComplex(question),
  })
}

async function credibilityFor(role: CouncilRole, problemClass: string): Promise<number> {
  const db = cosServiceDb()
  if (!db) return 1
  try {
    const result = await db.from('cos_council_member_credibility')
      .select('verified_cases,correct_cases')
      .eq('role', role)
      .eq('problem_class', problemClass)
      .maybeSingle()
    if (result.error || !result.data) return 1
    return councilCredibilityWeight(Number(result.data.verified_cases || 0), Number(result.data.correct_cases || 0))
  } catch {
    return 1
  }
}

function parseOpinion(raw: string, role: CouncilRole, allowedLabels: Set<string>, credibilityWeight: number): CouncilOpinion | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as any
    const claims: CouncilClaim[] = Array.isArray(parsed.claims)
      ? parsed.claims.slice(0, 5).map((claim: any) => {
          const machinePrediction = normalizeCouncilMachinePrediction(claim?.machine_prediction ?? claim?.machinePrediction)
          return {
            claim: safeText(claim?.claim, 900),
            evidence: Array.isArray(claim?.evidence)
              ? claim.evidence.map((item: unknown) => safeText(item, 40)).filter((item: string) => allowedLabels.has(item)).slice(0, 8)
              : [],
            assumptions: Array.isArray(claim?.assumptions) ? claim.assumptions.map((item: unknown) => safeText(item, 300)).filter(Boolean).slice(0, 5) : [],
            observable: safeText(claim?.observable, 700),
            falsifier: safeText(claim?.falsifier, 700),
            ...(machinePrediction ? { machinePrediction } : {}),
          }
        }).filter((claim: CouncilClaim) => claim.claim)
      : []
    const conclusion = safeText(parsed.conclusion, 1200)
    if (!conclusion || !claims.length) return null
    return {
      role,
      conclusion,
      claims,
      confidence: clamp01(parsed.confidence),
      verificationRequests: Array.isArray(parsed.verification_requests)
        ? parsed.verification_requests.map((item: unknown) => safeText(item, 500)).filter(Boolean).slice(0, 6)
        : [],
      credibilityWeight,
    }
  } catch {
    return null
  }
}

function memberPrompt(definition: RoleDefinition, question: string, governedPrompt: string, allowedLabels: Set<string>): string {
  return [
    `You are the ${definition.label} member of SignalBoost COS Council.`,
    `Your domain focus is: ${definition.focus}.`,
    '',
    'You are producing an INDEPENDENT FIRST OPINION. You have not seen any other Council member output.',
    'Do not provide hidden chain-of-thought. Return only concise review artifacts: conclusion, explicit claims, evidence labels, assumptions, observables and falsifiers.',
    'Use only evidence labels that were actually supplied. Procedural [SK#] labels are guidance, not factual corroboration.',
    'Do not invent telemetry. If evidence is missing, state the assumption and request a verification observable.',
    'Your job is not to agree with a presumed majority. Your job is to make the strongest falsifiable domain-specific case you can.',
    '',
    'OPTIONAL MACHINE PREDICTION:',
    '- For a claim that a future deterministic/read-back result can DIRECTLY test, you may pre-register machine_prediction.',
    '- Omit machine_prediction when the available objective fact would only show that an operation recovered but would not discriminate the claim itself.',
    '- Never use Council agreement, model confidence, semantic similarity, or an inferred fact as a machine predicate.',
    `- Allowed fact_path values: ${COUNCIL_MACHINE_FACT_PATHS.join(', ')}.`,
    `- Allowed operators: ${COUNCIL_MACHINE_OPERATORS.join(', ')}. Numeric comparison operators require a numeric expected value.`,
    '- A matching predicate later counts only as predictive support, not as new factual evidence inside this answer.',
    '',
    `Allowed evidence labels: ${[...allowedLabels].join(', ') || 'none'}`,
    '',
    'Return ONLY strict JSON:',
    '{"conclusion":"...","claims":[{"claim":"...","evidence":["[KG1]"],"assumptions":["..."],"observable":"...","falsifier":"...","machine_prediction":{"fact_path":"verified","operator":"eq","expected":true}}],"confidence":0.0,"verification_requests":["..."]}',
    '',
    'GOVERNED COS CONTEXT AND QUESTION:',
    governedPrompt.slice(0, 30000),
    '',
    `QUESTION ONLY: ${question}`,
  ].join('\n')
}

function advisoryText(advisory: Omit<CouncilAdvisory, 'advisory'>): string {
  const opinions = advisory.opinions.map(opinion => {
    const claims = opinion.claims.map((claim, index) => [
      `  Claim ${index + 1}: ${claim.claim}`,
      `  Evidence: ${claim.evidence.join(', ') || 'none supplied'}`,
      `  Assumptions: ${claim.assumptions.join('; ') || 'none stated'}`,
      `  Observable: ${claim.observable || 'not supplied'}`,
      `  Falsifier: ${claim.falsifier || 'not supplied'}`,
      claim.machinePrediction
        ? `  Pre-registered machine prediction: ${claim.machinePrediction.factPath} ${claim.machinePrediction.operator} ${JSON.stringify(claim.machinePrediction.expected)}`
        : '  Pre-registered machine prediction: none',
    ].join('\n')).join('\n')
    return [
      `${opinion.role.toUpperCase()} [verified-history weight ${opinion.credibilityWeight.toFixed(2)}; member confidence ${opinion.confidence.toFixed(2)}]`,
      `Conclusion: ${opinion.conclusion}`,
      claims,
      `Verification requests: ${opinion.verificationRequests.join('; ') || 'none'}`,
    ].join('\n')
  }).join('\n\n')

  return [
    'COGNITIVE COUNCIL ADVISORY — INTERNAL DELIBERATION, NOT NEW FACTUAL EVIDENCE',
    `Trigger reasons: ${advisory.trigger.reasons.join('; ')}`,
    `Problem class: ${advisory.problemClass}`,
    '',
    opinions,
    '',
    'JUDGE RULES FOR THE PRIMARY COS ANSWER:',
    '- Synthesize; do not vote. A majority is not evidence.',
    '- Weight domain specialists by verified-history weight only where it differs from the neutral 1.00 prior.',
    '- Council confidence values are opinions, not answer confidence and not factual evidence.',
    '- Deterministic/tool evidence already present in the governed context outranks every Council opinion.',
    '- Resolve disagreements using evidence, observables and falsifiers. If unresolved, preserve the uncertainty in the answer and confidence.',
    '- Pre-registered machine predictions are future falsifiability contracts, not evidence for the current answer.',
    '- Never cite the Council as a source. Cite only legitimate supplied KG/CL/OEM evidence labels when they truly support a factual claim.',
  ].join('\n')
}

async function createSession(input: {
  question: string
  problemClass: string
  trigger: CouncilTriggerAssessment
  roles: CouncilRole[]
}): Promise<string | null> {
  const db = cosServiceDb()
  if (!db) return null
  try {
    const result = await db.from('cos_council_sessions').insert({
      prompt_hash: createHash('sha256').update(input.question).digest('hex'),
      problem_class: input.problemClass,
      trigger_reasons: input.trigger.reasons,
      metacognitive_region: input.trigger.region,
      repeated_gap_count: input.trigger.repeatedGapCount,
      high_consequence: input.trigger.highConsequence,
      evidence_sparse: input.trigger.evidenceSparse,
      selected_roles: input.roles,
      status: 'started',
    }).select('id').maybeSingle()
    return result.error ? null : String(result.data?.id || '') || null
  } catch {
    return null
  }
}

async function persistOpinion(sessionId: string | null, opinion: CouncilOpinion, reasonerLabel: string): Promise<void> {
  if (!sessionId) return
  const db = cosServiceDb()
  if (!db) return
  try {
    await db.from('cos_council_opinions').insert({
      session_id: sessionId,
      role: opinion.role,
      conclusion: opinion.conclusion,
      claims: opinion.claims,
      confidence: opinion.confidence,
      credibility_weight: opinion.credibilityWeight,
      reasoner_label: reasonerLabel,
    })
  } catch {}
}

async function completeSession(sessionId: string | null, success: boolean): Promise<void> {
  if (!sessionId) return
  const db = cosServiceDb()
  if (!db) return
  try {
    await db.from('cos_council_sessions').update({
      status: success ? 'deliberated' : 'failed',
      completed_at: new Date().toISOString(),
    }).eq('id', sessionId)
  } catch {}
}

/**
 * Build a bounded Council advisory before the primary COS answer. Members run independently from the
 * same governed evidence. Their output is advisory only; the normal COS reasoner remains the judge,
 * and the existing grounding/specificity/confidence gates remain authoritative downstream.
 */
export async function maybeBuildCognitiveCouncilAdvisory(input: {
  prompt: string
  reasonerLabel: string
}): Promise<CouncilAdvisory | null> {
  if (process.env.COS_COUNCIL_ENABLED === 'false') return null

  const question = extractQuestion(input.prompt)
  if (!question) return null
  const allowedLabels = allowedEvidenceLabels(input.prompt)
  const baseTrigger = await readTriggerState(question)
  const trigger = assessCouncilTrigger({
    ...baseTrigger,
    evidenceSparse: factualEvidenceCount(input.prompt) === 0,
  })
  if (!trigger.trigger) return null

  const problemClass = problemClassFromQuestion(question)
  const roles = selectCouncilRoles(question)
  const sessionId = await createSession({ question, problemClass, trigger, roles })
  const inference = localInferenceConfigFromEnv()
  await touchRunpodActivityLease('cognitive_council')

  const opinions = await runCouncilMembersConcurrently<CouncilOpinion>(roles.map(role => async () => {
    const definition = ROLE_DEFINITIONS.find(item => item.role === role)!
    const credibilityWeight = await credibilityFor(role, problemClass)
    const raw = await callLocalModel({
      temperature: 0,
      maxTokens: Number(process.env.COS_COUNCIL_MEMBER_MAX_TOKENS || '1800'),
      systemPrompt: 'You are a bounded specialist inside SignalBoost COS Council. Return only the requested structured review artifact.',
      prompt: memberPrompt(definition, question, input.prompt, allowedLabels),
    }, inference).catch(() => null)
    if (!raw) return null
    const opinion = parseOpinion(raw, role, allowedLabels, credibilityWeight)
    if (!opinion) return null
    await persistOpinion(sessionId, opinion, input.reasonerLabel)
    return opinion
  }))

  const success = opinions.length >= 2
  await completeSession(sessionId, success)
  if (!success) return null

  const partial: Omit<CouncilAdvisory, 'advisory'> = { sessionId, problemClass, trigger, roles, opinions }
  return { ...partial, advisory: advisoryText(partial) }
}
