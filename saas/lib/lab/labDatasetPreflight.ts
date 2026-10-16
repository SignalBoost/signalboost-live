// Pure, no-network preview for customer-provided JSONL. This never authorizes training.
// Mirror server rowsFromExamples: first 128 distinct full items, then last response per prompt.
export type DatasetPreflight = Readonly<{
  lines: number; validRows: number; uniquePrompts: number; invalidLines: number;
  duplicateRows: number; conflictingPrompts: number; truncatedFields: number;
  extraRows: number; ready: boolean;
}>
export function previewLabDataset(raw: string): DatasetPreflight {
  const byItem = new Set<string>()
  const byPrompt = new Map<string, string>()
  let lines = 0, invalidLines = 0, duplicateRows = 0, conflictingPrompts = 0, truncatedFields = 0, extraRows = 0
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    lines++
    let item: unknown
    try { item = JSON.parse(line) } catch { invalidLines++; continue }
    if (!item || typeof item !== 'object' || Array.isArray(item)) { invalidLines++; continue }
    const record = item as Record<string, unknown>
    // Never coerce objects into '[object Object]' or null into 'null'.
    if (typeof record.prompt !== 'string' || typeof record.response !== 'string') { invalidLines++; continue }
    const prompt = record.prompt.trim().slice(0, 8000)
    const response = record.response.trim().slice(0, 20000)
    if (!prompt || !response) { invalidLines++; continue }
    if (record.prompt.trim().length > 8000 || record.response.trim().length > 20000) truncatedFields++
    const key = JSON.stringify([prompt, response])
    if (byItem.has(key)) { duplicateRows++; continue }
    if (byItem.size >= 128) { extraRows++; continue }
    byItem.add(key)
    if (byPrompt.has(prompt) && byPrompt.get(prompt) !== response) conflictingPrompts++
    byPrompt.set(prompt, response)
  }
  return Object.freeze({
    lines, validRows: byItem.size, uniquePrompts: byPrompt.size, invalidLines,
    duplicateRows, conflictingPrompts, truncatedFields, extraRows,
    ready: byPrompt.size >= 20 && byPrompt.size <= 128 && invalidLines === 0 && conflictingPrompts === 0 && truncatedFields === 0 && extraRows === 0,
  })
}

/**
 * Mirrors the server's parsePrompts transformation before customer teacher calls.
 * In particular, prompts exceeding 4,000 characters are truncated before dedupe.
 * No customer text leaves the browser during this preview.
 */
export type PromptPreflight = Readonly<{
  uniquePrompts: number; duplicatePrompts: number; truncatedPrompts: number;
  totalPrompts: number; ready: boolean;
}>
export function previewLabPrompts(raw: string): PromptPreflight {
  const seen = new Set<string>()
  let duplicatePrompts = 0, truncatedPrompts = 0, totalPrompts = 0
  for (const line of raw.split(/\r?\n/)) {
    const cleaned = line.trim()
    if (!cleaned) continue
    totalPrompts++
    if (cleaned.length > 4000) truncatedPrompts++
    const prompt = cleaned.slice(0, 4000)
    if (seen.has(prompt)) duplicatePrompts++
    else seen.add(prompt)
  }
  return Object.freeze({
    uniquePrompts: seen.size, duplicatePrompts, truncatedPrompts, totalPrompts,
    ready: seen.size >= 20 && seen.size <= 128 && truncatedPrompts === 0,
  })
}
