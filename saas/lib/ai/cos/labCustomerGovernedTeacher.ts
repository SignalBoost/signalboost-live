// saas/lib/ai/cos/labCustomerGovernedTeacher.ts
// Governed teacher generation for customer LAB runs.
//
// Order (each step must succeed before the next):
//   1. load the VERIFIED rate card for the run's teacher provider + model from the database (platform-maintained,
//      with source URL and verifier). Customers never enter prices. No card -> lab_teacher_rate_unverified, no calls.
//   2. bound every call conservatively: input tokens <= UTF-8 bytes of system + prompt + the card's per-request overhead
//      (byte-level tokenizers never emit fewer than one byte per token); output tokens <= the max_tokens we send.
//   3. RESERVE the token bounds; the database prices them from the card (x safety margin) against the approved budget.
//   4. execute every call inside the Platform Harness (maxCostUsd = the database's reservation, cost budget enforced).
//   5. before each call, admit it only if spent + in-flight worst case still fits; after any call whose reported usage
//      exceeds its bound, or whose actual cost exceeds its reserved share, admit NO further calls.
//   6. SETTLE actual token counts (unmetered calls at their bound). The database prices them and records the FULL amount,
//      even above the reservation. An overrun blocks all further spending on the run and fails it.
// If the process dies between 3 and 6 the reservation stays committed.
import { createHash } from 'node:crypto'
import { assertPublicHttpUrl } from '../../security/publicFetchGuard.ts'
import { generateWithUniversityTeacher } from './cosUniversityTeacherAdapters.ts'
import { customerTeacherDefinition, CUSTOMER_TEACHER_CREDENTIAL_ENV } from './labCustomerProviderCatalog.ts'
import { buildCustomerTeacherRows, LAB_TEACHER_SYSTEM_PROMPT, type TeacherRow } from './labCustomerTraining.ts'
import { withCustomerLabTeacherHarness } from '../../../platform-harness/adapters/lab-customer-teacher.ts'

export const LAB_TEACHER_MAX_OUTPUT_TOKENS = 1024

/** A platform-verified price list row, as returned by itmounts_lab_customer_teacher_rate_card. */
export type TeacherRateCard = Readonly<{
  id: string
  inputUsdPerMTok: number
  outputUsdPerMTok: number
  requestOverheadTokens: number
  safetyMargin: number
}>

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length

export function validRateCard(card: Partial<TeacherRateCard> | null | undefined): card is TeacherRateCard {
  const n = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
  return !!card && typeof card.id === 'string' && card.id.length > 0
    && n(card.inputUsdPerMTok, 0, 1000) && n(card.outputUsdPerMTok, 0, 1000)
    && (card.inputUsdPerMTok! + card.outputUsdPerMTok!) > 0
    && Number.isInteger(card.requestOverheadTokens) && n(card.requestOverheadTokens, 0, 100_000)
    && n(card.safetyMargin, 1, 3)
}

/** Upper bound on billed input tokens: one token never covers less than one UTF-8 byte, plus chat-template overhead. */
export function inputTokenBound(prompt: string, card: TeacherRateCard) {
  return utf8Bytes(LAB_TEACHER_SYSTEM_PROMPT) + utf8Bytes(prompt) + card.requestOverheadTokens
}
export const outputTokenBound = () => LAB_TEACHER_MAX_OUTPUT_TOKENS

const priced = (inTok: number, outTok: number, card: TeacherRateCard) => (inTok * card.inputUsdPerMTok + outTok * card.outputUsdPerMTok) / 1e6
/** Reservation share for one call: bounds x verified rates x safety margin (mirrors the database). */
export function worstCaseCallUsd(prompt: string, card: TeacherRateCard) {
  return priced(inputTokenBound(prompt, card), outputTokenBound(), card) * card.safetyMargin
}

export type TeacherSettlement = Readonly<{ chargedUsd: number; overrunUsd: number; blocked: boolean; remainingUsd: number }>
export type TeacherBudgetPort = Readonly<{
  /** Verified rate card for this run's teacher; throws lab_teacher_rate_unverified when none is active. */
  rateCard: () => Promise<TeacherRateCard>
  /** Reserves the token bounds; the database prices them and returns the authoritative reserved USD. */
  reserve: (input: { rateCardId: string; inputTokenBound: number; outputTokenBound: number; capUsd: number }) => Promise<{ reservedUsd: number }>
  /** Records actual tokens; the database prices them and keeps the full amount, blocking the run on overrun. */
  settle: (input: { inputTokens: number; outputTokens: number; calls: number; skipped: number; unmetered: number; boundExceeded: number }) => Promise<TeacherSettlement>
}>

