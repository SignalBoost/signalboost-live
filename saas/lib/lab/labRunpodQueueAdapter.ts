// REA implementation from RunPod's PUBLIC queue-based Serverless API contract.
// This is a real BYOI transport, not an emulated dashboard or a claim of an integrated training worker.
// The caller owns its RunPod account, handler, endpoint and billing.
export type RunpodFetcher = (url: string, init?: RequestInit) => Promise<Response>
export type RunpodJobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'expired' | 'unknown'
export type RunpodJob = Readonly<{
  jobId: string; state: RunpodJobState; output: unknown; failure: string | null
}>
const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/
const BASE = 'https://api.runpod.ai/v2'
const mapStatus: Readonly<Record<string,RunpodJobState>> = {
 IN_QUEUE:'queued', IN_PROGRESS:'running', COMPLETED:'completed',
 FAILED:'failed', CANCELLED:'cancelled', CANCELED:'cancelled',
 TIMED_OUT:'failed', EXPIRED:'expired',
}
function requireId(value: string) {
 if (!VALID_ID.test(value)) throw new Error('lab_runpod_id_invalid')
 return value
}
function requireKey(value:string) {
 if (!value || value.length > 4096 || /\s/.test(value)) throw new Error('lab_runpod_key_invalid')
}
async function request(input: {key:string;endpointId:string;action:string;method:'GET'|'POST';body?:unknown;fetcher:RunpodFetcher}) {
 requireKey(input.key)
 const endpoint = requireId(input.endpointId)
 const path = input.action.split('/').map(requireId).join('/')
 const url = `${BASE}/${endpoint}/${path}`
 let response: Response
 try {
  response = await input.fetcher(url,{
   method: input.method, headers: { authorization: input.key, accept:'application/json', ...(input.body === undefined ? {} : {'content-type':'application/json'}) },
   body: input.body === undefined ? undefined : JSON.stringify(input.body),
   signal: AbortSignal.timeout(20_000), cache:'no-store', redirect:'error',
  })
 } catch { throw new Error('lab_runpod_transport_unconfirmed') }
 if (!response.ok) {
  if (response.status === 404) throw new Error('lab_runpod_job_not_found')
  if (response.status === 401 || response.status === 403) throw new Error('lab_runpod_auth_rejected')
  if (response.status === 429) throw new Error('lab_runpod_rate_limited')
  if (response.status >= 500) throw new Error('lab_runpod_transport_unconfirmed')
  throw new Error('lab_runpod_request_rejected')
 }
 const result = await response.json().catch(()=>null)
 if (!result || typeof result !== 'object') throw new Error('lab_runpod_response_invalid')
 return result as Record<string,unknown>
}
function normalize(body:Record<string,unknown>):RunpodJob {
 const jobId = requireId(String(body.id ?? ''))
 const state = mapStatus[String(body.status ?? '')] ?? 'unknown'
 // Provider output may be customer data. Keep it in-memory only; never log it.
 return Object.freeze({jobId,state,output:state==='completed' ? (body.output ?? null) : null,
  failure:state==='failed' ? 'lab_runpod_job_failed' : null})
}
export async function submitRunpodJob(input:{key:string;endpointId:string;payload:unknown;fetcher:RunpodFetcher}):Promise<RunpodJob> {
 if (input.payload === null || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw new Error('lab_runpod_input_invalid')
 const body = await request({...input,action:'run',method:'POST',body:{input:input.payload}})
 return normalize(body)
}
export async function getRunpodJob(input:{key:string;endpointId:string;jobId:string;fetcher:RunpodFetcher}):Promise<RunpodJob> {
 return normalize(await request({...input,action:'status/'+requireId(input.jobId),method:'GET'}))
}
export async function cancelRunpodJob(input:{key:string;endpointId:string;jobId:string;fetcher:RunpodFetcher}):Promise<RunpodJob> {
 return normalize(await request({...input,action:'cancel/'+requireId(input.jobId),method:'POST'}))
}
export async function retryRunpodJob(input:{key:string;endpointId:string;jobId:string;fetcher:RunpodFetcher}):Promise<RunpodJob> {
 // Retry only an observed failed/timed-out job; never submit a duplicate on a transport timeout.
 const current = await getRunpodJob(input)
 if (current.state !== 'failed') throw new Error('lab_runpod_retry_not_allowed')
 return normalize(await request({...input,action:'retry/'+requireId(input.jobId),method:'POST'}))
}
