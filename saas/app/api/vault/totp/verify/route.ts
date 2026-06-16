// saas/app/api/vault/totp/verify/route.ts
// Verify TOTP code and create unlock session

import { NextRequest, NextResponse } from 'next/server'
import { verifyTOTPCode } from '@/lib/auth/totp-service'
import { createClient } from '@supabase/supabase-js'

// Lazy init: read env at request time, not module load, so `next build`
// page-data collection never fails when build-time env is absent.
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase env vars')
  }
  return createClient(supabaseUrl, supabaseKey)
}

export async function POST(req: NextRequest) {
  try {
    const { code, userEmail, totpSecret } = await req.json()

    if (!code || !userEmail || !totpSecret) {
      return NextResponse.json(
        { ok: false, error: 'Missing code, userEmail, or totpSecret' },
        { status: 400 }
      )
    }

    // Verify TOTP code
    const isValid = verifyTOTPCode(totpSecret, code)

    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired code' },
        { status: 401 }
      )
    }

    // Generate session ID
    const sessionId = `vault_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // Create unlock session in Supabase
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min
    
    const supabase = getSupabase()
    const { error } = await supabase
      .from('vault_unlock_sessions')
      .insert([
        {
          session_id: sessionId,
          user_email: userEmail,
          unlocked_at: new Date().toISOString(),
          expires_at: expiresAt,
          mfa_verified: true,
        },
      ])

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json(
        { ok: false, error: 'Failed to create session' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      expiresAt,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('TOTP verify error:', msg)
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    )
  }
}
