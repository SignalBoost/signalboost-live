// saas/console-core/executors/openai.ts
//
// OpenAI provider on the portable engine. Read-only observability actions that
// work with just OPENAI_API_KEY. Importing this module registers them.

import { registerExecutor } from '../defaultHost'
import type { ActionField, ActionSchema } from '../types'

const API = 'https://api.openai.com/v1'

function key(): string | null {
  return process.env.OPENAI_API_KEY || null
}
async function getJSON(path: string): Promise<{ ok: true; json: any } | { ok: false; error: string }> {
  const k = key()
  if (!k) return { ok: false, error: 'OPENAI_API_KEY not set' }
  const res = await fetch(`${API}${path}`, { headers: { Authorization: 'Bearer ' + k } })
  if (!res.ok) return { ok: false, error: `OpenAI error (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}` }
  return { ok: true, json: await res.json() }
}
const schema = (id: string, label: string, verb: string, fields: ActionField[]): ActionSchema => ({ id, label, verb, fields })

const MODEL_FIELD: ActionField = {
  id: 'model', label: 'Model', type: 'remote_select', required: true,
  remoteSource: { action: 'openai.list_models', dataPath: 'models', valueKey: 'id', labelTemplate: '{id}' },
}

// View Models
registerExecutor({
  providerId: 'openai', actionId: 'list_models', policyActionId: 'read_provider_status',
  schema: schema('openai.list_models', 'View Models', 'view', []),
  async run() {
    const r = await getJSON('/models'); if (!r.ok) return r
    const models = ((r.json.data || []) as any[])
      .map(m => ({ id: m.id, owned_by: m.owned_by }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    return { ok: true, message: `${models.length} model${models.length === 1 ? '' : 's'}`, data: { count: models.length, models } }
  },
})

// Model Details (picker-driven)
registerExecutor({
  providerId: 'openai', actionId: 'retrieve_model', policyActionId: 'read_provider_status',
  schema: schema('openai.retrieve_model', 'Model Details', 'view', [MODEL_FIELD]),
  async run(_ctx, input) {
    const model = String(input.model || ''); if (!model) return { ok: false, error: 'Model is required' }
    const r = await getJSON(`/models/${encodeURIComponent(model)}`); if (!r.ok) return r
    const m = r.json
    return { ok: true, message: `Model: ${m.id}`, data: { id: m.id, owned_by: m.owned_by, created: m.created } }
  },
})

// List Files
registerExecutor({
  providerId: 'openai', actionId: 'list_files', policyActionId: 'read_provider_status',
  schema: schema('openai.list_files', 'List Files', 'view', []),
  async run() {
    const r = await getJSON('/files'); if (!r.ok) return r
    const files = ((r.json.data || []) as any[]).map(f => ({ id: f.id, filename: f.filename, bytes: f.bytes, purpose: f.purpose, created_at: f.created_at }))
    return { ok: true, message: `${files.length} file${files.length === 1 ? '' : 's'}`, data: { count: files.length, files } }
  },
})

// Fine-tuning Jobs
registerExecutor({
  providerId: 'openai', actionId: 'list_fine_tunes', policyActionId: 'read_provider_status',
  schema: schema('openai.list_fine_tunes', 'Fine-tuning Jobs', 'view', []),
  async run() {
    const r = await getJSON('/fine_tuning/jobs?limit=20'); if (!r.ok) return r
    const jobs = ((r.json.data || []) as any[]).map(j => ({ id: j.id, model: j.model, status: j.status, created_at: j.created_at }))
    return { ok: true, message: `${jobs.length} fine-tuning job${jobs.length === 1 ? '' : 's'}`, data: { count: jobs.length, jobs } }
  },
})

// Batch Jobs
registerExecutor({
  providerId: 'openai', actionId: 'list_batches', policyActionId: 'read_provider_status',
  schema: schema('openai.list_batches', 'Batch Jobs', 'view', []),
  async run() {
    const r = await getJSON('/batches?limit=20'); if (!r.ok) return r
    const batches = ((r.json.data || []) as any[]).map(b => ({ id: b.id, status: b.status, endpoint: b.endpoint, created_at: b.created_at }))
    return { ok: true, message: `${batches.length} batch${batches.length === 1 ? '' : 'es'}`, data: { count: batches.length, batches } }
  },
})

const CODEX_URL = 'https://chatgpt.com/codex/cloud'
const TEXT_FIELD: ActionField['type'] = 'text'
const DEFAULT_REPO = 'SignalBoost/signalboost-live'
const GITHUB_REPO_FIELD: ActionField = { id: 'repo', label: 'Repository', type: 'remote_select', required: true, remoteSource: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } }
const GITHUB_BRANCH_FIELD: ActionField = { id: 'branch', label: 'Branch', type: 'remote_select', required: true, remoteSource: { action: 'github.list_branches', dataPath: 'branches', valueKey: 'name', labelTemplate: '{name}', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } }
const GITHUB_REF_FIELD: ActionField = { id: 'ref', label: 'Branch / Ref', type: 'remote_select', required: true, remoteSource: { action: 'github.list_branches', dataPath: 'branches', valueKey: 'name', labelTemplate: '{name}', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } }
const GITHUB_FILES_FIELD: ActionField = { id: 'files', label: 'Selected Files', type: 'remote_select', remoteSource: { action: 'github.list_files', dataPath: 'files', valueKey: 'path', labelTemplate: '{path}', dependsOn: ['repo', 'branch'], emptyHint: 'Pick a repository and branch first' } }
const GITHUB_FILE_PATH_FIELD: ActionField = { id: 'filePath', label: 'File Path', type: 'remote_select', required: true, remoteSource: { action: 'github.list_files', dataPath: 'files', valueKey: 'path', labelTemplate: '{path}', dependsOn: ['repo', 'ref'], emptyHint: 'Pick a repository and ref first' } }
const GITHUB_EXPECTED_FILE_FIELD: ActionField = { id: 'expectedFile', label: 'Expected File', type: 'remote_select', remoteSource: { action: 'github.list_files', dataPath: 'files', valueKey: 'path', labelTemplate: '{path}', dependsOn: ['repo', 'branch'], emptyHint: 'Pick a repository and branch first' } }
const GITHUB_PR_FIELD: ActionField = { id: 'prNumber', label: 'Pull Request', type: 'remote_select', remoteSource: { action: 'github.list_prs', dataPath: 'pulls', valueKey: 'number', labelTemplate: '#{number} — {title} ({branch}, {state})', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } }

function lines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean)
  const raw = String(value || '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(v => String(v).trim()).filter(Boolean)
  } catch {}
  return raw.split(/\r?\n|,/).map(v => v.trim()).filter(Boolean)
}

