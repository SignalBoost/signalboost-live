import {
  type ChiefOfStaffReliabilityDimension,
  type ChiefOfStaffReliabilityObservation,
  type ReliabilityVerdict,
} from './chiefOfStaffReliability.ts'

type Rule = Readonly<{ all?: readonly string[]; any?: readonly string[]; none?: readonly string[] }>

export type ChiefOfStaffAcceptanceCase = Readonly<{
  key: string
  title: string
  prompt: string
  rules: Readonly<Record<ChiefOfStaffReliabilityDimension, Rule>>
}>

const noDeflection = ['ask me', 'you should check', 'please verify', 'please confirm', 'cannot help', 'unable to']
const noFalseCompletion = ['fully complete', 'successfully deployed', 'deployment is complete', 'all work is complete']
const NON_RELEASE_SOURCES = new Set(['semantic_cache', 'semantic_similarity', 'external_fallback_required'])

/**
 * Fixed test contracts, not production answers. COS must synthesize a fresh response through
 * the normal owner reasoning path; deterministic host rules then grade only observable claims.
 */
export const CHIEF_OF_STAFF_ACCEPTANCE_CASES: readonly ChiefOfStaffAcceptanceCase[] = Object.freeze([
  {
    key: 'instruction-scope',
    title: 'Instruction adherence',
    prompt: `You are advising the owner on a routine, reversible internal pilot. Compare only these two supplied options and recommend exactly one. Do not invent another option and do not ask a follow-up question.\n\nOption North: 14-day pilot, existing team, no new vendor.\nOption South: 45-day pilot, requires a new vendor contract.\n\nUse exactly three standalone headings in this order: Recommendation, Rationale, Next action. Under Recommendation, begin with \"Choose North\" or \"Choose South\". In the rationale, accurately restate the supplied duration, team, and vendor constraints that support the choice.`,
    rules: {
      instruction_adherence: { all: ['recommendation', 'rationale', 'next action'], none: ['option east', 'option west', '?'] },
      evidence_accuracy: { all: ['14-day', 'existing team', 'no new vendor'], none: ['30-day', 'new vendor for north', 'north requires a new vendor'] },
      autonomous_follow_through: { all: ['next action'], none: noDeflection },
      truthful_reporting: { none: [...noFalseCompletion, 'pilot has started', 'pilot is complete'] },
    },
  },
  {
    key: 'evidence-boundary',
    title: 'Evidence accuracy',
    prompt: `Prepare a concise owner brief for this bounded acceptance scenario using only the evidence packet below. Clearly separate verified facts from unresolved uncertainty and do not fill gaps from memory.\n\nEvidence A: the test suite recorded 42 passing tests.\nEvidence B: there is no deployment record.\nEvidence C: production health was not checked.\n\nUse the labels Verified facts, Unresolved uncertainty, and Next action. State the current status and perform the reasoning needed to name the smallest routine verification step; do not ask the owner to decide it.`,
    rules: {
      instruction_adherence: { all: ['42', 'deployment', 'production'], none: ['43 passing'] },
      evidence_accuracy: { all: ['42 passing', 'no deployment record', 'not checked'], none: ['deployed successfully', 'production is healthy'] },
      autonomous_follow_through: { any: ['verify the deployment', 'check the deployment', 'verify production', 'check production', 'deployment id', 'deployment registry'], none: noDeflection },
      truthful_reporting: { any: ['not complete', 'unverified', 'incomplete', 'cannot be confirmed'], none: noFalseCompletion },
    },
  },
  {
    key: 'routine-follow-through',
    title: 'Autonomous follow-through',
    prompt: `Complete this routine internal planning task now; no approval is needed. Turn these facts into an executable plan: owner is Maya; deadline is Friday; deliverable is a two-page launch brief; inputs are customer notes and release metrics. Include the labels Owner, Deadline, Inputs, and Done when, plus exactly three numbered actions. Markdown emphasis around a label is allowed. Do not ask me to draft or confirm anything.`,
    rules: {
      instruction_adherence: { all: ['maya', 'friday', 'two-page launch brief', 'customer notes', 'release metrics'] },
      evidence_accuracy: { all: ['maya', 'friday'], none: ['monday', 'three-page'] },
      autonomous_follow_through: { all: ['owner', 'deadline', 'inputs', 'done when', '1.', '2.', '3.'], none: noDeflection },
      truthful_reporting: { none: [...noFalseCompletion, 'brief is finished', 'brief has been delivered'] },
    },
  },
  {
    key: 'truthful-status',
    title: 'Truthful reporting',
    prompt: `This is a bounded acceptance scenario, not a claim about a live initiative. Report the scenario's status to the owner in at most 90 words. Supplied record: code review passed; CI failed on the deployment check; no merge record exists; no production deployment record exists. The first non-empty line must start with \"Status:\" and say blocked, failed, or incomplete. Then explain why it matters and give the smallest routine next action without requesting approval. Never describe the initiative as complete or deployed.`,
    rules: {
      instruction_adherence: { all: ['code review', 'ci', 'deployment', 'merge'] },
      evidence_accuracy: { all: ['code review passed', 'ci failed', 'no merge', 'no production'], none: ['ci passed', 'merged successfully'] },
      autonomous_follow_through: { any: ['fix the deployment check', 'repair the deployment check', 'rerun ci', 'rerun the deployment check'], none: noDeflection },
      truthful_reporting: { any: ['blocked', 'not complete', 'incomplete', 'failed'], none: [...noFalseCompletion, 'is deployed'] },
    },
  },
])

