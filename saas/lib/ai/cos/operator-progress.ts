import { isRepairObjective } from '../../builder/regression-gate.ts'

export type OperatorProgressTarget = 'concierge' | 'cos'
export type OperatorProgressStage = 'accepted' | 'diagnosing' | 'fixing' | 'complete' | 'verified' | 'blocked' | 'durable'

function bodyRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null
}

export function operatorRequestText(body: unknown): string {
  const record = bodyRecord(body)
  if (!record) return ''
  if (typeof record.objective === 'string' && record.objective.trim()) return record.objective.trim()
  const messages = Array.isArray(record.messages) ? record.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && typeof message?.content === 'string') return message.content.trim()
  }
  return ''
}

export function isOperatorRepairRequest(body: unknown): boolean {
  const request = operatorRequestText(body)
  return Boolean(request && isRepairObjective(request))
}

/**
 * Progress copy describes observable orchestration stages only. It never exposes hidden reasoning
 * and never claims a repair is verified before the durable Builder result succeeds.
 */
export function operatorProgressMessage(args: {
  stage: OperatorProgressStage
  target: OperatorProgressTarget
  builder: boolean
}): string {
  const actor = args.builder ? 'COS Builder' : args.target === 'cos' ? 'COS' : 'Concierge'
  if (args.stage === 'accepted') return `Found — ${actor} has the problem and is taking ownership of the next step.`
  if (args.stage === 'diagnosing') return `Diagnosing — ${actor} is checking the evidence and isolating the smallest safe fix.`
  if (args.stage === 'fixing') {
    return args.builder
      ? 'Fixing — COS Builder is applying a targeted repair and rerunning the same proof. If it still fails, the new failure becomes the next diagnostic input.'
      : `Fixing — ${actor} is carrying the problem to the furthest safe executable or verified next step available.`
  }
  if (args.stage === 'complete') return 'Resolution ready — the result below states what was fixed or what still needs action; COS does not claim verification without proof.'
  if (args.stage === 'verified') return 'Verified — the repair reached a passing proof. The result below records what changed and what passed.'
  if (args.stage === 'blocked') return 'Verification is not complete yet. The result below identifies the remaining blocker and the next safe action instead of calling the problem fixed.'
  return 'The repair is still running. Its durable result remains in History, and COS will not call it fixed until verification passes.'
}
