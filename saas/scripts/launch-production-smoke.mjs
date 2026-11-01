// Public production smoke test. No test customers, secrets, or destructive requests.
// This is a prerequisite, NOT an end-to-end training/billing acceptance result.
const base = process.env.ITMOUNTS_SMOKE_BASE_URL || 'https://www.itmounts.com'
const url = new URL(base)
if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  throw new Error('smoke_base_must_be_https_origin')
}
// Follow only canonical www ↔ apex redirects. Never let a credential-free
// acceptance probe silently certify a login page or an unrelated host.
const permittedOrigins = new Set(['https://itmounts.com', 'https://www.itmounts.com'])
if (!permittedOrigins.has(url.origin)) throw new Error('smoke_base_not_itmounts_origin')
const failures = []
async function probe(path, predicate, description) {
  const target = new URL(path, url.origin)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(target, { method:'GET', redirect:'follow', cache:'no-store', signal:controller.signal, headers:{'user-agent':'itmounts-launch-smoke/1'} })
    const finalUrl = new URL(response.url)
    const canonicalDestination = permittedOrigins.has(finalUrl.origin)
      && finalUrl.protocol === 'https:'
      && finalUrl.pathname === target.pathname
      && !finalUrl.search && !finalUrl.hash
    const good = canonicalDestination && predicate(response.status)
    console.log(JSON.stringify({ path, status:response.status, finalOrigin:finalUrl.origin, finalPath:finalUrl.pathname, passed:good, expectation:description }))
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
