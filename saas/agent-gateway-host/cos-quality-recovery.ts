// Pre-authorized, bounded recovery for COS quality-control incidents.
//
// This action does not edit application code, provider configuration, credentials, billing,
// authorization, or factual stores. It advances independent failure-autopsy retests, then reconciles
// only the existing cognitive-skill lifecycle. Five clean independent retests are required before a
// procedural repair can become validated live guidance; any later failed retest weakens it again.
import type { AgentRequest, AllowlistEntry } from '../agent-gateway/index.ts'
import type { ChainAttempt, ChainExecutor } from './execution-chain.ts'
import { runNextFailureAutopsyRetest } from '@/lib/ai/cos/turnFailureAutopsy'
import { reconcileFailureAutopsySkills } from '@/lib/ai/cos/failureAutopsyPromotion'

export const COS_QUALITY_REGRESSION_ERROR_CODE = 'cos_quality_benchmark_regression'
export const COS_QUALITY_AUTOPSY_BACKLOG_ERROR_CODE = 'cos_quality_autopsy_backlog'
export const COS_QUALITY_RUNTIME_ERROR_CODE = 'cos_quality_runtime_failure'
export const COS_QUALITY_RECOVERY_KIND = 'supervisor_repair'
export const COS_QUALITY_RECOVERY_TARGET = 'platform.advance_cos_quality_recovery'

export const COS_QUALITY_RECOVERY_ALLOWLIST_ENTRY: AllowlistEntry = Object.freeze({
  actionKind: COS_QUALITY_RECOVERY_KIND,
  target: COS_QUALITY_RECOVERY_TARGET,
  rollback: 'automatic — a later failed retest weakens any skill promoted from this exact failure-autopsy cohort, which removes it from live validated-skill retrieval',
})

export type CosQualityRecoveryOutcome = {
  attempted: number
  passed: number
  failed: number
  retained: number
  results: Array<Record<string, unknown>>
  skillReconciliation: Awaited<ReturnType<typeof reconcileFailureAutopsySkills>>
}

export async function advanceCosQualityRecovery(maxRetests = 2): Promise<CosQualityRecoveryOutcome> {
  const max = Math.max(1, Math.min(4, Math.floor(Number(maxRetests) || 2)))
  const results: Array<Record<string, unknown>> = []
  let attempted = 0
  let passed = 0
  let failed = 0
  let retained = 0

  for (let index = 0; index < max; index += 1) {
    const result = await runNextFailureAutopsyRetest()
    if (!result.ok) {
      results.push({ ok: false, error: result.error })
      break
    }
    attempted += 1
    if (result.passed) passed += 1
    else failed += 1
    if (result.lessonRetained) retained += 1
    results.push({
      ok: true,
      autopsyId: result.autopsyId,
      problemClass: result.problemClass,
      primaryStage: result.primaryStage,
      retestCaseId: result.retestCaseId,
      passed: result.passed,
      lessonRetained: result.lessonRetained,
      latencyMs: result.latencyMs,
    })
  }

  const skillReconciliation = await reconcileFailureAutopsySkills()
  return { attempted, passed, failed, retained, results, skillReconciliation }
}

export function createCosQualityRecoveryExecutor(options: {
  advance?: () => Promise<CosQualityRecoveryOutcome>
  id?: string
} = {}): ChainExecutor {
  return {
    id: options.id ?? 'cos-quality-recovery',
    async attempt(request: AgentRequest): Promise<ChainAttempt> {
      if (request.action.kind !== COS_QUALITY_RECOVERY_KIND) return { handled: false, reason: 'not a supervisor repair action' }
      if (request.action.target !== COS_QUALITY_RECOVERY_TARGET) return { handled: false, reason: 'no COS quality-recovery mapping' }
      try {
        const result = await (options.advance ?? (() => advanceCosQualityRecovery(2)))()
        return { handled: true, ok: true, result }
      } catch (error) {
        return { handled: true, ok: false, error: error instanceof Error ? error.message : 'COS quality recovery failed' }
      }
    },
  }
}
