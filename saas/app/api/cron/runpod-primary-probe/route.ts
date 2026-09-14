import { NextRequest, NextResponse } from 'next/server'
import { configuredRunpodApiKey, configuredRunpodPodId } from '@/lib/ai/cos/runpodConfig'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const RUNPOD_GRAPHQL = 'https://api.runpod.io/graphql'
const RUNPOD_REST = 'https://rest.runpod.io/v1'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

async function fetchRunpodRest(apiKey: string, path: string): Promise<unknown> {
  const response = await fetch(`${RUNPOD_REST}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`RunPod REST ${path} HTTP ${response.status}`)
  return response.json()
}

function safeServerlessEndpoints(payload: unknown) {
  const root = asRecord(payload)
  const rows = Array.isArray(payload) ? payload : asArray(root.endpoints)
  return rows.slice(0, 30).map(row => {
    const value = asRecord(row)
    return {
      id: String(value.id || ''),
      name: String(value.name || ''),
      templateId: typeof value.templateId === 'string' ? value.templateId : null,
      workersMin: typeof value.workersMin === 'number' ? value.workersMin : null,
      workersMax: typeof value.workersMax === 'number' ? value.workersMax : null,
      idleTimeout: typeof value.idleTimeout === 'number' ? value.idleTimeout : null,
      gpuTypeIds: asArray(value.gpuTypeIds).slice(0, 8).map(item => String(item)),
      gpuCount: typeof value.gpuCount === 'number' ? value.gpuCount : null,
    }
  })
}

function safeTemplates(payload: unknown) {
  const root = asRecord(payload)
  const rows = Array.isArray(payload) ? payload : asArray(root.templates)
  return rows.slice(0, 50).map(row => {
    const value = asRecord(row)
    return {
      id: String(value.id || ''),
      name: String(value.name || ''),
      imageName: String(value.imageName || ''),
      isServerless: Boolean(value.isServerless),
      isRunpod: Boolean(value.isRunpod),
      containerDiskInGb: typeof value.containerDiskInGb === 'number' ? value.containerDiskInGb : null,
    }
  })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = configuredRunpodApiKey()
  const configuredPodId = configuredRunpodPodId()
  if (!apiKey) {
    const result = { ok: true, configured: false, apiKeyPresent: false, podIdPresent: Boolean(configuredPodId) }
    console.info('[runpod-primary-probe]', JSON.stringify(result))
    return NextResponse.json(result)
  }

  try {
    const [graphqlResponse, endpointsResult, templatesResult] = await Promise.all([
      fetch(`${RUNPOD_GRAPHQL}?api_key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query { myself { clientBalance currentSpendPerHr spendLimit underBalance minBalance pods { id name desiredStatus costPerHr runtime { uptimeInSeconds } } } }',
        }),
        signal: AbortSignal.timeout(15_000),
      }),
      fetchRunpodRest(apiKey, '/endpoints').then(
        value => ({ ok: true as const, value }),
        error => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
      ),
      fetchRunpodRest(apiKey, '/templates').then(
        value => ({ ok: true as const, value }),
        error => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
      ),
    ])

    if (!graphqlResponse.ok) throw new Error(`RunPod GraphQL HTTP ${graphqlResponse.status}`)
    const body = await graphqlResponse.json() as {
      data?: {
        myself?: {
          clientBalance?: number | null
          currentSpendPerHr?: number | null
          spendLimit?: number | null
          underBalance?: boolean | null
          minBalance?: number | null
          pods?: Array<{
            id?: string
            name?: string
            desiredStatus?: string
            costPerHr?: number | null
            runtime?: { uptimeInSeconds?: number | null } | null
          }>
        }
      }
      errors?: Array<{ message?: string }>
    }
    if (body.errors?.length) throw new Error(`RunPod GraphQL error: ${body.errors.map(error => error.message || 'unknown').join('; ')}`)
    const account = body.data?.myself
    if (!account) throw new Error('RunPod account status unavailable')

    const pods = (account.pods || []).slice(0, 20).map(pod => ({
      id: String(pod.id || ''),
      name: String(pod.name || ''),
      desiredStatus: String(pod.desiredStatus || 'UNKNOWN'),
      running: String(pod.desiredStatus || '') === 'RUNNING',
      costPerHr: typeof pod.costPerHr === 'number' ? pod.costPerHr : null,
      uptimeSeconds: Number(pod.runtime?.uptimeInSeconds || 0),
      configuredMatch: Boolean(configuredPodId && pod.id === configuredPodId),
    }))

    const result = {
      ok: true,
      configured: true,
      configuredPodId: configuredPodId || null,
      configuredPodFound: Boolean(configuredPodId && pods.some(pod => pod.id === configuredPodId)),
      account: {
        clientBalance: typeof account.clientBalance === 'number' ? account.clientBalance : null,
        currentSpendPerHr: typeof account.currentSpendPerHr === 'number' ? account.currentSpendPerHr : null,
        spendLimit: typeof account.spendLimit === 'number' ? account.spendLimit : null,
        underBalance: typeof account.underBalance === 'boolean' ? account.underBalance : null,
        minBalance: typeof account.minBalance === 'number' ? account.minBalance : null,
      },
      pods,
      serverless: {
        endpoints: endpointsResult.ok ? safeServerlessEndpoints(endpointsResult.value) : [],
        templates: templatesResult.ok ? safeTemplates(templatesResult.value) : [],
        endpointsError: endpointsResult.ok ? null : endpointsResult.error,
        templatesError: templatesResult.ok ? null : templatesResult.error,
      },
    }
    console.info('[runpod-primary-probe]', JSON.stringify(result))
    return NextResponse.json(result)
  } catch (error) {
    const result = {
      ok: false,
      configured: true,
      configuredPodId: configuredPodId || null,
      error: error instanceof Error ? error.message : String(error),
    }
    console.warn('[runpod-primary-probe]', JSON.stringify(result))
    return NextResponse.json(result, { status: 502 })
  }
}
