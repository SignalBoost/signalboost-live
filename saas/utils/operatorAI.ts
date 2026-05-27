import { buildPlan } from '@/lib/operator/planner'

export function parseIntent(request: string) {
  const lower = request.toLowerCase()
  if (lower.includes('translate') || lower.includes('language')) return 'language'
  if (lower.includes('button') || lower.includes('layout') || lower.includes('style')) return 'style'
  if (lower.includes('feature')) return 'feature'
  return 'content'
}

export async function generateOperatorPlan(request: string) {
  return buildPlan(request)
}
