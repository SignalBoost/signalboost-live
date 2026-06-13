// saas/app/api/vault/totp/generate/route.ts
// Generate TOTP secret and QR code for 2FA setup

import { NextRequest, NextResponse } from 'next/server'
import { generateTOTPSecret, generateQRCode } from '@/lib/auth/totp-service'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase env vars')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    const { userEmail } = await req.json()

    if (!userEmail) {
      return NextResponse.json(
        { ok: false, error: 'Missing userEmail' },
        { status: 400 }
      )
    }

    // Generate secret
    const { secret, backupCodes } = generateTOTPSecret(userEmail)

    // Generate QR code
    const qrCode = await generateQRCode(secret)

    return NextResponse.json({
      ok: true,
      secret,
      qrCode, // Data URL for display
      backupCodes, // Show to user once
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('TOTP generate error:', msg)
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    )
  }
}
