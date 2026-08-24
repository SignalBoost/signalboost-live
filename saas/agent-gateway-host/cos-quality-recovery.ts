// Pre-authorized, bounded recovery for COS quality-control incidents.
//
// This action does not edit application code, provider configuration, credentials, billing,
// authorization, or factual stores. It advances ONE bounded quality-recovery stage per invocation:
// first controlled practice retests, then separate private capability holdout validation. Controlled
// retests never count as holdouts. A sticky weakened skill can return to live use only after fresh
// private validation evidence newer than weakened_at.
import type { AgentRequest, AllowlistEntry } from '../agent-gateway/index.ts'
import type { ChainAttempt, ChainExecutor } from './execution-chain.ts'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runNextFailureAutopsyRetest } from '@/lib/ai/cos/turnFailureAutopsy'
import { reconcileFailureAutopsySkills } from '@/lib/ai/cos/failureAutopsyPromotion'
import { runNextFailureAutopsyPrivateValidation } from '@/lib/ai/cos/failureAutopsyPrivateValidation'

export const COS_QUALITY_REGRESSION_ERROR_CODE = 'cos_quality_benchmark_regression'
export const COS_QUALITY_AUTOPSY_BACKLOG_ERROR_CODE = 'cos_quality_autopsy_backlog'
export const COS_QUALITY_RUNTIME_ERROR_CODE = 'cos_quality_runtime_failure'
export const COS_QUALITY_RECOVERY_KIND = 'supervisor_repair'
export const COS_QUALITY_RECOVERY_TARGET = 'platform.advance_cos_quality_recovery'

export const COS_QUALITY_RECOVERY_ALLOWLIST_ENTRY: AllowlistEntry = Object.freeze({
  actionKind: COS_QUALITY_RECOVERY_KIND,
  target: COS_QUALITY_RECOVERY_TARGET,
  rollback: 'automatic and evidence-gated — controlled retests are practice-only; live promotion requires separate private holdouts, and weakened_at remains sticky until fresh private revalidation',
})

export type CosQualityRecoveryOutcome = {
  stage: 'controlled_practice_retest' | 'private_holdout_validation' | 'idle'
  attempted: number
  passed: number
  failed: number
  retained: number
  results: Array<Record<string, unknown>>
  skillReconciliation: Awaited<ReturnType<typeof reconcileFailureAutopsySkills>>
}

async function pendingControlledRetests(): Promise<number> {
  const db = cosServiceDb()
  if (!db) return 0
  const result = await db.from('cos_turn_failure_autopsies').select('id', { count: 'exact', head: true }).eq('status', 'retest_pending')
  if (result.error) throw result.error
  return Number(result.count ?? 0)
}

export async function advanceCosQualityRecovery(): Promise<CosQualityRecoveryOutcome> {
  const skillReconciliation = await reconcileFailureAutopsySkills()
  const pending = await pendingControlledRetests()

  if (pending > 0) {
    const result = await runNextFailureAutopsyRetest()
    if (!result.ok) {
      return {
        stage: 'controlled_practice_retest', attempted: 0, passed: 0, failed: 0, retained: 0,
        results: [{ ok: false, error: result.error }], skillReconciliation,
      }
    }
    const reconciled = await reconcileFailureAutopsySkills()
    return {
      stage: 'controlled_practice_retest',
      attempted: 1,
      passed: result.passed ? 1 : 0,
      failed: result.passed ? 0 : 1,
      retained: result.lessonRetained ? 1 : 0,
      results: [{
        ok: true,
        autopsyId: result.autopsyId,
        problemClass: result.problemClass,
        primaryStage: result.primaryStage,
        retestCaseId: result.retestCaseId,
        passed: result.passed,
        lessonRetained: result.lessonRetained,
        latencyMs: result.latencyMs,
        evidenceRole: 'controlled_practice_only',
      }],
      skillReconciliation: reconciled,
    }
  }

  const validation = await runNextFailureAutopsyPrivateValidation()
  if (validation.ok) {
    const reconciled = await reconcileFailureAutopsySkills()
    return {
      stage: 'private_holdout_validation',
      attempted: 1,
      passed: validation.passed ? 1 : 0,
      failed: validation.passed ? 0 : 1,
      retained: 0,
      results: [{ ...validation, evidenceRole: 'private_capability_holdout' }],
      skillReconciliation: reconciled,
    }
  }

  return {
    stage: 'idle', attempted: 0, passed: 0, failed: 0, retained: 0,
    results: [{ ok: false, error: validation.error }], skillReconciliation,
  }
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
        const result = await (options.advance ?? advanceCosQualityRecovery)()
        return { handled: true, ok: true, result }
      } catch (error) {
        return { handled: true, ok: false, error: error instanceof Error ? error.message : 'COS quality recovery failed' }
      }
    },
  }
}
