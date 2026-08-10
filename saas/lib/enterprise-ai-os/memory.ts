import { mergeIntelligence } from '@/lib/enterprise/memory/service.ts'
import type { EnterpriseAiOsSnapshot } from './types.ts'

export function buildEnterpriseAiOsLearningPayload(snapshot: EnterpriseAiOsSnapshot) {
  return {
    enterpriseAiOs: {
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      evaluations: snapshot.evaluations,
      plan: snapshot.plan,
      recommendedRoleIds: snapshot.recommendedRoleIds,
      recommendedSkillIds: snapshot.recommendedSkillIds,
      evidenceRefs: snapshot.evidenceRefs,
    },
  }
}

export async function persistEnterpriseAiOsSnapshot(args: {
  organizationId: string
  snapshot: EnterpriseAiOsSnapshot
  workspace?: string
}): Promise<void> {
  await mergeIntelligence({
    organizationId: args.organizationId,
    workspace: args.workspace || 'enterprise-ai-os',
    snapshot: buildEnterpriseAiOsLearningPayload(args.snapshot),
    confidence: {
      goals: args.snapshot.evaluations.length ? 1 : 0,
      plan: args.snapshot.plan.steps.length ? 0.9 : 0,
      roles: args.snapshot.recommendedRoleIds.length ? 0.9 : 0,
    },
    schemaVersion: 1,
  })
}
