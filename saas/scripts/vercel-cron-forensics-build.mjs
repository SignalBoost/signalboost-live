import process from 'node:process'

const token = String(process.env.VERCEL_TOKEN || process.env.VERCEL_AUTH_TOKEN || '').trim()
const projectId = 'prj_QElaxvA1fbFjhVraIzamxRha78Du'
const teamId = 'team_jgndR6Eo6QyP2Fen9UbHy2Q5'
if (!token) throw new Error('Vercel server-side token is not configured for this preview environment')

const API = 'https://api.vercel.com'
const START = Date.parse('2026-09-18T03:00:00Z')
const END = Date.parse('2026-09-19T01:00:00Z')
const WINDOW_MS = 2 * 60 * 60 * 1000

function redact(value, key = '') {
  if (/token|secret|password|authorization|bearer|api[_-]?key|private[_-]?key|cookie/i.test(key)) return '[REDACTED]'
  if (Array.isArray(value)) return value.map(v => redact(v))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, redact(v, k)]))
  if (typeof value === 'string' && value.length > 1200) return value.slice(0, 1200) + '…'
  return value
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  const text = await res.text()
  let body = {}
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text.slice(0,500) } }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(redact(body)).slice(0,1000)}`)
  return body
}

function rows(body) {
  if (Array.isArray(body)) return body
  for (const key of ['events','data','items']) if (Array.isArray(body?.[key])) return body[key]
  return []
}
function ts(e) {
  for (const c of [e?.created,e?.createdAt,e?.timestamp,e?.date]) {
    const n = Number(c)
    if (Number.isFinite(n) && n > 1e12) return n
    if (Number.isFinite(n) && n > 1e9) return n*1000
    const p = Date.parse(String(c||''))
    if (Number.isFinite(p)) return p
  }
  return 0
}
function compact(e) {
  const type = e?.type ?? e?.action ?? e?.name ?? 'unknown'
  const text = String(e?.text ?? e?.message ?? e?.payload?.text ?? '')
  return redact({
    id:e?.id ?? e?.uid ?? null,
    at:ts(e) ? new Date(ts(e)).toISOString() : null,
    type,
    text:text.slice(0,1000),
    actor:e?.actor ?? e?.user ?? e?.principal ?? e?.payload?.actor ?? e?.payload?.user ?? null,
    principalId:e?.principalId ?? e?.userId ?? null,
    via:e?.via ?? null,
    payload:e?.payload ?? e?.metadata ?? null,
  })
}

const projectUrl = new URL(`${API}/v9/projects/${projectId}`)
projectUrl.searchParams.set('teamId', teamId)
const project = await getJson(projectUrl)
console.log('FORENSICS_PROJECT ' + JSON.stringify(redact({
  updatedAt:project?.updatedAt ?? null,
  crons:{
    enabledAt:project?.crons?.enabledAt ?? null,
    disabledAt:project?.crons?.disabledAt ?? null,
    updatedAt:project?.crons?.updatedAt ?? null,
    deploymentId:project?.crons?.deploymentId ?? null,
    definitionCount:Array.isArray(project?.crons?.definitions)?project.crons.definitions.length:0,
    sources:Array.isArray(project?.crons?.definitions)?[...new Set(project.crons.definitions.map(d=>d?.source).filter(Boolean))]:[],
  }
})))

const all = new Map()
for (let since=START; since<END; since+=WINDOW_MS) {
  const until=Math.min(since+WINDOW_MS-1,END)
  const url=new URL(`${API}/v3/events`)
  url.searchParams.set('teamId',teamId)
  url.searchParams.set('projectIds',projectId)
  url.searchParams.set('since',String(since))
  url.searchParams.set('until',String(until))
  url.searchParams.set('withPayload','true')
  url.searchParams.set('limit','100')
  const body=await getJson(url)
  const es=rows(body)
  console.log(`FORENSICS_WINDOW ${new Date(since).toISOString()} ${new Date(until).toISOString()} count=${es.length}`)
  for (const e of es) all.set(String(e?.id ?? e?.uid ?? JSON.stringify([ts(e),e?.type,e?.text]).slice(0,300)),e)
}
const events=[...all.values()].sort((a,b)=>ts(a)-ts(b))
console.log(`FORENSICS_TOTAL ${events.length}`)
for (const e of events) {
  const t=ts(e)
  const raw=JSON.stringify(e).toLowerCase()
  const focus=(t>=Date.parse('2026-09-18T05:15:00Z')&&t<=Date.parse('2026-09-18T06:15:00Z'))
    ||(t>=Date.parse('2026-09-18T13:45:00Z')&&t<=Date.parse('2026-09-18T15:15:00Z'))
    ||(t>=Date.parse('2026-09-18T23:30:00Z')&&t<=Date.parse('2026-09-19T00:45:00Z'))
    ||/(cron|disable|enable|project|pause|suspend|billing|budget|spend)/.test(raw)
  if (focus) console.log('FORENSICS_EVENT ' + JSON.stringify(compact(e)))
}
