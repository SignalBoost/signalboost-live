// saas/app/api/hub/providers/status/route.ts
//
// Activation engine for the tiered provider map.
// Reads provider-map.json, checks each provider's REQUIRED env-var slots against
// the server environment, and returns a Connected / Not Connected verdict per
// provider — WITHOUT ever exposing an env value to the client (only booleans and
// the NAMES of missing keys). Drop provider-map.json at saas/config/provider-map.json.
//
// A card is "Connected" the instant all its required env vars are present (after a
// redeploy that picks them up). No code change needed to add a provider — edit the JSON.

import { NextResponse } from 'next/server'
import providerMap from '@/config/provider-map.json'

type EnvSlot = { key: string; label: string; required: boolean; secret: boolean }
type Provider = {
  tier: number
  displayName: string
  category: string
  accent: string
  icon: string
  envVars: EnvSlot[]
}

export async function GET() {
  const providers = (providerMap as any).providers as Record<string, Provider>
  const out: Record<string, unknown> = {}

  for (const [id, p] of Object.entries(providers)) {
    const required = (p.envVars || []).filter(v => v.required)
    const missing = required.filter(v => {
      const val = process.env[v.key]
      return !val || val.trim() === ''
    }).map(v => v.key)

    const optionalPresent = (p.envVars || [])
      .filter(v => !v.required)
      .filter(v => {
        const val = process.env[v.key]
        return !!val && val.trim() !== ''
      }).map(v => v.key)

    const connected = missing.length === 0
    out[id] = {
      tier: p.tier,
      displayName: p.displayName,
      category: p.category,
      accent: p.accent,
      icon: p.icon,
      connected,
      status: connected ? 'Connected' : 'Not Connected',
      missingRequired: missing,       // names only — never values
      optionalPresent,                // names only — never values
    }
  }

  return NextResponse.json(
    { providers: out, checkedAt: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
