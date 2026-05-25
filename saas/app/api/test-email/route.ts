import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendEmail } from '@/lib/email'

export async function GET() {
  try {
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
    if (!user?.email) {
      return NextResponse.json({ error: 'Sign in first, then visit this URL.' }, { status: 401 })
    }

    const result = await sendEmail({
      from: 'saasSupport',
      to: user.email,
      subject: 'Thank you for being a SaaSSignal Pro member 🎉',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a2e;">
          <h2 style="color:#1a1a2e;">Thank you for being a Pro member</h2>
          <p>Hi there,</p>
          <p>We just wanted to say thank you for being a <strong>Pro</strong> member of the Signal ecosystem.
          Your support means a lot as we keep building tools to help your business grow.</p>
          <p>As a Pro member you have access to AI-built websites, multilingual content,
          automated reviews, and AI video generation — with much more on the way.</p>
          <p>If there's ever anything we can help with, just reply to this email.</p>
          <p style="margin-top:24px;">Warm regards,<br/><strong>The SaaSSignal Team</strong></p>
        </div>
      `,
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    }
    return NextResponse.json({ ok: true, id: result.id, sentTo: user.email })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