function codexPrompt(input: Record<string, unknown>): string {
  const files = lines(input.files)
  const checks = lines(input.verificationStrings)
  return [
    `Repo: ${String(input.repo || DEFAULT_REPO).trim()}`,
    `Target branch: ${String(input.branch || 'main').trim()}`,
    '',
    'Objective:',
    String(input.objective || '').trim(),
    '',
    files.length ? `Relevant files:\n${files.map(f => `- ${f}`).join('\n')}` : 'Relevant files: Not specified.',
    '',
    'Instructions:',
    String(input.instructions || '').trim() || 'Follow the repository conventions. Do not touch unrelated providers or files.',
    '',
    checks.length ? `Verification strings:\n${checks.map(v => `- ${v}`).join('\n')}` : 'Verification strings: Not specified.',
    '',
    `Commit message: ${String(input.commitMessage || 'fix(hub): make Codex Cloud action generate copyable Codex prompt instead of static url output').trim()}`,
    '',
    'After implementation, commit changes on the requested branch and open or update a GitHub pull request. Report the branch, PR URL, files changed, verification output, and final commit SHA.',
  ].join('\n')
}

const CODEX_BASE_FIELDS: ActionField[] = [
  { id: 'objective', label: 'Objective', type: TEXT_FIELD, required: true },
  GITHUB_REPO_FIELD,
  GITHUB_BRANCH_FIELD,
  GITHUB_FILES_FIELD,
  { id: 'commitMessage', label: 'Commit Message', type: TEXT_FIELD },
  { id: 'instructions', label: 'Instructions', type: TEXT_FIELD },
  { id: 'verificationStrings', label: 'Verification Strings', type: TEXT_FIELD },
]

registerExecutor({
  providerId: 'openai', actionId: 'codex_open_cloud', policyActionId: 'read_provider_status',
  schema: schema('openai.codex_open_cloud', 'Open Codex Cloud', 'create', CODEX_BASE_FIELDS),
  async run(_ctx, input) {
    const prompt = codexPrompt(input)
    return { ok: true, message: 'Codex Cloud handoff prompt ready. Copy this prompt, open Codex Cloud, and paste it into the Codex task box. No Codex API task was created.', data: { codexCloudUrl: CODEX_URL, prompt, directExecution: false, handoffOnly: true } }
  },
})

registerExecutor({
  providerId: 'openai', actionId: 'codex_generate_prompt', policyActionId: 'read_provider_status',
  schema: schema('openai.codex_generate_prompt', 'Generate Codex Prompt', 'create', CODEX_BASE_FIELDS),
  async run(_ctx, input) {
    const prompt = codexPrompt(input)
    return { ok: true, message: 'Codex handoff prepared. Open Codex Cloud and paste this prompt; no Codex API task was created.', data: { codexCloudUrl: CODEX_URL, prompt, directExecution: false } }
  },
})

