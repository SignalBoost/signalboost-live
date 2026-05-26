import { OperatorPlan, newId } from './store'

const WEBSITE_HINTS = ['website', 'homepage', 'landing', 'restaurant', 'real estate', 'colors', 'button', 'reservation', 'polish', 'portuguese']

export function isUnclearRequest(input: string) {
  const trimmed = input.trim().toLowerCase()
  if (trimmed.length < 12) return true
  return !WEBSITE_HINTS.some(word => trimmed.includes(word))
}

export function buildPlan(request: string): OperatorPlan {
  const lower = request.toLowerCase()
  const files = ['saas/app/dashboard/builder/page.tsx', 'saas/public/i18n/en.json']

  if (lower.includes('podcast')) files.push('saas/app/podcasters/page.tsx')
  if (lower.includes('video')) files.push('saas/app/dashboard/video/page.tsx')
  if (lower.includes('polish') || lower.includes('portuguese') || lower.includes('translate')) {
    files.push('saas/public/i18n/pl.json', 'saas/public/i18n/pt.json')
  }

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
    fileTargets: Array.from(new Set(files)),
    preview: [
      'Friendly UI update aligned with your requested style and goals.',
      'Content/button/layout updates in the relevant page.',
      'Language updates for translated versions when requested.',
    ],
    requiresApproval: true,
    createdAt: new Date().toISOString(),
  }
}
