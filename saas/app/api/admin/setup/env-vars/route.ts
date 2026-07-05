// saas/app/api/admin/setup/env-vars/route.ts
// Owner/admin setup checklist for provider environment variables.
// This helps operators see what the platform needs without hunting through
// provider dashboards. It never returns raw private secrets.

import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

type EnvVisibility = 'public_value' | 'masked_secret' | 'presence_only'
type EnvProvider = 'supabase' | 'vercel' | 'signalboost'

type EnvChecklistItem = {
  key: string
  provider: EnvProvider
  required: boolean
  visibility: EnvVisibility
  present: boolean
  safeValue: string | null
  copyValue: string | null
  whereItIsUsed: string
  operatorNote: string
}

function isAdminAccess(): Promise<boolean> {
  return getAccess()
    .then(access => access.isAdmin)
    .catch(() => false)
}

function maskSecret(value: string | undefined): string | null {
  if (!value) return null
  if (value.length <= 12) return '••••'
  return `${value.slice(0, 6)}••••${value.slice(-4)}`
}

function publicValue(value: string | undefined): string | null {
  return value && value.trim() ? value.trim().replace(/\/$/, '') : null
}

function envItem(input: {
  key: string
  provider: EnvProvider
  required: boolean
  visibility: EnvVisibility
  whereItIsUsed: string
  operatorNote: string
}): EnvChecklistItem {
  const raw = process.env[input.key]
  const present = Boolean(raw && raw.trim())
  const safeValue = input.visibility === 'public_value'
    ? publicValue(raw)
    : input.visibility === 'masked_secret'
      ? maskSecret(raw)
      : null

  return {
    ...input,
    present,
    safeValue,
    copyValue: input.visibility === 'public_value' ? publicValue(raw) : null,
  }
}

function buildChecklist(): EnvChecklistItem[] {
  return [
    envItem({
      key: 'NEXT_PUBLIC_SUPABASE_URL',
      provider: 'supabase',
      required: true,
      visibility: 'public_value',
      whereItIsUsed: 'Browser and server Supabase client connection.',
      operatorNote: 'Safe to display. This is the Supabase project URL, for example https://<project-ref>.supabase.co. Use the value without a trailing slash.',
    }),
    envItem({
      key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      provider: 'supabase',
      required: true,
      visibility: 'masked_secret',
      whereItIsUsed: 'Browser Supabase auth and public client operations.',
      operatorNote: 'Public/anon key, but still masked here to avoid accidental copying into logs or chat. Once it exists in Vercel, the platform can confirm presence but should not echo it raw.',
    }),
    envItem({
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      provider: 'supabase',
      required: true,
      visibility: 'masked_secret',
      whereItIsUsed: 'Server-only admin database actions, Hub Console, audits, vault, and infrastructure PR storage.',
      operatorNote: 'Private server key. It cannot be safely recovered from Vercel or exposed by this app. Paste it once into Vercel or a vault; after that the platform can confirm presence only.',
    }),
    envItem({
      key: 'VERCEL_TOKEN',
      provider: 'vercel',
      required: true,
      visibility: 'masked_secret',
      whereItIsUsed: 'Hub Console Vercel provider actions such as listing env vars, adding env vars, domains, deployments, and project checks.',
      operatorNote: 'Private Vercel token. Required before the platform can manage Vercel from inside SignalBoostAi.',
    }),
    envItem({
      key: 'VERCEL_HUB_PROJECT',
      provider: 'vercel',
      required: true,
      visibility: 'masked_secret',
      whereItIsUsed: 'Identifies the Vercel project used by Hub Console provider actions.',
      operatorNote: 'Project identifier/name used by the Vercel provider templates. Masked because project identifiers can be operationally sensitive.',
    }),
    envItem({
      key: 'VAULT_MASTER_KEY',
      provider: 'signalboost',
      required: false,
      visibility: 'masked_secret',
      whereItIsUsed: 'Optional internal vault encryption for provider secrets and governed setup workflows.',
      operatorNote: 'Recommended for portable/provider setup flows that store secrets instead of pasting them directly into Vercel.',
    }),
  ]
}

export async function GET() {
  if (!(await isAdminAccess())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const items = buildChecklist()
  const required = items.filter(item => item.required)
  const missingRequired = required.filter(item => !item.present).map(item => item.key)

  return NextResponse.json({
    ok: true,
    safety: {
      rawSecretsReturned: false,
      privateSecretRule: 'Private keys are never returned raw. This endpoint shows presence and masked values only.',
      serviceRoleRule: 'SUPABASE_SERVICE_ROLE_KEY must be supplied once from the owner/provider account or vault. The app can verify it exists but must not reveal it.',
    },
    summary: {
      requiredCount: required.length,
      presentRequiredCount: required.length - missingRequired.length,
      missingRequired,
      ready: missingRequired.length === 0,
    },
    copyPasteKeys: items.map(item => item.key),
    items,
  })
}
