// Local-only exact prompt overlap check. Never treat this as proof of independent holdout creation.
export type HoldoutLeakage = Readonly<{ trainingPrompts: number; evaluationPrompts: number; overlappingPrompts: number; invalidTrainingLines: number; invalidHoldoutLines: number; safeToScore: boolean }>
export function inspectHoldoutLeakage(trainingJsonl: string, holdoutJsonl: string): HoldoutLeakage {
 const prompts = new Set<string>()
 const normalize = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase()
 let invalidTrainingLines = 0, invalidHoldoutLines = 0, evaluationPrompts = 0, overlappingPrompts = 0
 for (const line of trainingJsonl.split(/\r?\n/)) {
  if (!line.trim()) continue
  try { const v: unknown = JSON.parse(line); const p = (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string,unknown>).prompt : null)
   if (typeof p !== 'string' || !p.trim()) { invalidTrainingLines++; continue }
   prompts.add(normalize(p))
  } catch { invalidTrainingLines++ }
 }
 for (const line of holdoutJsonl.split(/\r?\n/)) {
  if (!line.trim()) continue
  try { const v: unknown = JSON.parse(line); const p = (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string,unknown>).prompt : null)
   if (typeof p !== 'string' || !p.trim()) { invalidHoldoutLines++; continue }
   evaluationPrompts++
   if (prompts.has(normalize(p))) overlappingPrompts++
  } catch { invalidHoldoutLines++ }
 }
 return Object.freeze({ trainingPrompts: prompts.size, evaluationPrompts, overlappingPrompts, invalidTrainingLines, invalidHoldoutLines,
  safeToScore: prompts.size > 0 && evaluationPrompts > 0 && overlappingPrompts === 0 && invalidTrainingLines === 0 && invalidHoldoutLines === 0 })
}
