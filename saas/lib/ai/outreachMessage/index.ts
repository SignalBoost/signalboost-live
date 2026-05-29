import { callModel } from '@/lib/ai/modelRouter'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import type { OutreachAssets } from '@/lib/outreach/types'

export async function generateOutreachMessage(args: {
  assets: Omit<OutreachAssets, 'outreach_message'>
  language?: string
}): Promise<string> {
  const analysis = args.assets.analyzer_summary
  const fallback = `Hi ${analysis.business_name} team — I’m with SaaS.SignalBoost, the parent company of Digits and an AI-powered marketing automation engine for small businesses. We analyzed your public business page and built a value-first preview for you: here’s a website concept we built for you, plus a review-generation strategy, social content plan, and promotional campaign ideas. SaaS.SignalBoost can automate routine marketing tasks so you can focus on the big picture. If helpful, I can send the preview for you to approve or edit — no pressure, just wanted to share something useful.`

  const prompt = `Write a personalized outreach message introducing SaaS.SignalBoost as the parent company of Digits and the AI-powered marketing automation engine for small businesses. Include these ideas in natural language: “We analyzed your business…”, “Here’s a website we built for you…”, and “Here’s how SaaS.SignalBoost can automate your routine marketing tasks…”. Mention value-first assets already generated: website, review strategy, social plan, promo plan. Friendly, respectful, helpful. No hard sell. No guarantees. No claim of private data access.
Language: ${args.language || 'en'}
Business analysis: ${JSON.stringify(analysis)}
Predicted needs: ${JSON.stringify(args.assets.predictive_needs)}
Return plain text only.`

  const raw = await callModel({ modelPreference: 'claude', prompt, maxTokens: 700 })
  const message = (raw || fallback).replace(/^```[a-z]*|```$/g, '').trim()
  const safe = assertSafeOutreachMessage(message)
  return safe.ok ? message : fallback
}
