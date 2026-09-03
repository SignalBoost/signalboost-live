import type { A2ADelegationRisk } from './a2a-agent-registry.ts'

export type A2ASpecialistFamilyId =
  | 'software'
  | 'marketing'
  | 'sales'
  | 'self-healing-diagnostic'
  | 'self-healing-remediation'
  | 'self-healing-verification'

export interface A2ASpecialistSkillTemplate {
  skillId: string
  risk: A2ADelegationRisk
  purpose: string
}

export interface A2ASpecialistFamily {
  familyId: A2ASpecialistFamilyId
  displayName: string
  purpose: string
  skills: readonly A2ASpecialistSkillTemplate[]
}

export const A2A_SPECIALIST_FAMILIES: readonly A2ASpecialistFamily[] = Object.freeze([
  Object.freeze({
    familyId: 'software',
    displayName: 'Software Specialist',
    purpose: 'Broadly proficient software-engineering specialist with deeper architecture, implementation, debugging, testing, security-aware development, repository repair, and verification expertise under COS governance.',
    skills: Object.freeze([
      Object.freeze({ skillId: 'software.analyze', risk: 'advisory', purpose: 'Analyze code, architecture, failures, and engineering trade-offs without mutation.' }),
      Object.freeze({ skillId: 'software.build', risk: 'write', purpose: 'Create or edit code inside an authorized isolated workspace and prove the requested result.' }),
      Object.freeze({ skillId: 'software.repair', risk: 'write', purpose: 'Reproduce, repair, and verify supplied or explicitly authorized software failures.' }),
      Object.freeze({ skillId: 'software.platform-repair', risk: 'write', purpose: 'Prepare owner-authorized pinned SignalBoost repository repairs in the network-denied staging environment; never merge or deploy.' }),
      Object.freeze({ skillId: 'software.verify', risk: 'advisory', purpose: 'Verify code, tests, build evidence, and repair claims independently of mutation authority.' }),
    ]),
  }),
  Object.freeze({
    familyId: 'marketing',
    displayName: 'Marketing Specialist',
    purpose: 'Research, campaign analysis, content planning, publishing preparation, and campaign operations under buyer governance.',
    skills: Object.freeze([
      Object.freeze({ skillId: 'marketing.research', risk: 'advisory', purpose: 'Research markets, audiences, channels, and campaign evidence.' }),
      Object.freeze({ skillId: 'marketing.plan', risk: 'advisory', purpose: 'Prepare campaign and content plans without publishing or spend.' }),
      Object.freeze({ skillId: 'marketing.publish', risk: 'write', purpose: 'Publish approved organic content through separately authorized tools.' }),
      Object.freeze({ skillId: 'marketing.campaign-mutate', risk: 'consequential', purpose: 'Create, change, pause, or otherwise mutate paid campaigns or spend.' }),
    ]),
  }),
  Object.freeze({
    familyId: 'sales',
    displayName: 'Sales Specialist',
    purpose: 'Account research, opportunity analysis, outreach preparation, and governed CRM/email operations.',
    skills: Object.freeze([
      Object.freeze({ skillId: 'sales.account-research', risk: 'advisory', purpose: 'Research and summarize accounts, contacts, opportunities, and evidence.' }),
      Object.freeze({ skillId: 'sales.outreach-plan', risk: 'advisory', purpose: 'Prepare outreach and follow-up plans without sending.' }),
      Object.freeze({ skillId: 'sales.crm-write', risk: 'write', purpose: 'Create or update approved CRM records through separately authorized tools.' }),
      Object.freeze({ skillId: 'sales.send-outreach', risk: 'write', purpose: 'Send approved outreach through separately authorized communications tools.' }),
    ]),
  }),
  Object.freeze({
    familyId: 'self-healing-diagnostic',
    displayName: 'Self-Healing Diagnostic Specialist',
    purpose: 'Diagnose faults, correlate evidence, and propose remediation without changing systems.',
    skills: Object.freeze([
      Object.freeze({ skillId: 'self-healing.diagnose', risk: 'advisory', purpose: 'Diagnose incidents and identify likely causes from governed evidence.' }),
      Object.freeze({ skillId: 'self-healing.plan-remediation', risk: 'advisory', purpose: 'Prepare bounded remediation and rollback plans without mutation.' }),
    ]),
  }),
  Object.freeze({
    familyId: 'self-healing-remediation',
    displayName: 'Self-Healing Remediation Specialist',
    purpose: 'Execute approved infrastructure or software remediations through separately governed execution capabilities.',
    skills: Object.freeze([
      Object.freeze({ skillId: 'self-healing.apply-remediation', risk: 'consequential', purpose: 'Apply an explicitly approved remediation with rollback and audit requirements.' }),
      Object.freeze({ skillId: 'self-healing.rollback', risk: 'consequential', purpose: 'Execute an explicitly approved rollback through governed execution.' }),
    ]),
  }),
  Object.freeze({
    familyId: 'self-healing-verification',
    displayName: 'Self-Healing Verification Specialist',
    purpose: 'Independently verify system state and remediation outcomes after changes.',
    skills: Object.freeze([
      Object.freeze({ skillId: 'self-healing.verify', risk: 'advisory', purpose: 'Verify post-change health and collect evidence without mutation.' }),
      Object.freeze({ skillId: 'self-healing.certify-outcome', risk: 'advisory', purpose: 'Assess whether observed evidence satisfies the defined success criteria.' }),
    ]),
  }),
])

export function getA2ASpecialistFamily(familyId: A2ASpecialistFamilyId): A2ASpecialistFamily {
  const family = A2A_SPECIALIST_FAMILIES.find(item => item.familyId === familyId)
  if (!family) throw new Error(`a2a_specialist_family_unknown:${familyId}`)
  return family
}
