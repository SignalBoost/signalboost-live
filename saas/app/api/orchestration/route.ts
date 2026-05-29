import { NextRequest, NextResponse } from 'next/server'
import { orchestrate } from '@/lib/orchestration'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input = typeof body.input === 'string' ? body.input : ''

    if (!input.trim()) {
      return NextResponse.json({ error: 'Input is required.' }, { status: 400 })
    }

    return NextResponse.json({ plan: orchestrate(input, { locale: body.locale || 'en', module: body.module || 'global' }) })
  } catch (error) {
    console.error('Orchestration API error:', error)
    return NextResponse.json({ error: 'Could not orchestrate workflow.' }, { status: 500 })
  }
}
