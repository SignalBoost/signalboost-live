/** Cursor Cloud Agents v1 adapter for authorized repository work only.
 * Never send customer workspace contents, personal tokens, or source outside an approved repository.
 * Run status is independent of agent lifecycle; a FINISHED run is not a passing test receipt.
 */
const API = 'https://api.cursor.com/v1'
export type CursorRunHandle = Readonly<{ agentId: string; runId: string; url: string }>
export interface CursorTransport {
  (url: string, init: RequestInit): Promise<Pick<Response, 'ok'|'status'|'json'>>
}
export class CursorCloudAgent {
  constructor(private readonly key: string, private readonly transport: CursorTransport = fetch) {
    if (!key) throw new Error('cursor_api_key_required')
  }
  private async request(path: string, method: 'GET'|'POST', body?: unknown): Promise<any> {
    const reply = await this.transport(API + path, {
      method, headers: {
        Authorization: 'Basic ' + Buffer.from(this.key + ':').toString('base64'),
        'Content-Type': 'application/json'
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(25_000)
    })
    if (!reply.ok) throw new Error('cursor_cloud_http_' + reply.status)
    return reply.json()
  }
  async start(input: { repositoryUrl: string; startingRef: string; objective: string }): Promise<CursorRunHandle> {
    const repo = new URL(input.repositoryUrl)
    if (repo.protocol !== 'https:' || repo.hostname !== 'github.com' ||
      !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(repo.pathname))
      throw new Error('cursor_repository_not_approved')
    if (!/^[a-zA-Z0-9._\/-]{1,140}$/.test(input.startingRef) || input.startingRef.includes('..'))
      throw new Error('cursor_invalid_starting_ref')
    if (input.objective.trim().length < 1 || input.objective.length > 30_000)
      throw new Error('cursor_invalid_objective')
    const response = await this.request('/agents','POST',{
      prompt: {text:input.objective}, mode:'agent',
      repos:[{url:repo.toString(),startingRef:input.startingRef}], autoCreatePR:true
    })
    if (!/^bc-/.test(response?.agent?.id ?? '') || !/^run-/.test(response?.run?.id ?? ''))
      throw new Error('cursor_invalid_create_response')
    return {agentId:response.agent.id,runId:response.run.id,url:response.agent.url}
  }
  async status(handle: CursorRunHandle): Promise<{status:string;terminal:boolean;raw:unknown}> {
    if (!/^bc-[A-Za-z0-9-]+$/.test(handle.agentId) || !/^run-[A-Za-z0-9-]+$/.test(handle.runId))
      throw new Error('cursor_invalid_handle')
    const data = await this.request('/agents/'+handle.agentId+'/runs/'+handle.runId,'GET')
    return {status:String(data?.status ?? 'UNKNOWN'),terminal:['FINISHED','ERROR','CANCELLED','EXPIRED'].includes(data?.status),raw:data}
  }
  async repair(handle: CursorRunHandle, failedCommandEvidence: string): Promise<{runId:string}> {
    if (failedCommandEvidence.length > 20_000) throw new Error('cursor_repair_evidence_too_large')
    const state = await this.status(handle)
    if (!state.terminal) throw new Error('cursor_agent_still_running')
    const data = await this.request('/agents/'+handle.agentId+'/runs','POST',{
      prompt:{text:'Repair the following actual host test failures. Do not report success until commands pass.\n'+failedCommandEvidence},mode:'agent'
    })
    if (!/^run-/.test(data?.run?.id ?? '')) throw new Error('cursor_invalid_run_response')
    return {runId:data.run.id}
  }
}
