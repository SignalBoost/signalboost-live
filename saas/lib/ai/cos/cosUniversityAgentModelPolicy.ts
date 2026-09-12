// saas/lib/ai/cos/cosUniversityAgentModelPolicy.ts
import { currentPlatformModelTopology } from './platformIdentityContext.ts'

/**
 * Which model a registered agent answers on, decided by the work rather than by the agent.
 *
 * Every specialist must pass the same generalist foundation before its own field, so a single model
 * per agent is the wrong unit: the Software Specialist was answering history, language and law
 * through a coding model, and its two most recent bound exams failed on `required_group_1_missing`
 * and `word_limit_exceeded` — coverage and instruction-following, not software.
 *
 * Hybrid: work inside the agent's registered domain runs on that domain's model; everything else —
 * the generalist foundation, languages, retention — runs on the platform reasoner. Non-credit
 * deliberate practice may use a cheaper managed open model, but independent exams never do.
 * The agent's identity, provenance and academic authority are unchanged; only the engine behind one
 * non-credit training answer moves.
 *
 * No paid managed model is selected from a source-code default. DeepInfra practice requires an
 * explicit operator-controlled UNIVERSITY_PRACTICE_MODEL value and fails closed when it is absent.
 */

export type AgentWorkDomain = 'role_domain' | 'generalist'
export type AgentWorkPurpose = 'assessment' | 'practice'

export const PRIMARY_REASONER_NOT_CONFIGURED = 'primary_reasoner_model_not_configured'
export const BUILDER_MODEL_NOT_CONFIGURED_FOR_ROLE = 'builder_model_not_configured'
export const UNIVERSITY_PRACTICE_MODEL_NOT_CONFIGURED = 'university_practice_model_not_configured'

/**
 * University subjects that belong to a registered role's own field. A role absent from this map has
 * no domain subjects yet, so all of its work is generalist work — the safe direction for a new
 * specialist, since it answers on the general reasoner until its domain is declared here.
 */
export const ROLE_DOMAIN_SUBJECTS: Readonly<Record<string, readonly string[]>> = {
  software_engineering: ['computer_science'],
  cybersecurity: ['cybersecurity'],
  quantitative_data_science: ['statistics_data_science', 'mathematics'],
  enterprise_operations_governance: ['business_operations', 'law_regulation_governance'],
  scientific_physical_systems: ['physics_natural_sciences'],
}

export function agentWorkDomain(role: string | null | undefined, subjectId?: string | null): AgentWorkDomain {
  const subject = String(subjectId ?? '').trim()
  if (!subject) return 'generalist'
  const domainSubjects = ROLE_DOMAIN_SUBJECTS[String(role ?? '').trim()]
  return domainSubjects?.includes(subject) ? 'role_domain' : 'generalist'
}

function isDeepInfraRuntime(): boolean {
  const explicit = process.env.LOCAL_AI_MANAGED_PROVIDER?.trim().toLowerCase()
  if (explicit === 'deepinfra') return true
  try {
    const host = new URL(process.env.LOCAL_AI_BASE_URL || '').hostname.toLowerCase()
    return host === 'api.deepinfra.com' || host.endsWith('.deepinfra.com')
  } catch {
    return false
  }
}

/**
 * Economy routing is training-only. Paid DeepInfra practice requires an explicit configured model;
 * self-hosted/non-DeepInfra runtimes may keep their existing primary model by returning null.
 */
export function universityPracticeModelFromEnv(): string | null {
  const explicit = String(process.env.UNIVERSITY_PRACTICE_MODEL ?? '').trim()
  if (explicit) return explicit
  if (isDeepInfraRuntime()) throw new Error(UNIVERSITY_PRACTICE_MODEL_NOT_CONFIGURED)
  return null
}

/**
 * Resolves the model for one piece of work. `roleModel` is supplied by the caller so this module
 * stays free of any particular role's configuration lookup.
 */
export function modelForAgentWork(input: {
  domain: AgentWorkDomain
  roleModel: string | null | undefined
  purpose?: AgentWorkPurpose
}): string {
  if (input.purpose === 'practice') {
    const practiceModel = universityPracticeModelFromEnv()
    if (practiceModel) return practiceModel
  }
  if (input.domain === 'role_domain') {
    const model = String(input.roleModel ?? '').trim()
    if (!model) throw new Error(BUILDER_MODEL_NOT_CONFIGURED_FOR_ROLE)
    return model
  }
  const reasoner = String(currentPlatformModelTopology().primaryReasonerModel ?? '').trim()
  if (!reasoner) throw new Error(PRIMARY_REASONER_NOT_CONFIGURED)
  return reasoner
}
