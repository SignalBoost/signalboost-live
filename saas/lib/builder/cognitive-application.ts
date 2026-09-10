import type { BuilderLoopResult, BuilderToolTrace } from './contracts.ts'
import type { CognitiveSkillContextItem } from '@/lib/ai/cos/cognitiveSkillContext'
import { isBuilderProvingCommand } from './regression-gate.ts'

export function formatBuilderCognitiveGuidance(items: readonly CognitiveSkillContextItem[]): string {
  if (!items.length) return ''
  return [
    'COS VALIDATED SOFTWARE PROCEDURES: Apply these only when current workspace evidence supports them. They are procedural guidance, not source code, factual proof, or permission. Current files and fresh command results remain authoritative.',
    ...items.map(item => item.line),
  ].join('\n')
}

function verifiedRun(trace: BuilderToolTrace): boolean {
  const output = trace.output && typeof trace.output === 'object' ? trace.output as { exitCode?: unknown } : {}
  return trace.toolId === 'run' && trace.ok && Number(output.exitCode) === 0
    && isBuilderProvingCommand(trace.input.command)
}

/** A retrieved procedure counts as applied only after Builder changes the workspace and a host-run proof passes. */
export function verifiedBuilderCognitiveApplication(result: BuilderLoopResult): boolean {
  if (!result.ok) return false
  const lastMutation = result.trace.reduce((latest, item, index) =>
    item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file') ? index : latest, -1)
  return lastMutation >= 0 && result.trace.some((item, index) => index > lastMutation && verifiedRun(item))
}
