// saas/lib/elevenlabs/limits.ts
// TTS usage limits. Enforced server-side in the /api/tts route.
//
// HARD LIMIT (always applied):
//   - Max characters per single request: 5,000
//
// MONTHLY LIMITS (per plan):
//   - free:     500     chars (~30 sec audio — sample only)
//   - trial:    500     chars (legacy alias for free)
//   - starter:  50,000  chars (~50 min)
//   - pro:      250,000 chars (~4 hours)
//   - business: 1,000,000 chars (~17 hours)
//
// Adjust these numbers once you have real ElevenLabs billing data.

export const HARD_PER_REQUEST_CHAR_LIMIT = 5_000;

export type PlanId = "free" | "trial" | "starter" | "pro" | "business";

export const MONTHLY_CHAR_LIMITS: Record<PlanId, number> = {
  free: 500,
  trial: 500,
  starter: 50_000,
  pro: 250_000,
  business: 1_000_000,
};

export function getMonthlyLimit(
  plan: PlanId | string | null | undefined,
): number {
  if (!plan) return MONTHLY_CHAR_LIMITS.free;
  const normalized = plan.toLowerCase() as PlanId;
  return MONTHLY_CHAR_LIMITS[normalized] ?? MONTHLY_CHAR_LIMITS.free;
}