registerExecutor({
  providerId: 'openai', actionId: 'codex_save_handoff', policyActionId: 'read_provider_status',
  schema: schema('openai.codex_save_handoff', 'Save Codex Handoff', 'create', [
    { id: 'objective', label: 'Objective', type: TEXT_FIELD, required: true },
    GITHUB_REPO_FIELD,
    GITHUB_BRANCH_FIELD,
    { id: 'instructions', label: 'Codex Prompt / Handoff', type: TEXT_FIELD, required: true },
  ]),
  async run(_ctx, input) {
    const handoff = { objective: String(input.objective || ''), repo: String(input.repo || ''), branch: String(input.branch || ''), instructions: String(input.instructions || ''), codexCloudUrl: CODEX_URL, persistence: 'manual_roadmap' }
    return { ok: true, message: 'Codex handoff prepared for manual storage. No persistent hub handoff store is wired yet, and no Codex task was created.', data: { handoff, directExecution: false } }
  },
})

async function githubJSON(path: string) {
  const token = process.env.GITHUB_WRITE_TOKEN
  if (!token) return { ok: false as const, error: 'GitHub not configured — set GITHUB_WRITE_TOKEN' }
  const res = await fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, cache: 'no-store' })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch {}
  if (!res.ok) return { ok: false as const, status: res.status, error: `GitHub error (HTTP ${res.status}): ${text.slice(0, 300)}` }
  return { ok: true as const, status: res.status, json }
}

registerExecutor({
  providerId: 'openai', actionId: 'codex_track_github_result', policyActionId: 'read_provider_status',
  schema: schema('openai.codex_track_github_result', 'Track Codex Branch/PR', 'view', [
    GITHUB_REPO_FIELD,
    GITHUB_BRANCH_FIELD,
    GITHUB_PR_FIELD,
    GITHUB_EXPECTED_FILE_FIELD,
  ]),
  async run(_ctx, input) {
    const repo = String(input.repo || '').trim(); const branch = String(input.branch || '').trim()
    const branchResult = await githubJSON(`/repos/${repo}/branches/${encodeURIComponent(branch)}`)
    const prNumber = String(input.prNumber || '').trim()
    const prResult = prNumber ? await githubJSON(`/repos/${repo}/pulls/${encodeURIComponent(prNumber)}`) : await githubJSON(`/repos/${repo}/pulls?head=${encodeURIComponent(repo.split('/')[0] + ':' + branch)}&state=all&per_page=10`)
    const expectedFile = String(input.expectedFile || '').trim()
    const fileResult = expectedFile ? await githubJSON(`/repos/${repo}/contents/${expectedFile.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`) : null
    const found = { branch: branchResult.ok, pr: prResult.ok && (Array.isArray(prResult.json) ? prResult.json.length > 0 : Boolean(prResult.json?.number)), expectedFile: expectedFile ? Boolean(fileResult?.ok) : null }
    return { ok: true, message: `Codex GitHub verification: branch ${found.branch ? 'found' : 'not found'}, PR ${found.pr ? 'found' : 'not found'}${expectedFile ? `, file ${found.expectedFile ? 'found' : 'not found'}` : ''}.`, data: { found, branch: branchResult.ok ? { name: branch, sha: branchResult.json?.commit?.sha } : null, pr: prResult.ok ? prResult.json : null, expectedFile, directExecution: false } }
  },
})

registerExecutor({
  providerId: 'openai', actionId: 'codex_verify_result', policyActionId: 'read_provider_status',
  schema: schema('openai.codex_verify_result', 'Verify Codex Result', 'view', [
    GITHUB_REPO_FIELD,
    GITHUB_REF_FIELD,
    GITHUB_FILE_PATH_FIELD,
    { id: 'expectedStrings', label: 'Expected Strings', type: TEXT_FIELD, required: true },
  ]),
  async run(_ctx, input) {
    const repo = String(input.repo || '').trim(); const ref = String(input.ref || '').trim(); const filePath = String(input.filePath || '').trim()
    const expected = lines(input.expectedStrings)
    const branchResult = await githubJSON(`/repos/${repo}/branches/${encodeURIComponent(ref)}`)
    const commitSha = branchResult.ok ? branchResult.json?.commit?.sha || null : null
    const r = await githubJSON(`/repos/${repo}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`)
    if (!r.ok) return { ok: true, message: `Codex verification: NOT verified — file not found at ${filePath} on ${ref}.`, data: { repo, ref, filePath, fileFound: false, foundStrings: [], missingStrings: expected, matched: [], missing: expected, commitSha, passed: false, directExecution: false } }
    const content = Buffer.from(String(r.json?.content || ''), 'base64').toString('utf8')
    const matched = expected.filter(s => content.includes(s))
    const missing = expected.filter(s => !content.includes(s))
    const passed = missing.length === 0
    return { ok: true, message: `Codex verification: ${passed ? 'verified' : 'NOT verified'} — ${matched.length}/${expected.length} expected string${expected.length === 1 ? '' : 's'} found.`, data: { repo, ref, filePath, foundStrings: matched, missingStrings: missing, matched, missing, commitSha, passed, fileFound: true, directExecution: false } }
  },
})
