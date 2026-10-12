// saas/lib/lab/openRouterTeacherPrices.ts
// Turns OpenRouter's public model list (https://openrouter.ai/api/v1/models) into LAB teacher prices.
// OpenRouter documents every pricing value as "USD per token/request/unit" (string). LAB prices are USD per 1M tokens.
// A model is priced only when its whole cost is per-token prompt + completion: no per-request fee, no conditional
// price overrides, reasoning never dearer than completion, text in and text out. Anything else stays unpriced.
// Rounding is always UP, so a stored price can only overstate the cost, never understate it.

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
/** OpenRouter lists hundreds of models; fewer than this means a broken or partial response, never a real catalog. */
export const OPENROUTER_MIN_PRICED_MODELS = 20

export type TeacherPrice = Readonly<{ model: string; input: number; output: number }>

const MODEL_ID = /^[\w./:-]{1,240}$/
const perToken = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : NaN
}
/** USD per token -> USD per 1M tokens, rounded up to the 6 decimals the database stores. */
export const perMillionUp = (usdPerToken: number): number => Math.ceil(Math.round(usdPerToken * 1e12 * 1e3) / 1e3) / 1e6

const listsText = (value: unknown) => !Array.isArray(value) || value.includes('text')

export function parseOpenRouterPrices(payload: unknown): TeacherPrice[] {
  const rows: unknown[] = Array.isArray((payload as any)?.data) ? (payload as any).data : []
  const out = new Map<string, TeacherPrice>()
  for (const row of rows as any[]) {
    const id = row?.id
    const pricing = row?.pricing
    if (typeof id !== 'string' || !MODEL_ID.test(id) || !pricing || typeof pricing !== 'object') continue
    const prompt = perToken(pricing.prompt), completion = perToken(pricing.completion)
    if (prompt === null || completion === null || !(prompt >= 0) || !(completion >= 0) || prompt + completion <= 0) continue
    const request = perToken(pricing.request)
    if (request !== null && request !== 0) continue
    if (Array.isArray(pricing.overrides) && pricing.overrides.length > 0) continue
    const reasoning = perToken(pricing.internal_reasoning)
    if (reasoning !== null && !(reasoning >= 0 && reasoning <= completion)) continue
    if (!listsText(row?.architecture?.input_modalities) || !listsText(row?.architecture?.output_modalities)) continue
    const input = perMillionUp(prompt), output = perMillionUp(completion)
    if (input > 1000 || output > 1000) continue
    out.set(id, Object.freeze({ model: id, input, output }))
  }
  return [...out.values()].sort((a, b) => a.model.localeCompare(b.model))
}
