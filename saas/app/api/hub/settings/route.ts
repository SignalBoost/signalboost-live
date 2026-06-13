// saas/app/api/hub/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getConsoleSettings, updateConsoleSettings } from '@/lib/hub/settings-service'

type SettingsRequest = {
  requireMFA?: boolean
  requireApprovalForRotation?: boolean
  requireApprovalForExport?: boolean
  auditLogRetentionDays?: number
  sessionTimeoutMinutes?: number
  notifyOnUnauthorizedAccess?: boolean
  notifyOnKeyRotation?: boolean
  notifyOnKeyExpiry?: boolean
  autoRotateKeys?: boolean
  autoRotateIntervalDays?: number
  allowPublicURLs?: boolean
  encryptionEnabled?: boolean
}

export async function GET(req: NextRequest) {
  try {
    const result = await getConsoleSettings()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: SettingsRequest = await req.json()

    // Validate inputs
    if (body.auditLogRetentionDays !== undefined) {
      if (body.auditLogRetentionDays < 7 || body.auditLogRetentionDays > 365) {
        return NextResponse.json(
          { ok: false, error: 'Audit log retention must be between 7 and 365 days' },
          { status: 400 }
        )
      }
    }

    if (body.sessionTimeoutMinutes !== undefined) {
      if (body.sessionTimeoutMinutes < 5 || body.sessionTimeoutMinutes > 480) {
        return NextResponse.json(
          { ok: false, error: 'Session timeout must be between 5 and 480 minutes' },
          { status: 400 }
        )
      }
    }

    if (body.autoRotateIntervalDays !== undefined) {
      if (body.autoRotateIntervalDays < 7 || body.autoRotateIntervalDays > 365) {
        return NextResponse.json(
          { ok: false, error: 'Auto-rotate interval must be between 7 and 365 days' },
          { status: 400 }
        )
      }
    }

    const result = await updateConsoleSettings(body)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