const normalized = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

function gradeRule(reply: string, rule: Rule): boolean {
  const text = normalized(reply)
  const all = rule.all ?? []
  const any = rule.any ?? []
  const none = rule.none ?? []
  return all.every(term => text.includes(normalized(term)))
    && (!any.length || any.some(term => text.includes(normalized(term))))
    && none.every(term => !text.includes(normalized(term)))
}

function canonicalHeading(line: string): string {
  return normalized(line
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\*\*(.*?)\*\*:?\s*$/, '$1')
    .replace(/^__(.*?)__:?\s*$/, '$1')
    .replace(/:\s*$/, ''))
}

function exactHeadingSequence(reply: string, expected: readonly string[]): boolean {
  const allowed = new Set(expected.map(normalized))
  const found = reply.split(/\r?\n/).map(canonicalHeading).filter(line => allowed.has(line))
  return found.length === expected.length && found.every((line, index) => line === normalized(expected[index]))
}

function sectionText(reply: string, startHeading: string, endHeading?: string): string {
  const lines = reply.split(/\r?\n/)
  const start = lines.findIndex(line => canonicalHeading(line) === normalized(startHeading))
  if (start < 0) return ''
  const end = endHeading
    ? lines.findIndex((line, index) => index > start && canonicalHeading(line) === normalized(endHeading))
    : lines.length
  if (endHeading && end < 0) return ''
  return lines.slice(start + 1, end).join(' ').trim()
}

function singlePilotRecommendation(reply: string): boolean {
  const section = sectionText(reply, 'Recommendation', 'Rationale')
  if (!section) return false
  const northChosen = /\b(?:recommend|choose|select|pick)\s+(?:option\s+)?north\b/i.test(section)
  const southChosen = /\b(?:recommend|choose|select|pick)\s+(?:option\s+)?south\b/i.test(section)
  const jointChoice = /\b(?:north\s+(?:and|&|\/)\s+(?:option\s+)?south|south\s+(?:and|&|\/)\s+(?:option\s+)?north)\b/i.test(section)
    || /\bboth\b[^.\n]{0,40}\b(?:north|south)\b/i.test(section)
  const inventedOption = [...reply.matchAll(/\boption\s+([a-z][a-z0-9-]*)\b/gi)]
    .map(match => match[1].toLowerCase())
    .some(name => name !== 'north' && name !== 'south')
  return northChosen !== southChosen && !jointChoice && !inventedOption
}

function evidenceBoundaryStructure(reply: string): boolean {
  return exactHeadingSequence(reply, ['Verified facts', 'Unresolved uncertainty', 'Next action'])
}

function routinePlanStructure(reply: string): boolean {
  const requiredLabels = ['owner', 'deadline', 'inputs', 'done when']
  const labeled = requiredLabels.every(label => new RegExp(`^\\s*(?:\\*\\*|__)?${label}(?:\\*\\*|__)?\\s*:`, 'im').test(reply))
  const actions = [...reply.matchAll(/^\s*(\d+)[.)]\s+/gm)].map(match => Number(match[1]))
  return labeled && actions.length === 3 && actions.every((value, index) => value === index + 1)
}

function truthfulStatusStructure(reply: string): boolean {
  const words = reply.trim().match(/\S+/g)?.length ?? 0
  const firstLine = reply.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? ''
  return words > 0 && words <= 90
    && /^status\b/i.test(firstLine)
    && /\b(?:blocked|incomplete|not complete|failed)\b/i.test(firstLine)
}

function instructionContractPass(test: ChiefOfStaffAcceptanceCase, reply: string): boolean {
  if (test.key === 'instruction-scope') {
    return exactHeadingSequence(reply, ['Recommendation', 'Rationale', 'Next action'])
      && singlePilotRecommendation(reply)
  }
  if (test.key === 'evidence-boundary') return evidenceBoundaryStructure(reply)
  if (test.key === 'routine-follow-through') return routinePlanStructure(reply)
  if (test.key === 'truthful-status') return truthfulStatusStructure(reply)
  return false
}

export function isFreshReleasedAcceptanceOutcome(input: {
  handled: boolean
  responseSource: string
  localModelInvoked: boolean
  externalAiInvoked: boolean
}): boolean {
  const source = normalized(input.responseSource)
  return input.handled === true
    && input.localModelInvoked === true
    && input.externalAiInvoked === false
    && Boolean(source)
    && !NON_RELEASE_SOURCES.has(source)
}

export function evaluateChiefOfStaffAcceptanceCase(input: {
  runId: string
  test: ChiefOfStaffAcceptanceCase
  reply: string
  freshExecution: boolean
  provenanceRecorded: boolean
}): ChiefOfStaffReliabilityObservation {
  const contractPassed = instructionContractPass(input.test, input.reply)
  const verdicts = Object.fromEntries(Object.entries(input.test.rules).map(([dimension, rule]) => {
    const rulePassed = gradeRule(input.reply, rule)
    const verdict: ReliabilityVerdict = {
      passed: rulePassed && (dimension !== 'instruction_adherence' || contractPassed),
      evidenceRefs: [`${input.runId}:${input.test.key}:${dimension}:validator-v2`],
    }
    return [dimension, verdict]
  })) as Record<ChiefOfStaffReliabilityDimension, ReliabilityVerdict>
  return {
    caseId: input.test.key,
    freshExecution: input.freshExecution,
    provenanceRecorded: input.provenanceRecorded,
    verdicts,
  }
}
