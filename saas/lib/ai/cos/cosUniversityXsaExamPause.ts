// saas/lib/ai/cos/cosUniversityXsaExamPause.ts
//
// Production 2026-09-29: students trained with Exclusive Self Attention (XSA) are served by the Transformers/PEFT
// XSA gateway. Their exam answers took 37-44s each against 4.0s for standard-attention students, and 24 of 48 hit
// the evaluator's 50s per-answer limit between 13:15 and 14:40 UTC. No XSA exam finished, yet every attempt still
// paid for a RunPod wake and held one of the few exam slots. XSA training is paused (XSA_ROLLOUT_PERCENT = 0 in
// scripts/cos-university-hf-worker.py); this pauses the canary and exam lanes for the XSA students already trained.
//
// Paused XSA students stay evaluation_pending: PENDING, not FAIL. No verdict is recorded, no attempt is charged and
// no standard is lowered. Turn this off only after the XSA serving runtime answers inside the exam's per-answer limit.
export const MASS_XSA_EXAMS_PAUSED: boolean = true
export const XSA_ATTENTION_ARCHITECTURE = 'exclusive_self_attention_v1' as const

/** True when this artifact must not be canaried or examined while XSA exams are paused. */
export function xsaExamPaused(input: { xsa?: boolean; attentionArchitecture?: string | null }): boolean {
  if (!MASS_XSA_EXAMS_PAUSED) return false
  return input.xsa === true || input.attentionArchitecture === XSA_ATTENTION_ARCHITECTURE
}
