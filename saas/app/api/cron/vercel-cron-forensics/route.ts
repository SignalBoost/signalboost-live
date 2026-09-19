import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const API = 'https://api.vercel.com'
const PROJECT_ID = 'prj_QElaxvA1fbFjhVraIzamxRha78Du'
const TEAM_ID = 'team_jgndR6Eo6QyP2Fen9UbHy2Q5'

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const cronAuthorized = Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
  const isolatedPreview = process.env.VERCEL_ENV === 'preview'
    && process.env.VERCEL_GIT_COMMIT_REF === 'forensics/vercel-preview-event-probe-20260918'
  return cronAuthorized || isolatedPreview
}

function redact(value: any, key = ''): any {
  if (/token|secret|password|authorization|bearer|api[_-]?key|private[_-]?key|cookie/i.test(key)) return '[REDACTED]'
  if (Array.isArray(value)) return value.map(v => redact(v))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, redact(v, k)]))
  }
  if (typeof value === 'string' && value.length > 1200) return value.slice(0, 1200) + '…'
  return value
}

async function getJson(token: string, url: URL) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  const text = await res.text()
  let body: any = {}
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text.slice(0, 500) } }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(redact(body)).slice(0, 700)}`)
  return body
}

function eventsOf(body: any): any[] {
  if (Array.isArray(body)) return body
  for (const key of ['events','data','items']) if (Array.isArray(body?.[key])) return body[key]
  return []
}

function eventTime(e: any): number {
  for (const c of [e?.created,e?.createdAt,e?.timestamp,e?.date]) {
    const n = Number(c)
    if (Number.isFinite(n) && n > 1e12) return n
    if (Number.isFinite(n) && n > 1e9) return n * 1000
    const p = Date.parse(String(c || ''))
    if (Number.isFinite(p)) return p
  }
  return 0
}

function compactEvent(e: any) {
  return redact({
    id: e?.id ?? e?.uid ?? null,
    at: eventTime(e) ? new Date(eventTime(e)).toISOString() : null,
    type: e?.type ?? e?.action ?? e?.name ?? 'unknown',
    text: String(e?.text ?? e?.message ?? e?.payload?.text ?? '').slice(0, 1000),
    actor: e?.actor ?? e?.user ?? e?.principal ?? e?.payload?.actor ?? e?.payload?.user ?? null,
    principalId: e?.principalId ?? e?.userId ?? null,
    via: e?.via ?? null,
    payload: e?.payload ?? e?.metadata ?? null,
  })
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const token = String(process.env.VERCEL_TOKEN || process.env.VERCEL_AUTH_TOKEN || '').trim()
  if (!token) {
    console.error('[vercel-cron-forensics] server-side Vercel token unavailable')
    return NextResponse.json({ ok: false, error: 'vercel_token_unavailable' }, { status: 503 })
  }

  try {
    const projectUrl = new URL(`${API}/v9/projects/${PROJECT_ID}`)
    projectUrl.searchParams.set('teamId', TEAM_ID)
    const project = await getJson(token, projectUrl)

    const windows = [
      ['initial_failure','2026-09-18T05:15:00Z','2026-09-18T06:15:00Z'],
      ['scheduler_stop','2026-09-18T13:45:00Z','2026-09-18T15:15:00Z'],
      ['manual_recovery','2026-09-18T23:30:00Z','2026-09-19T00:45:00Z'],
    ] as const

    const gathered: any[] = []
    for (const [label, start, end] of windows) {
      const url = new URL(`${API}/v3/events`)
      url.searchParams.set('teamId', TEAM_ID)
      url.searchParams.set('projectIds', PROJECT_ID)
      url.searchParams.set('since', String(Date.parse(start)))
      url.searchParams.set('until', String(Date.parse(end)))
      url.searchParams.set('withPayload', 'true')
      url.searchParams.set('limit', '100')
      const body = await getJson(token, url)
      for (const e of eventsOf(body)) gathered.push({ label, ...compactEvent(e) })
    }

    const seen = new Set<string>()
    const events = gathered
      .filter(e => {
        const key = String(e.id ?? JSON.stringify([e.at,e.type,e.text]))
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a,b) => Date.parse(String(a.at || '')) - Date.parse(String(b.at || '')))

    const result = {
      ok: true,
      project: {
        updatedAt: project?.updatedAt ?? null,
        crons: {
          enabledAt: project?.crons?.enabledAt ?? null,
          disabledAt: project?.crons?.disabledAt ?? null,
          updatedAt: project?.crons?.updatedAt ?? null,
          deploymentId: project?.crons?.deploymentId ?? null,
          definitionCount: Array.isArray(project?.crons?.definitions) ? project.crons.definitions.length : 0,
          sources: Array.isArray(project?.crons?.definitions)
            ? [...new Set(project.crons.definitions.map((d:any) => d?.source).filter(Boolean))]
            : [],
        },
      },
      events,
    }

    console.log('[vercel-cron-forensics]', JSON.stringify(result))
    // Never disclose activity evidence through the preview HTTP response. Evidence is available only
    // in authenticated Vercel runtime logs for this isolated forensic deployment.
    return NextResponse.json({ ok: true, capturedEvents: events.length, evidenceLogged: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[vercel-cron-forensics] failed', message)
    return NextResponse.json({ ok: false, error: message.slice(0,700) }, { status: 503 })
  }
}

export async function POST(req: NextRequest) { return GET(req) }
