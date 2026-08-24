// Pre-authorized, bounded recovery for COS quality-control incidents.
//
// This action does not edit code, prompts, provider configuration, credentials, data, billing, or
// authorization. It advances the existing failure-autopsy retest queue only. A retest itself runs
// through the same governed COS reasoning path and can retain procedural guidance only when an
// independent controlled case passes. Live reuse remains separately gated by repeated clean retests.
import type { AgentRequest, AllowlistEntry } from '../agent-gateway/index.ts'
import type { ChainAttempt, ChainExecutor } from './execution-chain.ts'
import { runNextFailureAutopsyRetest } from '@/lib/ai/cos/turnFailureAutopsy'

export const COS_QUALITY_REGRESSION_ERROR_CODE = 'cos_quality_benchmark_regression'
export const COS_QUALITY_AUTOPSY_BACKLOG_ERROR_CODE = 'cos_quality_autopsy_backlog'
export const COS_QUALITY_RUNTIME_ERROR_CODE = 'cos_quality_runtime_failure'
export const COS_QUALITY_RECOVERY_KIND = 'supervisor_repair'
export const COS_QUALITY_RECOVERY_TARGET = 'platform.advance_cos_quality_recovery'

export const COS_QUALITY_RECOVERY_ALLOWLIST_ENTRY: AllowlistEntry = Object.freeze({
  actionKind: COS_QUALITY_RECOVERY_KIND,
  target: COS_QUALITY_RECOVERY_TARGET,
  rollback: 'none required — this action only advances independent shadow retests and records their objective outcomes; it does not mutate live policy, code, credentials, billing, or production data',
})

export type CosQualityRecoveryOutcome = {
  attempted: number
  passed: number
  failed: number
  retained: number
  results: Array<Record<string, unknown>>
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

  return { attempted, passed, failed, retained, results }
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
