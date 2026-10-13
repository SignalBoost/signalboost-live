// Real Hugging Face ports for customer LAB runs. Every call uses the token passed in (the customer's), never HF_TOKEN.
import {
  fetchHuggingFaceJobLogTail, findHuggingFaceJobByName, HUGGING_FACE_JOBS_API,
  resolveHuggingFaceNamespace, submitHuggingFaceJob,
} from './cosUniversityHuggingFaceJobs.ts'
import type { HfPorts } from './labCustomerTraining.ts'

export const customerHfPorts: HfPorts = Object.freeze({
  resolveNamespace: (token: string) => resolveHuggingFaceNamespace({ token }),
  submit: (namespace, token, spec) => submitHuggingFaceJob({ namespace, token, spec }),
  findByName: async (namespace, token, name) => {
    const found = await findHuggingFaceJobByName({ namespace, token, name })
    return found ? { jobId: found.jobId, jobUrl: found.jobUrl } : null
  },
})

export async function readCustomerJob(input: { namespace: string; jobId: string; token: string }): Promise<{ stage: string; logTail: string }> {
  const response = await fetch(`${HUGGING_FACE_JOBS_API}/api/jobs/${encodeURIComponent(input.namespace)}/${encodeURIComponent(input.jobId)}`, {
    headers: { authorization: `Bearer ${input.token}` }, redirect: 'error',
  })
  if (!response.ok) throw new Error(`lab_hf_job_status_rejected:${response.status}`)
  const payload = await response.json() as any
  const stage = String(payload?.status?.stage ?? payload?.stage ?? '').toUpperCase()
  let logTail = ''
  if (stage === 'ERROR' || stage === 'CANCELED') {
    logTail = await fetchHuggingFaceJobLogTail({ namespace: input.namespace, jobId: input.jobId, token: input.token, tailLines: 60 }).catch(() => '')
  }
  return { stage, logTail }
}

/** Lists the trained model's files at the pinned revision (customer token). LFS files carry their sha256. */
export async function listArtifactFiles(input: { repo: string; revision: string; token: string }): Promise<{ path: string; size: number; sha256: string | null; gitOid: string | null }[]> {
  const url = `${HUGGING_FACE_JOBS_API}/api/models/${input.repo.split('/').map(encodeURIComponent).join('/')}/tree/${encodeURIComponent(input.revision)}?recursive=true`
  const response = await fetch(url, { headers: { authorization: `Bearer ${input.token}` }, redirect: 'error' })
  if (!response.ok) throw new Error(`lab_hf_artifact_list_rejected:${response.status}`)
  const rows = await response.json() as any[]
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row?.type === 'file' && typeof row?.path === 'string')
    .map(row => {
      const lfs = String(row?.lfs?.oid ?? '')
      const sha256 = /^[a-f0-9]{64}$/.test(lfs) ? lfs : null
      const size = Number(sha256 ? row?.lfs?.size ?? row.size : row.size) || 0
      const gitOid = !sha256 && /^[a-f0-9]{40}$/.test(String(row?.oid ?? '')) ? String(row.oid) : null
      return { path: String(row.path), size, sha256, gitOid }
    })
    .filter(file => file.sha256 || file.gitOid)
}

/** Opens one file at the pinned revision with the customer's token (server side; the token never leaves the server). */
export async function openArtifactFile(input: { repo: string; revision: string; path: string; token: string }): Promise<Response> {
  const url = `${HUGGING_FACE_JOBS_API}/${input.repo.split('/').map(encodeURIComponent).join('/')}/resolve/${encodeURIComponent(input.revision)}/${input.path.split('/').map(encodeURIComponent).join('/')}`
  // Hugging Face redirects LFS files to its CDN with a signed URL; follow it server-side.
  const response = await fetch(url, { headers: { authorization: `Bearer ${input.token}` }, redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`lab_hf_artifact_file_rejected:${response.status}`)
  return response
}
