// Read-only, no-credential smoke: confirms a deployed LAB rejects anonymous diagnostic access.
// Run: LAB_ACCEPTANCE_BASE_URL=https://... node scripts/lab-observability-smoke.mjs
// Never pass auth tokens, customer IDs, provider keys or paid execution requests.
const base = process.env.LAB_ACCEPTANCE_BASE_URL
if (!base) { console.error('LAB_ACCEPTANCE_BASE_URL required'); process.exit(2) }
const url = new URL(base)
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
 console.error('HTTPS origin without credentials/query required'); process.exit(2)
}
const uuid = '00000000-0000-4000-8000-000000000001'
let failed = false
for (const path of [
 '/api/lab/training/trace?organizationId='+uuid+'&runId='+uuid,
 '/api/lab/training/diagnostics?organizationId='+uuid,
]) {
 try {
  const response = await fetch(new URL(path,url.origin),{
   method:'GET',headers:{accept:'application/json'},redirect:'manual',
   signal:AbortSignal.timeout(10000),cache:'no-store',
  })
  const body = await response.json().catch(()=>null)
  const valid = response.status===401 && body?.ok===false &&
   body?.error==='lab_unauthorized' && response.headers.get('cache-control')?.includes('no-store') &&
   /^[0-9a-f-]{36}$/i.test(response.headers.get('x-lab-observation-id')||'')
  console.log(JSON.stringify({endpoint:path.split('?')[0],result:valid?'PASS':'FAIL',
   httpStatus:response.status,observed:!!response.headers.get('x-lab-observation-id')}))
  if(!valid)failed=true
 } catch {
  console.log(JSON.stringify({endpoint:path.split('?')[0],result:'ERROR'})); failed=true
 }
}
if(failed)process.exitCode=1
