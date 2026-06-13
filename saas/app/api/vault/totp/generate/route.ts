// saas/app/api/vault/totp/generate/route.ts
// Generate TOTP secret for 2FA setup

import { NextRequest, NextResponse } from 'next/server'
import { generateTOTPSecret, generateBackupCodes } from '@/lib/auth/totp-service'

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
    const secret = generateTOTPSecret()
    const backupCodes = generateBackupCodes()

    // Generate QR code URL using Google Charts API (no server-side dependency)
    const otpauthUrl = `otpauth://totp/SignalBoost:${userEmail}?secret=${secret}&issuer=SignalBoost`
    const qrCodeUrl = `https://chart.googleapis.com/chart?chs=300x300&chld=H|0&cht=qr&chl=${encodeURIComponent(otpauthUrl)}`

    return NextResponse.json({
      ok: true,
      secret,
      qrCodeUrl,
      backupCodes,
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
