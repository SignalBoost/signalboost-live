import { NextResponse } from 'next/server'
import { runDirectFastTextEdit } from '@/lib/ai/cos/fastTextEditDirect'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return new NextResponse(null, { status: 404 })
  }
  const input = 'edit - i recieved the package yesterday and it need to be checked before we use it.'
  const startedAt = Date.now()
  const result = await runDirectFastTextEdit(input)
  return NextResponse.json({
    ok: Boolean(result?.text),
    text: result?.text || null,
    model: result?.model || null,
    elapsedMs: result?.elapsedMs ?? Date.now() - startedAt,
  }, { status: result?.text ? 200 : 503 })
}
