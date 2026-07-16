import type { CosContentWorkerInput, CosContentWorkerOutput } from './types'
import { generateContentDraft } from './generator'
import { callModel } from '@/lib/ai/modelRouter'

// "AI" mode of the hybrid script generator. Writes a bespoke script about the
// USER'S business through the model layer. Returns the same CosContentWorkerOutput
// shape as the template generator, so the route and UI treat both identically.
//
// Safety: if the model is unavailable or returns unparseable output, this falls
// back to the dynamic template generator rather than failing the campaign.

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', pt: 'Portuguese', pl: 'Polish', ru: 'Russian',
}

function extractJson(raw: string): any | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try { return JSON.parse(raw.slice(start, end + 1)) } catch { return null }
}

export async function generateContentDraftAI(input: CosContentWorkerInput): Promise<CosContentWorkerOutput> {
  const langName = LANG_NAMES[input.language] || 'English'

  const prompt = [
    'Write a short marketing outreach script for a specific business. Center it entirely on THAT business, not on any platform.',
    '',
    `Business / campaign title: ${input.title}`,
    `Objective: ${input.objective}`,
    `Audience: ${input.audience}`,
    `Channel: ${input.channel}`,
    `Brief: ${input.brief}`,
    '',
    `Write everything in ${langName}.`,
    'Return ONLY valid JSON with exactly these fields and nothing else:',
    '{',
    '  "title": "short compelling title",',
    '  "opening": "2-3 sentence hook about the business",',
    '  "scenes": [',
    '    { "label": "Problem", "narration": "...", "visual_direction": "..." },',
    '    { "label": "Insight", "narration": "...", "visual_direction": "..." },',
    '    { "label": "Solution", "narration": "...", "visual_direction": "..." },',
    '    { "label": "Benefit", "narration": "...", "visual_direction": "..." },',
    '    { "label": "Next step", "narration": "...", "visual_direction": "..." }',
    '  ],',
    '  "call_to_action": "one clear closing line"',
    '}',
  ].join('\n')

  const raw = await callModel({
    prompt,
    systemPrompt: 'You are a marketing copywriter. Always return only valid JSON. No markdown, no commentary.',
    maxTokens: 1800,
  }).catch(() => null)

  const parsed = raw ? extractJson(raw) : null
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes.filter((s: any) => s?.narration) : []

  // Fall back to the dynamic template if the model failed or returned junk.
  if (!parsed || !parsed.title || !parsed.opening || scenes.length < 3) {
    return generateContentDraft(input)
  }

  const normalizedScenes = scenes.map((s: any) => ({
    label: String(s.label || ''),
    narration: String(s.narration || ''),
    visual_direction: String(s.visual_direction || ''),
  }))

  const draft = [
    `Title: ${parsed.title}`,
    '',
    'Opening:',
    String(parsed.opening),
    '',
    'Main flow:',
    ...normalizedScenes.map((scene: any, index: number) => `${index + 1}. ${scene.label}: ${scene.narration}`),
    '',
    'Close:',
    String(parsed.call_to_action || ''),
  ].join('\n')

  return {
    title: String(parsed.title),
    opening: String(parsed.opening),
    draft,
    scenes: normalizedScenes,
    call_to_action: String(parsed.call_to_action || ''),
    estimated_duration_minutes: 5,
    created_at: new Date().toISOString(),
  }
}
