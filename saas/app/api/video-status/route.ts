import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fal } from '@fal-ai/client'
import { refundVideoCredit } from '@/lib/credits'

fal.config({ credentials: process.env.FAL_KEY })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const requestId: string = body.request_id
    const model: string = body.model

    if (!requestId || !model) {
      return NextResponse.json({ error: 'Missing request_id or model.' }, { status: 400 })
    }

    // Authenticate the user (so refunds go to the right account)
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options))
            } catch {}
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
    }

    // Check the job status
    const status = await fal.queue.status(model, { requestId, logs: false })
    const state = (status as { status?: string }).status

    // Still working
    if (state === 'IN_QUEUE' || state === 'IN_PROGRESS') {
      return NextResponse.json({ status: 'rendering' })
    }

    // Completed — fetch the result and return the MP4 URL
    if (state === 'COMPLETED') {
      const result = await fal.queue.result(model, { requestId })
      const data = (result as { data?: { video?: { url?: string } } }).data
      const videoUrl = data?.video?.url

      if (!videoUrl) {
        // Completed but no video came back — treat as failure, refund
        await refundVideoCredit(user.id)
        return NextResponse.json({ status: 'failed', refunded: true })
      }

      return NextResponse.json({ status: 'done', videoUrl })
    }

    // Anything else (error/cancelled) — refund the credit
    await refundVideoCredit(user.id)
    return NextResponse.json({ status: 'failed', refunded: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Status check failed'
    console.error('video-status error:', message)
    // Don't refund on a transient status-check error — the job may still be running.
    // The UI will retry. Only confirmed failures (above) refund.
    return NextResponse.json({ status: 'rendering' }, { status: 200 })
  }
}
