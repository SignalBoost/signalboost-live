import { OperatorPlan, newId } from './store'

const WEBSITE_HINTS = ['website', 'homepage', 'landing', 'restaurant', 'real estate', 'colors', 'button', 'reservation', 'polish', 'portuguese']

export function isUnclearRequest(input: string) {
  const trimmed = input.trim().toLowerCase()
  if (trimmed.length < 12) return true
  return !WEBSITE_HINTS.some(word => trimmed.includes(word))
}

// Pick likely file targets from the request (kept from the original, used by both AI and fallback)
function guessFileTargets(request: string): string[] {
  const lower = request.toLowerCase()
  const files = ['saas/app/dashboard/builder/page.tsx', 'saas/public/i18n/en.json']
  if (lower.includes('podcast')) files.push('saas/app/podcasters/page.tsx')
  if (lower.includes('video')) files.push('saas/app/dashboard/video/page.tsx')
  if (lower.includes('polish') || lower.includes('portuguese') || lower.includes('translate')) {
    files.push('saas/public/i18n/pl.json', 'saas/public/i18n/pt.json')
  }
  return Array.from(new Set(files))
}

// ── Safe fallback: the original template, used if the AI call fails ──
function templatePlan(request: string): OperatorPlan {
  const lower = request.toLowerCase()
  const visualFirst = lower.includes('website') || lower.includes('homepage') || lower.includes('restaurant') || lower.includes('real estate')
  return {
    id: newId('plan'),
    request,
    clarificationQuestion: isUnclearRequest(request)
      ? 'Could you share the page you want me to update first (for example: homepage, podcasters, or builder)?'
      : undefined,
    summary: visualFirst
      ? 'I will first prepare a visual concept update, then apply focused content and layout updates using SignalBoost tools.'
      : 'I will apply a focused product update in small, safe steps with approval before publish.',
    steps: [
      'Understand your goal in plain language.',
      'Inspect the most relevant page files and translation files.',
      'Prepare a visual-first update plan (for website requests) or a focused feature plan.',
      'Show you exactly what will change and ask for approval.',
      'Apply the approved update, publish it, and keep rollback ready.',
    ],
    fileTargets: guessFileTargets(request),
    preview: [
      'Friendly UI update aligned with your requested style and goals.',
      'Content/button/layout updates in the relevant page.',
      'Language updates for translated versions when requested.',
    ],
    requiresApproval: true,
    createdAt: new Date().toISOString(),
  }
}

// ── Call Claude (same pattern as the support route) ──
async function callClaude(systemPrompt: string, userContent: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    if (!response.ok) {
      const errorBody = await response.text()
      console.error('Operator planner Anthropic:', response.status, errorBody)
      return null
    }
    const data = await response.json()
    return data.content?.[0]?.text || ''
  } catch (err) {
    console.error('Operator planner Claude error', err)
    return null
  }
}

const SYSTEM_PROMPT = `You are the SignalBoost AI Operator — an expert product and web consultant.
A user describes something they want to create or change. You produce a clear, SPECIFIC plan for THEIR request.

LANGUAGE (MOST IMPORTANT RULE):
- Detect the language the user wrote their request in.
- Write EVERY text value (summary, steps, preview, clarificationQuestion) in that SAME language.
- If the user wrote in Portuguese, reply entirely in Brazilian Portuguese. Spanish -> Spanish. Polish -> Polish. Russian -> Russian. English -> English.

WHAT TO PRODUCE:
- A real plan tailored to the user's actual idea — not a generic template. Reference what they actually described.
- Be concrete and encouraging, like a senior consultant who understands their business goal.

OUTPUT FORMAT (STRICT):
Respond with ONLY a valid JSON object, no markdown, no backticks, no text before or after. Exactly this shape:
{
  "summary": "one or two sentences describing how you will approach THEIR specific request, in the user's language",
  "steps": ["4 to 6 concrete steps, each a short string, in the user's language"],
  "preview": ["2 to 4 short strings describing what they will get, in the user's language"],
  "clarificationQuestion": "if their request is missing key non-technical info you genuinely need, ask ONE short question in their language; otherwise use an empty string"
}

RULES:
- JSON must be valid: double quotes, no trailing commas.
- Do not invent SignalBoost features that do not exist (websites, reviews, native audio, video captions/clips, podcast tools, promotion campaigns, prospect outreach).
- Keep each string concise.
- clarificationQuestion must be a string (use "" if none).`

export async function buildPlan(request: string, preferredLanguage?: string): Promise<OperatorPlan> {
  const preferred = typeof preferredLanguage === 'string' ? preferredLanguage.trim().toLowerCase() : ''
  const languageHint = preferred
    ? `\n\nPREFERRED LANGUAGE FROM UI: ${preferred}\n- If valid, prioritize this language for the response even if the request is short or mixed-language.`
    : ''

  const raw = await callClaude(SYSTEM_PROMPT + languageHint, request)

  // If the AI is unavailable, fall back to the safe template so the page never breaks.
  if (!raw) return templatePlan(request)

  // Parse the AI's JSON. Tolerate stray text/backticks around the object.
  let parsed: any = null
  try {
    const firstBrace = raw.indexOf('{')
    const lastBrace = raw.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
    }
  } catch {
    parsed = null
  }

  if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.steps)) {
    return templatePlan(request)
  }

  const steps = parsed.steps.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
  const preview = Array.isArray(parsed.preview)
    ? parsed.preview.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : []
  const clarification = typeof parsed.clarificationQuestion === 'string' ? parsed.clarificationQuestion.trim() : ''

  return {
    id: newId('plan'),
    request,
    clarificationQuestion: clarification.length > 0 ? clarification : undefined,
    summary: parsed.summary.trim(),
    steps: steps.length > 0 ? steps : templatePlan(request).steps,
    fileTargets: guessFileTargets(request),
    preview: preview.length > 0 ? preview : templatePlan(request).preview,
    requiresApproval: true,
    createdAt: new Date().toISOString(),
  }
}
