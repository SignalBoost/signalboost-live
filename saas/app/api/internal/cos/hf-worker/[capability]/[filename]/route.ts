import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { verifyHfWorkerDeliveryToken } from '@/lib/ai/cos/cosUniversityHfWorkerDelivery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const ALLOWED = new Set(['cos-university-hf-worker.py', 'cos-university-hf-worker-base.py'])

export async function GET(_req: NextRequest, context: { params: Promise<{ capability: string; filename: string }> }) {
  const { capability, filename } = await context.params
  const hfToken = String(process.env.HF_TOKEN || '').trim()
  if (!hfToken || !verifyHfWorkerDeliveryToken(capability, hfToken) || !ALLOWED.has(filename)) return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  try {
    const source = await readFile(path.join(process.cwd(), 'scripts', filename), 'utf8')
    return new Response(source, { status: 200, headers: { 'content-type': 'text/x-python; charset=utf-8', 'cache-control': 'private, no-store, max-age=0', 'x-content-type-options': 'nosniff' } })
  } catch {
    return new Response('worker artifact unavailable', { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
