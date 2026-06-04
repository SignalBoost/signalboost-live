import { NextResponse } from 'next/server'
import { answerSignalBoostConcierge } from '@/lib/concierge/unifiedConcierge'
import { runConciergePipeline } from '@/lib/concierge/websitePipeline'

type Message = { role?: string; content?: string }

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const messages = Array.isArray(body.messages) ? body.messages as Message[] : []
  const query = typeof body.query === 'string' ? body.query : messages.at(-1)?.content || ''
  const locale = typeof body.locale === 'string' ? body.locale : typeof body.context?.language === 'string' ? body.context.language : 'en'
  const accountId = typeof body.account_id === 'string' ? body.account_id : null
  if (!query.trim()) return NextResponse.json(answerSignalBoostConcierge('Show me SignalBoost Marketplace and SaaS modules', locale))
  const pipeline = await runConciergePipeline({ rawInput: query, language: locale, accountId })
  if (['show_website_analyzer', 'show_website_optimizer', 'show_rebuild_engine', 'request_url'].includes(String(pipeline.action))) return NextResponse.json(pipeline)
  return NextResponse.json({ ...answerSignalBoostConcierge(query, locale), pipeline })
}

export async function GET() {
  return NextResponse.json(answerSignalBoostConcierge('Show me SignalBoost Marketplace and SaaS modules', 'en'))
}
