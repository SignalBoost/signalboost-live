import { A2A_SPECIALIST_FAMILIES, type A2ASpecialistFamilyId } from './a2a-specialist-catalog.ts'

export const COS_SPECIALIST_PLANNER_VERSION = 'signalboost-cos-specialist-planner-v1' as const

export type COSSpecialistPlannerDecision =
  | Readonly<{ mode: 'generalist'; reason: string; confidence: number; plannerVersion: typeof COS_SPECIALIST_PLANNER_VERSION }>
  | Readonly<{ mode: 'delegate'; familyId: A2ASpecialistFamilyId; skillId: string; confidence: number; reason: string; plannerVersion: typeof COS_SPECIALIST_PLANNER_VERSION }>

type Rule = Readonly<{
  familyId: A2ASpecialistFamilyId
  skillId: string
  domain: RegExp
  action: RegExp
  confidence: number
  reason: string
}>

const RULES: readonly Rule[] = Object.freeze([
  Object.freeze({ familyId: 'marketing', skillId: 'marketing.campaign-mutate', domain: /\b(?:marketing|campaign|ads?|advertis(?:e|ing)|paid media|google ads|meta ads|linkedin ads)\b/i, action: /\b(?:create|launch|change|edit|update|pause|resume|stop|increase|decrease|set|adjust|spend|budget|bid)\b/i, confidence: .98, reason: 'clear paid-marketing mutation intent' }),
  Object.freeze({ familyId: 'marketing', skillId: 'marketing.publish', domain: /\b(?:marketing|social|post|content|linkedin|instagram|facebook|tiktok|youtube)\b/i, action: /\b(?:publish|post|send live|schedule|release)\b/i, confidence: .97, reason: 'clear organic publishing intent' }),
  Object.freeze({ familyId: 'marketing', skillId: 'marketing.plan', domain: /\b(?:marketing|campaign|content|audience|channel|brand)\b/i, action: /\b(?:plan|strategy|calendar|roadmap|brief|campaign plan|content plan)\b/i, confidence: .94, reason: 'clear marketing planning intent' }),
  Object.freeze({ familyId: 'marketing', skillId: 'marketing.research', domain: /\b(?:marketing|market|audience|competitor|channel|campaign|customer segment)\b/i, action: /\b(?:research|analy[sz]e|compare|investigate|study|find|evaluate|benchmark)\b/i, confidence: .93, reason: 'clear marketing research intent' }),

  Object.freeze({ familyId: 'sales', skillId: 'sales.send-outreach', domain: /\b(?:sales|prospect|lead|account|customer|outreach|follow[- ]?up)\b/i, action: /\b(?:send|email|message|contact|reach out|follow up)\b/i, confidence: .97, reason: 'clear sales outreach-send intent' }),
  Object.freeze({ familyId: 'sales', skillId: 'sales.crm-write', domain: /\b(?:crm|opportunity|pipeline|contact record|account record|lead record)\b/i, action: /\b(?:create|update|edit|log|write|add|change)\b/i, confidence: .96, reason: 'clear CRM mutation intent' }),
  Object.freeze({ familyId: 'sales', skillId: 'sales.outreach-plan', domain: /\b(?:sales|prospect|lead|account|outreach|follow[- ]?up)\b/i, action: /\b(?:plan|sequence|cadence|draft strategy|outreach plan|follow[- ]?up plan)\b/i, confidence: .94, reason: 'clear sales outreach-planning intent' }),
  Object.freeze({ familyId: 'sales', skillId: 'sales.account-research', domain: /\b(?:sales|prospect|lead|account|company|opportunity)\b/i, action: /\b(?:research|analy[sz]e|qualify|investigate|find|evaluate|summarize)\b/i, confidence: .93, reason: 'clear sales account-research intent' }),

  Object.freeze({ familyId: 'self-healing-remediation', skillId: 'self-healing.rollback', domain: /\b(?:incident|system|service|deployment|infrastructure|production|self[- ]?healing)\b/i, action: /\b(?:rollback|roll back|revert)\b/i, confidence: .99, reason: 'clear governed rollback intent' }),
  Object.freeze({ familyId: 'self-healing-remediation', skillId: 'self-healing.apply-remediation', domain: /\b(?:incident|system|service|deployment|infrastructure|production|self[- ]?healing)\b/i, action: /\b(?:fix|repair|remediate|restart|redeploy|patch|apply remediation|execute remediation)\b/i, confidence: .98, reason: 'clear governed remediation intent' }),
  Object.freeze({ familyId: 'self-healing-verification', skillId: 'self-healing.certify-outcome', domain: /\b(?:incident|system|service|deployment|remediation|self[- ]?healing)\b/i, action: /\b(?:certify|acceptance criteria|prove recovery|confirm outcome)\b/i, confidence: .96, reason: 'clear remediation outcome-certification intent' }),
  Object.freeze({ familyId: 'self-healing-verification', skillId: 'self-healing.verify', domain: /\b(?:incident|system|service|deployment|remediation|self[- ]?healing)\b/i, action: /\b(?:verify|validate|health check|check recovery|confirm healthy)\b/i, confidence: .95, reason: 'clear post-change verification intent' }),
  Object.freeze({ familyId: 'self-healing-diagnostic', skillId: 'self-healing.plan-remediation', domain: /\b(?:incident|system|service|deployment|infrastructure|production|self[- ]?healing)\b/i, action: /\b(?:remediation plan|recovery plan|rollback plan|plan remediation|how should we fix|how to fix)\b/i, confidence: .95, reason: 'clear remediation-planning intent' }),
  Object.freeze({ familyId: 'self-healing-diagnostic', skillId: 'self-healing.diagnose', domain: /\b(?:incident|outage|system|service|deployment|infrastructure|production|error|failure|self[- ]?healing)\b/i, action: /\b(?:diagnose|root cause|why|investigate|triage|what failed|what broke|analy[sz]e)\b/i, confidence: .94, reason: 'clear incident-diagnostic intent' }),
])

const EXPLICIT_GENERALIST = /\b(?:what is|who is|when is|define|explain|translate|rewrite|summarize this|calculate|weather|time in|history of)\b/i

function canonical(familyId: A2ASpecialistFamilyId, skillId: string): boolean {
  return Boolean(A2A_SPECIALIST_FAMILIES.find(family => family.familyId === familyId)?.skills.some(skill => skill.skillId === skillId))
}

export function planCOSSpecialistFromText(input: string): COSSpecialistPlannerDecision {
  const text = String(input ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return Object.freeze({ mode: 'generalist', reason: 'empty input', confidence: 1, plannerVersion: COS_SPECIALIST_PLANNER_VERSION })
  if (EXPLICIT_GENERALIST.test(text)) return Object.freeze({ mode: 'generalist', reason: 'ordinary generalist question', confidence: .99, plannerVersion: COS_SPECIALIST_PLANNER_VERSION })

  const matches = RULES.filter(rule => rule.domain.test(text) && rule.action.test(text) && canonical(rule.familyId, rule.skillId))
  if (matches.length !== 1) {
    return Object.freeze({
      mode: 'generalist',
      reason: matches.length === 0 ? 'no clear specialist match' : 'ambiguous specialist match',
      confidence: matches.length === 0 ? .9 : .99,
      plannerVersion: COS_SPECIALIST_PLANNER_VERSION,
    })
  }
  const match = matches[0]!
  return Object.freeze({
    mode: 'delegate',
    familyId: match.familyId,
    skillId: match.skillId,
    confidence: match.confidence,
    reason: match.reason,
    plannerVersion: COS_SPECIALIST_PLANNER_VERSION,
  })
}
