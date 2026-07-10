import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.IMPROVMX_API_BASE_URL?.trim() || 'https://api.improvmx.com/v3'

function authHeaders(): HeadersInit | null {
  const apiKey = process.env.IMPROVMX_API_KEY?.trim()
  if (!apiKey) return null

  return {
    Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
    Accept: 'application/json',
  }
}

async function improvmxFetch(path: string, init: RequestInit = {}) {
  const headers = authHeaders()
  if (!headers) {
    return {
      response: null,
      json: null,
      error: NextResponse.json(
        { ok: false, error: 'IMPROVMX_API_KEY is not configured in Vercel' },
        { status: 500 },
      ),
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })

  const text = await response.text()
  let json: any = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }

  return { response, json, error: null }
}

function apiError(status: number, json: any) {
  const message =
    json?.error ||
    json?.message ||
    json?.errors?.[0]?.message ||
    json?.raw ||
    'ImprovMX request failed'

  return NextResponse.json({ ok: false, error: String(message) }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const domain = req.nextUrl.searchParams.get('domain')?.trim().toLowerCase()
    const path = domain
      ? `/domains/${encodeURIComponent(domain)}/aliases`
      : '/domains'

    const { response, json, error } = await improvmxFetch(path)
    if (error) return error
    if (!response?.ok) return apiError(response?.status || 502, json)

    return NextResponse.json({ ok: true, ...json })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const domain = String(body?.domain || '').trim().toLowerCase()
    const alias = String(body?.alias || '').trim().toLowerCase().replace(/@.*$/, '')
    const forward = String(body?.forward || '').trim().toLowerCase()

    if (!domain || !alias || !forward.includes('@')) {
      return NextResponse.json(
        { ok: false, error: 'A domain, alias, and valid forwarding email are required' },
        { status: 400 },
      )
    }

    const { response, json, error } = await improvmxFetch(
      `/domains/${encodeURIComponent(domain)}/aliases`,
      { method: 'POST', body: JSON.stringify({ alias, forward }) },
    )
    if (error) return error
    if (!response?.ok) return apiError(response?.status || 502, json)

    return NextResponse.json({ ok: true, ...json })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const domain = String(body?.domain || '').trim().toLowerCase()
    const alias = String(body?.alias || '').trim().toLowerCase().replace(/@.*$/, '')

    if (!domain || !alias) {
      return NextResponse.json(
        { ok: false, error: 'Domain and alias are required' },
        { status: 400 },
      )
    }

    const { response, json, error } = await improvmxFetch(
      `/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(alias)}`,
      { method: 'DELETE' },
    )
    if (error) return error
    if (!response?.ok) return apiError(response?.status || 502, json)

    return NextResponse.json({ ok: true, ...json })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
