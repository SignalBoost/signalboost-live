import { callModel } from '@/lib/ai/modelRouter'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import type { OutreachAssets } from '@/lib/outreach/types'

export async function generateOutreachMessage(args: {
  assets: Omit<OutreachAssets, 'outreach_message'>
  language?: string
}): Promise<string> {
  const analysis = args.assets.analyzer_summary
  const fallback = `Hi ${analysis.business_name} team — I’m with SaaS.SignalBoost, an AI growth platform from SignalBoost. I reviewed your public website and prepared a few value-first assets for you: a refreshed one-page site concept, review request strategy, social content plan, and promotional ideas. If helpful, I can send the preview for you to approve or edit. No pressure — just wanted to share something useful for your growth.`

  const prompt = `Write a personalized outreach message introducing SaaS.SignalBoost as the parent AI growth company. Mention value-first assets already generated: website, review strategy, social plan, promo plan. Friendly, respectful, helpful. No hard sell. No guarantees. No claim of private data access.
Language: ${args.language || 'en'}
Business analysis: ${JSON.stringify(analysis)}
Predicted needs: ${JSON.stringify(args.assets.predictive_needs)}
Return plain text only.`

  const raw = await callModel({ modelPreference: 'claude', prompt, maxTokens: 700 })
  const message = (raw || fallback).replace(/^```[a-z]*|```$/g, '').trim()
  const safe = assertSafeOutreachMessage(message)
  return safe.ok ? message : fallback
}
