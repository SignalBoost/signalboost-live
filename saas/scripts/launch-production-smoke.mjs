// Public production smoke test. No test customers, secrets, or destructive requests.
// This is a prerequisite, NOT an end-to-end training/billing acceptance result.
const base = process.env.ITMOUNTS_SMOKE_BASE_URL || 'https://www.itmounts.com'
const url = new URL(base)
if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  throw new Error('smoke_base_must_be_https_origin')
}
// Do not follow arbitrary redirects. Only the canonical www/apex hostname switch
// is permitted, with the exact endpoint path preserved on every hop.
const allowedOrigins = new Set(['https://www.itmounts.com', 'https://itmounts.com'])
if (!allowedOrigins.has(url.origin)) throw new Error('smoke_origin_not_allowed')
async function canonicalGet(target, signal) {
  let current = target
  for (let hops = 0; hops <= 3; hops++) {
    const response = await fetch(current, { method: 'GET', redirect: 'manual', cache: 'no-store', signal, headers: { 'user-agent': 'itmounts-launch-smoke/1' } })
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, final: current }
    const location = response.headers.get('location')
    if (!location || hops === 3) throw new Error('smoke_redirect_not_resolved')
    const next = new URL(location, current)
    if (!allowedOrigins.has(next.origin) || next.pathname !== target.pathname || next.search || next.hash) {
      throw new Error('smoke_redirect_outside_canonical_endpoint')
    }
    current = next
  }
  throw new Error('smoke_redirect_limit')
}
const failures = []
async function probe(path, predicate, description) {
  const target = new URL(path, url.origin)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const { response, final } = await canonicalGet(target, controller.signal)
    const good = predicate(response.status)
    console.log(JSON.stringify({ path, status:response.status, finalOrigin:final.origin, passed:good, expectation:description }))
    if (!good) failures.push(path)
  } catch (error) {
    console.error(JSON.stringify({ path, passed:false, error: error instanceof Error ? error.name : 'network_error' }))
    failures.push(path)
  } finally { clearTimeout(timeout) }
}
await probe('/', status => status === 200, 'public home returns HTTP 200')
await probe('/dashboard', status => [200, 301, 302, 303, 307, 308, 401, 403].includes(status), 'dashboard responds without server failure; login or denial is acceptable')
await probe('/api/internal/lab-phase-observability/health', status => status === 401 || status === 403, 'internal LAB health cannot be read anonymously')
console.log(JSON.stringify({result:failures.length?'failed':'passed',verifiedScope:'anonymous HTTP reachability and internal health authorization only',notVerified:['signup','tenant isolation','billing','training','distillation','artifact delivery','recovery','rollback'],failures}))
if(failures.length)process.exitCode=1
