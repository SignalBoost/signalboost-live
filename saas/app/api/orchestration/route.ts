import { NextRequest, NextResponse } from 'next/server'
import { orchestrate } from '@/lib/orchestration'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = typeof body?.input === 'string' ? body.input.trim() : ''
    if (!input) return NextResponse.json({ error: 'Input is required.' }, { status: 400 })
    const result = await orchestrate({
      input,
      userId: typeof body?.userId === 'string' ? body.userId : undefined,
      language: typeof body?.language === 'string' ? body.language : undefined,
      tone: typeof body?.tone === 'string' ? body.tone : undefined,
      brand: typeof body?.brand === 'string' ? body.brand : undefined,
      projectContext: body?.projectContext && typeof body.projectContext === 'object' ? body.projectContext : undefined,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown orchestration error'
    return NextResponse.json({
      error: 'Operator fallback required.',
      fallback: {
        required: true,
        summary: message,
        recommendedNextSteps: ['Retry the request with more context.', 'Open the recommended module manually.', 'Contact a SignalBoost operator if the issue persists.'],
      },
    }, { status: 500 })
  }
}
