// Bounded failure evidence for Software Specialist admission and Builder prompts.
import { isOperationalLogEvidence } from './pastedOperationalLog.ts'

const FAILURE_LINE = /(✖|not ok|AssertionError|Error:|error TS\d+|Type error|failed|exited with \d|Module not found|Cannot find module)/i

export function extractFailureEvidence(log: string, maxChars = 6000): string {
  const limit = Math.max(1, Math.floor(maxChars) || 6000)
  const lines = log.split('\n')
  const keep = new Set<number>()
  lines.forEach((line, i) => {
    if (FAILURE_LINE.test(line)) {
      for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 12); j++) keep.add(j)
    }
  })
  const picked = [...keep].sort((a, b) => a - b).map(i => lines[i]).join('\n')
  const evidence = picked || log
  if (evidence.length <= limit) return evidence
  // Preserve the first failure as well as the final assertion/command.
  const marker = '\n[... failure evidence omitted ...]\n'
  if (limit <= marker.length) return evidence.slice(-limit)
  const head = Math.floor((limit - marker.length) / 2)
  return evidence.slice(0, head) + marker + evidence.slice(-(limit - marker.length - head))
}

export function trimObjectiveForHarness(objective: string): string {
  if (!isOperationalLogEvidence(objective)) return objective.slice(0, 8000)
  // Keep the request/header and exact failed snapshot even when passing tests fill the middle.
  const header = objective.slice(0, 1000)
  const snapshot = objective.split('\n').find(line => /Cloning.*signalboost-live.*Commit:/i.test(line)) || ''
  return [header, snapshot.slice(0, 500), extractFailureEvidence(objective)].filter(Boolean).join('\n\n')
}

export async function runSoftwareDelegationWithSafeRetry<T>(
  run: (execute: (signal?: AbortSignal) => Promise<T>) => Promise<{ ok: true; value: T; runId: string } | { ok: false; code: string; runId: string }>,
  execute: (signal?: AbortSignal) => Promise<T>,
) {
  let started = false
  const guarded = (signal?: AbortSignal) => { started = true; return execute(signal) }
  const result = await run(guarded)
  // Audit-store admission can be retried; uncertain execution or expired authority cannot.
  if (!result.ok && !started && result.code === 'harness_evidence_sink_unavailable') return run(guarded)
  return result
}
