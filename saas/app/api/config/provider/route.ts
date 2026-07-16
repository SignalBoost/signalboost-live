import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getUserProviderConfig, maskProviderKeys, saveUserProviderConfig } from '@/lib/engine/userProviderConfigs'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function GET() {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to load provider config.' }, { status: 401 })

  try {
    const config = await getUserProviderConfig(access.userId)
    return NextResponse.json({
      config: config ? {
        activeProvider: config.active_provider,
        byokEnabled: config.byok_enabled,
        savedKeys: maskProviderKeys(config.encrypted_keys),
        updatedAt: config.updated_at,
      } : null,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load provider config.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to save provider config.' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  try {
    const saved = await saveUserProviderConfig(access.userId, {
      activeProvider: body?.activeProvider ?? body?.active_provider ?? body?.provider,
      byokEnabled: body?.byokEnabled ?? body?.byok_enabled,
      keys: body?.keys ?? body?.customApiKeys ?? body?.encryptedKeys ?? {},
    })

    return NextResponse.json({
      config: {
        activeProvider: saved.active_provider,
        byokEnabled: saved.byok_enabled,
        savedKeys: maskProviderKeys(saved.encrypted_keys),
        updatedAt: saved.updated_at,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save provider config.' }, { status: 400 })
  }
}
