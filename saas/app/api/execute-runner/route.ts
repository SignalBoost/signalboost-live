import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { decryptProviderKeys, getUserProviderConfig } from '@/lib/engine/userProviderConfigs'
import { runUniversalProvider } from '@/lib/engine/universalRunner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to execute provider runners.' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const providerId = String(body?.providerId || '').trim()
  const actionId = String(body?.actionId || body?.clientInputs?.actionId || 'default').trim()
  if (!providerId) return NextResponse.json({ error: 'providerId is required.' }, { status: 400 })

  try {
    const savedConfig = await getUserProviderConfig(access.userId)
    const savedKeys = savedConfig?.byok_enabled && savedConfig.active_provider === providerId
      ? decryptProviderKeys(savedConfig.encrypted_keys)
      : {}
    const credentials = { ...savedKeys, ...(body?.encryptedKeys || {}) }

    const result = await runUniversalProvider({
      providerId,
      actionId,
      variables: body?.clientInputs || {},
      credentials,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 502 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to execute runner.' }, { status: 500 })
  }
}
