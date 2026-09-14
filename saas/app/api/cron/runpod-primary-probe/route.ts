import { NextRequest, NextResponse } from 'next/server'
import { configuredRunpodApiKey, configuredRunpodPodId } from '@/lib/ai/cos/runpodConfig'
import { queryPodStatus, queryRunpodAccountStatus } from '@/lib/hub/runpodTelemetry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKeyPresent = Boolean(configuredRunpodApiKey())
  const podIdPresent = Boolean(configuredRunpodPodId())
  if (!apiKeyPresent || !podIdPresent) {
    const result = { ok: true, configured: false, apiKeyPresent, podIdPresent }
    console.info('[runpod-primary-probe]', JSON.stringify(result))
    return NextResponse.json(result)
  }

  try {
    const [account, pod] = await Promise.all([
      queryRunpodAccountStatus(),
      queryPodStatus(),
    ])
    const result = {
      ok: true,
      configured: true,
      account,
      pod: {
        id: pod.id,
        name: pod.name,
        running: pod.running,
        desiredStatus: pod.desiredStatus,
        costPerHr: pod.costPerHr,
        uptimeSeconds: pod.uptimeSeconds,
      },
    }
    console.info('[runpod-primary-probe]', JSON.stringify(result))
    return NextResponse.json(result)
  } catch (error) {
    const result = {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    }
    console.warn('[runpod-primary-probe]', JSON.stringify(result))
    return NextResponse.json(result, { status: 502 })
  }
}
