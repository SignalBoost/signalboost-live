import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest } from 'next/server'
import {
  RUNPOD_REPAIR_FILENAME,
  verifyRunpodBootstrapDeliveryToken,
} from '@/lib/ai/cos/runpodBootstrapDelivery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ capability: string }> },
) {
  const { capability } = await context.params
  const apiKey = String(process.env.RUNPOD_API_KEY || '').trim()
  if (!apiKey || !verifyRunpodBootstrapDeliveryToken(capability, apiKey)) {
    return new Response('not found', {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    })
  }

  try {
    const source = await readFile(
      path.join(process.cwd(), 'scripts', RUNPOD_REPAIR_FILENAME),
      'utf8',
    )
    if (!source.includes('COS_REASONER_CONTEXT_LENGTH') || !source.includes('[cos-runpod-repair]')) {
      return new Response('repair artifact invalid', {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      })
    }

    return new Response(source, {
      status: 200,
      headers: {
        'content-type': 'text/x-shellscript; charset=utf-8',
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return new Response('repair artifact unavailable', {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    })
  }
}
