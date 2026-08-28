/**
 * Release checks for the 1.2 MW / DVFS / ToR / checkpoint lever vignette.
 * Prompt text does not bind Qwen. This module is the deterministic gate.
 */

import { detectAdvisoryDiagnosisIntent } from './advisoryDiagnosisIntent.ts'

const WINNER_RE = /\b(?:primary (?:line of )?defense|last resort|hierarchical (?:control|approach)|optimal strategy is a hierarchical|prioritize dvfs|tertiary\s*\(|immediate \(0-100ms\))\b/i
const SCRUB_AS_POWER_RE = /\b(?:memory scrubbing|compute context resets).{0,180}\b(?:preempt|power|breaker|stabilize)\b|\b(?:preempt|power|breaker).{0,180}\b(?:memory scrubbing|compute context resets)\b/i

export function isPowerStabilizationPrompt(prompt: string): boolean {
  const text = String(prompt || '')
  if (detectAdvisoryDiagnosisIntent(text).isAdvisoryDiagnosis) return true
  return /\bdvfs\b/i.test(text) && /\b(?:packet pac|preempt|pdu|1\.2\s*mw)\b/i.test(text)
}

export function powerStabilizationDefects(answer: string): string[] {
  const text = String(answer || '')
  const defects: string[] = []
  if (WINNER_RE.test(text)) defects.push('named_a_winning_lever')
  if (SCRUB_AS_POWER_RE.test(text)) defects.push('security_scrub_used_as_power_evidence')
  return defects
}

export function powerStabilizationRepairInstruction(): string {
  return [
    'QUALITY REPAIR — the prior draft ranked load-shedding levers or used GPU memory-scrubbing security facts as power evidence.',
    'Rewrite as a discrimination brief only.',
    '- Treat DVFS, ToR packet pacing, and checkpoint preemption as levers, not as a hierarchical plant procedure.',
    '- Do not say primary defense, last resort, hierarchical approach, or prioritize one lever.',
    '- Do not use memory residue, context reset, or tenant scrubbing as power or cooling evidence.',
    '- Box any timing, NEC, kW-per-node, or controller name as ASSUMPTION — standard published practice — override if this site differs.',
    '- Last sentence exactly: You cannot stand behind a single cause or a single winning lever with the readings given.',
  ].join('\n')
}
