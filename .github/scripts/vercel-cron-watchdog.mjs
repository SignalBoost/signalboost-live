import process from 'node:process'

const API = 'https://api.vercel.com'
const token = String(process.env.VERCEL_TOKEN || '').trim()
const projectId = String(process.env.VERCEL_PROJECT_ID || '').trim()
const teamId = String(process.env.VERCEL_TEAM_ID || '').trim()
const productionBaseUrl = String(process.env.SIGNALBOOST_PRODUCTION_URL || 'https://itmounts.com').replace(/\/+$/, '')
const waitBudgetMs = Math.min(Math.max(Number(process.env.WATCHDOG_REPAIR_WAIT_MS || 480000), 60000), 600000)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const teamQuery = () => teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
const withTeam = (path) => `${API}${path}${path.includes('?') ? '&' : '?'}${teamId ? `teamId=${encodeURIComponent(teamId)}` : ''}`.replace(/[?&]$/, '')

function requireConfig() {
  if (!token) throw new Error('VERCEL_TOKEN is required')
  if (!projectId) throw new Error('VERCEL_PROJECT_ID is required')
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  const text = await response.text()
  let body = {}
  try { body = text ? JSON.parse(text) : {} } catch { body = { text: text.slice(0, 500) } }
  if (!response.ok) {
    const message = body?.error?.message || body?.message || body?.text || `HTTP ${response.status}`
    throw new Error(`${response.status} ${response.statusText}: ${String(message).slice(0, 500)}`)
  }
  return body
}

async function readProject() {
  return requestJson(withTeam(`/v9/projects/${encodeURIComponent(projectId)}`))
}

function cronState(project) {
  const definitions = Array.isArray(project?.crons?.definitions) ? project.crons.definitions : []
  return {
    disabled: Boolean(project?.crons?.disabledAt),
    disabledAt: project?.crons?.disabledAt ?? null,
    enabledAt: project?.crons?.enabledAt ?? null,
    definitions: definitions.length,
    paused: project?.paused === true,
    live: project?.live !== false,
  }
}

function cronHealthy(project) {
  const state = cronState(project)
  return !state.disabled && state.definitions > 0 && !state.paused
}

async function latestProductionDeployment() {
  const query = new URLSearchParams({ projectId, target: 'production', limit: '1' })
  if (teamId) query.set('teamId', teamId)
  const page = await requestJson(`${API}/v6/deployments?${query.toString()}`)
  const latest = Array.isArray(page?.deployments) ? page.deployments[0] : null
  if (!latest?.uid) throw new Error('No prior production deployment is available for cron recovery')
  return latest
}

async function triggerProductionRedeploy() {
  const latest = await latestProductionDeployment()
  const url = `${API}/v13/deployments${teamQuery()}`
  const created = await requestJson(url, {
    method: 'POST',
    body: JSON.stringify({
      name: latest.name || 'signalboost-live',
      project: projectId,
      target: 'production',
      deploymentId: latest.uid,
      meta: {
        redeployReason: 'external-self-healing-cron-watchdog',
        recoveryClass: 'vercel-cron-control-plane',
      },
    }),
  })
  const id = String(created?.id || created?.uid || '').trim()
  if (!id) throw new Error('Vercel accepted the recovery redeploy without returning a deployment id')
  console.log(`Triggered production cron recovery redeploy ${id}`)
  return id
}

function targetIncludesProduction(target) {
  if (Array.isArray(target)) return target.includes('production')
  return target === 'production' || target == null
}

function extractSecretValue(row) {
  for (const candidate of [row?.value, row?.decryptedValue, row?.plainValue]) {
    if (typeof candidate === 'string' && candidate.length) return candidate
  }
  return ''
}

async function resolveCronSecret() {
  const provided = String(process.env.CRON_SECRET || '').trim()
  if (provided) {
    console.log(`::add-mask::${provided}`)
    return provided
  }

  const data = await requestJson(withTeam(`/v9/projects/${encodeURIComponent(projectId)}/env?decrypt=true`))
  const rows = Array.isArray(data?.envs) ? data.envs : (Array.isArray(data) ? data : [])
  const matching = rows
    .filter(row => row?.key === 'CRON_SECRET' && targetIncludesProduction(row?.target))
    .sort((a, b) => Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0))
  const value = extractSecretValue(matching[0])
  if (!value) throw new Error('CRON_SECRET could not be resolved from the Vercel production environment')
  console.log(`::add-mask::${value}`)
  return value
}

async function wakeCriticalControlLoops() {
  let secret
  try {
    secret = await resolveCronSecret()
  } catch (error) {
    console.warn(`Critical-route fallback unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return { attempted: false, results: [] }
  }

  const paths = [
    '/api/cron/native-proactive-monitoring',
    '/api/cron/cos-university-distillation-supervisor',
    '/api/cron/cos-university-mass-distillation',
  ]
  const results = []
  for (const path of paths) {
    try {
      const response = await fetch(`${productionBaseUrl}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${secret}`, 'User-Agent': 'SignalBoost-External-Cron-Watchdog/1.0' },
        cache: 'no-store',
        signal: AbortSignal.timeout(290000),
      })
      results.push({ path, status: response.status })
      try { await response.body?.cancel() } catch {}
      console.log(`Fallback wake ${path}: HTTP ${response.status}`)
    } catch (error) {
      results.push({ path, status: 0 })
      console.warn(`Fallback wake ${path} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { attempted: true, results }
}

async function waitForCronRecovery() {
  const deadline = Date.now() + waitBudgetMs
  let last = null
  while (Date.now() < deadline) {
    await sleep(15000)
    const project = await readProject()
    last = cronState(project)
    if (cronHealthy(project)) return { recovered: true, state: last }
    console.log(`Waiting for cron recovery: disabled=${last.disabled} definitions=${last.definitions} paused=${last.paused}`)
  }
  return { recovered: false, state: last }
}

async function main() {
  requireConfig()
  const project = await readProject()
  const initial = cronState(project)

  console.log(`Vercel cron state: disabled=${initial.disabled} definitions=${initial.definitions} paused=${initial.paused} live=${initial.live}`)
  if (cronHealthy(project)) {
    console.log('External watchdog: cron control plane is healthy; no action required.')
    return
  }

  if (initial.paused) {
    throw new Error('Project is paused. The watchdog will not override an intentional project pause.')
  }

  console.error(`::error title=Vercel cron control-plane failure::Cron Jobs are unavailable (disabled=${initial.disabled}, definitions=${initial.definitions}). Starting independent recovery.`)

  // This watchdog has no disable operation. Its only Vercel mutation is an exact production redeploy,
  // which causes Vercel to re-register the repository-declared cron definitions.
  await triggerProductionRedeploy()

  // Do not wait for Vercel's scheduler to return before waking the two Self-Healing layers and the
  // University worker. This preserves a degraded control loop even if the Vercel cron switch remains off.
  await wakeCriticalControlLoops()

  const verification = await waitForCronRecovery()
  if (!verification.recovered) {
    // One final external wake keeps repair/University logic alive while GitHub marks this run failed
    // so the control-plane outage remains visible and the next independent scheduled run retries.
    await wakeCriticalControlLoops()
    throw new Error(`Vercel Cron Jobs did not recover within ${Math.round(waitBudgetMs / 1000)} seconds after redeploy`)
  }

  console.log(`::notice title=Vercel cron control plane recovered::Cron Jobs are enabled with ${verification.state?.definitions ?? 0} registered definitions.`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
