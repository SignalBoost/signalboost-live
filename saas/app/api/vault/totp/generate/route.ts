// saas/app/api/vault/totp/generate/route.ts
// Start TOTP setup. The user is derived SERVER-SIDE from the session; the secret
// is persisted server-side and NEVER returned to the client (only the QR + backup
// codes). If already enrolled, no new secret is issued.

import { NextResponse } from 'next/server'
import { generateTOTPSecret, generateBackupCodes } from '@/lib/auth/totp-service'
import { getAccess } from '@/lib/auth/access'
import { createClient } from '@supabase/supabase-js'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST() {
  try {
    const ctx = await getAccess()
    if (!ctx.email) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
    }
    const email = ctx.email
    const supabase = admin()

    const { data: existing } = await supabase
      .from('vault_totp_secrets')
      .select('enabled')
      .eq('user_email', email)
      .maybeSingle()

    if (existing?.enabled) {
      // Already enrolled — never re-issue a secret; the client goes straight to verify.
      return NextResponse.json({ ok: true, enrolled: true, email })
    }

    const secret = generateTOTPSecret()
    const backupCodes = generateBackupCodes()

    const { error } = await supabase
      .from('vault_totp_secrets')
      .upsert(
        { user_email: email, secret, backup_codes: backupCodes, enabled: false, updated_at: new Date().toISOString() },
        { onConflict: 'user_email' },
      )
    if (error) {
      console.error('TOTP persist error:', error.message)
      return NextResponse.json({ ok: false, error: 'Failed to start TOTP setup' }, { status: 500 })
    }

    const otpauthUrl = `otpauth://totp/SignalBoost:${encodeURIComponent(email)}?secret=${secret}&issuer=SignalBoost`
    const qrCodeUrl = `https://chart.googleapis.com/chart?chs=300x300&chld=H|0&cht=qr&chl=${encodeURIComponent(otpauthUrl)}`

    // Secret is NEVER sent to the client — only the QR (for the authenticator app)
    // and the one-time backup codes.
    return NextResponse.json({ ok: true, enrolled: false, email, qrCodeUrl, backupCodes })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('TOTP generate error:', msg)
    return NextResponse.json({ ok: false, error: 'TOTP setup failed' }, { status: 500 })
  }
}