export async function runGovernedTeacher(input: {
  organizationId: string
  trainingRunId: string
  teacher: { providerKind: string; model: string; endpoint: string | null; apiKey: string }
  prompts: readonly string[]
  teacherBudgetUsd: number
  budget: TeacherBudgetPort
  concurrency?: number
  // test seams
  harness?: typeof withCustomerLabTeacherHarness
  generate?: typeof generateWithUniversityTeacher
}): Promise<{ rows: TeacherRow[]; datasetHash: string; failures: number; spentUsd: number; reservedUsd: number; skipped: number; settlement: TeacherSettlement }> {
  if (!(input.teacherBudgetUsd > 0)) throw new Error('lab_teacher_budget_invalid')
  const card = await input.budget.rateCard()
  if (!validRateCard(card)) throw new Error('lab_teacher_rate_unverified')
  const definition = customerTeacherDefinition({ kind: input.teacher.providerKind, model: input.teacher.model, endpoint: input.teacher.endpoint })

  // Admit prompts in order while their worst case fits the teacher budget; the rest are not attempted.
  const admitted: string[] = []
  let inBound = 0, outBound = 0, worstTotal = 0
  for (const prompt of input.prompts) {
    const w = worstCaseCallUsd(prompt, card)
    if (worstTotal + w > input.teacherBudgetUsd + 1e-9) break
    admitted.push(prompt); worstTotal += w; inBound += inputTokenBound(prompt, card); outBound += outputTokenBound()
  }
  if (!admitted.length) throw new Error('lab_teacher_budget_exceeded')

  // Nothing is spent before the database accepts this reservation.
  const { reservedUsd } = await input.budget.reserve({ rateCardId: card.id, inputTokenBound: inBound, outputTokenBound: outBound, capUsd: input.teacherBudgetUsd })
  if (!(reservedUsd > 0)) throw new Error('lab_teacher_budget_exceeded')

  const concurrency = Math.max(1, Math.min(4, input.concurrency ?? 4))
  const harness = input.harness ?? withCustomerLabTeacherHarness
  const generate = input.generate ?? generateWithUniversityTeacher
  const env = { [CUSTOMER_TEACHER_CREDENTIAL_ENV]: input.teacher.apiKey } // never process.env
  let spent = 0, inFlight = 0, calls = 0, skipped = 0, unmetered = 0, boundExceeded = 0
  let inTokens = 0, outTokens = 0, overrun = false
  let settlement: TeacherSettlement | null = null
  try {
    const built = await harness({
      organizationId: input.organizationId, trainingRunId: input.trainingRunId, providerKind: input.teacher.providerKind,
      reservedUsd, maxCalls: admitted.length, concurrency,
      operation: async (_manifest, signal) => buildCustomerTeacherRows({
        teacher: { id: definition.id, provider: definition.provider, model: definition.model },
        prompts: admitted, concurrency,
        generate: async prompt => {
          const cap = worstCaseCallUsd(prompt, card)
          if (signal.aborted) throw new Error('harness_deadline_exceeded')
          if (overrun) { skipped++; throw new Error('lab_teacher_budget_overrun') }
          if (spent + inFlight + cap > reservedUsd + 1e-9) { skipped++; throw new Error('lab_teacher_budget_exhausted') }
          inFlight += cap; calls++
          const inB = inputTokenBound(prompt, card), outB = outputTokenBound()
          let usedIn = inB, usedOut = outB // failed or unmetered calls: charge the bound (the provider may have billed)
          try {
            const result = await generate({
              teacher: definition as any,
              request: { system: LAB_TEACHER_SYSTEM_PROMPT, prompt, maxOutputTokens: outB },
              env,
              fetchImpl: (async (url: any, init: any) => {
                await assertPublicHttpUrl(String(url))
                return fetch(url, { ...init, signal, redirect: 'error' })
              }) as typeof fetch,
            })
            if (result.inputTokens == null || result.outputTokens == null) unmetered++
            else {
              usedIn = result.inputTokens; usedOut = result.outputTokens // actual usage, even above the bound
              if (usedIn > inB || usedOut > outB) { boundExceeded++; overrun = true }
            }
            return result.text
          } finally {
            inFlight -= cap; inTokens += usedIn; outTokens += usedOut
            const actual = priced(usedIn, usedOut, card)
            spent += actual
            if (actual > cap + 1e-12 || spent > reservedUsd + 1e-9) overrun = true
          }
        },
      }),
    })
    settlement = await input.budget.settle({ inputTokens: inTokens, outputTokens: outTokens, calls, skipped, unmetered, boundExceeded })
    if (settlement.blocked || settlement.overrunUsd > 0) throw new Error('lab_teacher_budget_overrun')
    return { rows: built.rows, datasetHash: built.datasetHash, failures: built.failures, spentUsd: settlement.chargedUsd, reservedUsd, skipped, settlement }
  } finally {
    if (!settlement) await input.budget.settle({ inputTokens: inTokens, outputTokens: outTokens, calls, skipped, unmetered, boundExceeded })
  }
}

export const teacherRunFingerprint = (prompts: readonly string[]) => createHash('sha256').update(JSON.stringify(prompts)).digest('hex')
