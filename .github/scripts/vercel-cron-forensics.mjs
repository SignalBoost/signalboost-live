import process from 'node:process'

const token = String(process.env.VERCEL_TOKEN || '').trim()
const projectId = String(process.env.VERCEL_PROJECT_ID || '').trim()
const teamId = String(process.env.VERCEL_TEAM_ID || '').trim()
if (!token || !projectId || !teamId) throw new Error('VERCEL_TOKEN, VERCEL_PROJECT_ID, and VERCEL_TEAM_ID are required')

const API = 'https://api.vercel.com'
const START = Date.parse('2026-09-18T03:00:00Z')
const END = Date.parse('2026-09-19T01:00:00Z')
const WINDOW_MS = 2 * 60 * 60 * 1000

function redact(value, key = '') {
  const sensitive = /token|secret|password|authorization|bearer|api[_-]?key|private[_-]?key|cookie/i
  if (sensitive.test(key)) return '[REDACTED]'
  if (Array.isArray(value)) return value.map(v => redact(v))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, redact(v, k)]))
  }
  if (typeof value === 'string' && value.length > 1000) return value.slice(0, 1000) + '…'
  return value
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  const text = await res.text()
  let body = {}
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text.slice(0,500) } }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(redact(body)).slice(0,1000)}`)
  return body
}

function eventArray(body) {
  if (Array.isArray(body)) return body
  for (const key of ['events','data','items']) if (Array.isArray(body?.[key])) return body[key]
  return []
}

function createdMs(event) {
  for (const candidate of [event?.created, event?.createdAt, event?.timestamp, event?.date]) {
    const n = typeof candidate === 'number' ? candidate : Number(candidate)
    if (Number.isFinite(n) && n > 1e12) return n
    if (Number.isFinite(n) && n > 1e9) return n * 1000
    const parsed = Date.parse(String(candidate || ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function actorOf(event) {
  return redact(event?.actor ?? event?.user ?? event?.principal ?? event?.payload?.actor ?? event?.payload?.user ?? null)
}

function summary(event) {
  const at = createdMs(event)
  const type = String(event?.type ?? event?.action ?? event?.name ?? 'unknown')
  const text = String(event?.text ?? event?.message ?? event?.payload?.text ?? '')
  const payload = redact(event?.payload ?? event?.metadata ?? null)
  const haystack = JSON.stringify({type,text,payload}).toLowerCase()
  const suspicious = /(cron|project|pause|disable|enable|setting|deployment|billing|budget|spend|suspend)/.test(haystack)
  return {
    id: event?.id ?? event?.uid ?? null,
    at: at ? new Date(at).toISOString() : null,
    type,
    text: text.slice(0, 1200),
    actor: actorOf(event),
    principalId: event?.principalId ?? event?.userId ?? null,
    via: redact(event?.via ?? null),
    payload: suspicious ? payload : undefined,
  }
}

const projectUrl = new URL(`${API}/v9/projects/${encodeURIComponent(projectId)}`)
projectUrl.searchParams.set('teamId', teamId)
const project = await getJson(projectUrl)
console.log('PROJECT_CRON_METADATA ' + JSON.stringify(redact({
  id: project?.id,
  name: project?.name,
  updatedAt: project?.updatedAt,
  crons: {
    enabledAt: project?.crons?.enabledAt ?? null,
    disabledAt: project?.crons?.disabledAt ?? null,
    updatedAt: project?.crons?.updatedAt ?? null,
    deploymentId: project?.crons?.deploymentId ?? null,
    definitionCount: Array.isArray(project?.crons?.definitions) ? project.crons.definitions.length : 0,
    sources: Array.isArray(project?.crons?.definitions)
      ? [...new Set(project.crons.definitions.map(d => d?.source).filter(Boolean))]
      : [],
  },
}), null, 2))

const all = new Map()
for (let since = START; since < END; since += WINDOW_MS) {
  const until = Math.min(since + WINDOW_MS - 1, END)
  const url = new URL(`${API}/v3/events`)
  url.searchParams.set('teamId', teamId)
  url.searchParams.set('projectIds', projectId)
  url.searchParams.set('since', String(since))
  url.searchParams.set('until', String(until))
  url.searchParams.set('withPayload', 'true')
  url.searchParams.set('limit', '100')
  const body = await getJson(url)
  const rows = eventArray(body)
  console.log(`WINDOW ${new Date(since).toISOString()}..${new Date(until).toISOString()} events=${rows.length}`)
  for (const e of rows) {
    const key = String(e?.id ?? e?.uid ?? JSON.stringify([createdMs(e), e?.type, e?.text]).slice(0,300))
    all.set(key, e)
  }
}

const events = [...all.values()].sort((a,b) => createdMs(a) - createdMs(b))
console.log(`TOTAL_UNIQUE_EVENTS ${events.length}`)
for (const e of events) console.log('EVENT ' + JSON.stringify(summary(e)))

const focus = events.filter(e => {
  const t = createdMs(e)
  const raw = JSON.stringify(e).toLowerCase()
  const aroundStop = t >= Date.parse('2026-09-18T13:45:00Z') && t <= Date.parse('2026-09-18T15:15:00Z')
  const aroundInitialFailure = t >= Date.parse('2026-09-18T05:15:00Z') && t <= Date.parse('2026-09-18T06:15:00Z')
  const aroundRecovery = t >= Date.parse('2026-09-18T23:30:00Z') && t <= Date.parse('2026-09-19T00:45:00Z')
  return aroundStop || aroundInitialFailure || aroundRecovery || /(cron|project.*disable|project.*enable|pause|suspend|billing|budget|spend)/.test(raw)
})
console.log('FOCUS_EVENTS_BEGIN')
for (const e of focus) console.log(JSON.stringify(redact(e)))
console.log('FOCUS_EVENTS_END')
