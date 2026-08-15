function safeText(value: unknown, max = 1200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Capture only the exact [SK#] -> durable skill_key mapping already injected in governed context. */
export function extractCouncilCognitiveSkillRefs(prompt: string): Record<string, string> {
  const text = String(prompt ?? '').slice(0, 80_000)
  const refs: Record<string, string> = {}
  for (const match of text.matchAll(/\[SK(\d{1,2})\]\s+\[skill_key=([A-Za-z0-9._:-]{1,240})\]/g)) {
    refs[`[SK${Number(match[1])}]`] = safeText(match[2], 240)
  }
  return refs
}
