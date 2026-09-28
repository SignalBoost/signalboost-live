// .github/scripts/vercel-promote-main.mjs
//
// Owner direction 2026-09-28: "push the production". Production had stayed on commit 87fd626 for ~19 hours while
// 23 merges landed on main, so no fix could run. This script makes production follow main without a dashboard click:
//   1. prints the project's current production deployment and the latest deployments (state, commit, target) plus the
//      error of the newest failed main build, so the cause is visible in the Actions run summary;
//   2. promotes the newest READY production-target build of main when it is newer than what production serves;
//   3. waits (bounded) for the build of MAIN_SHA and promotes it too when it becomes READY;
//   4. writes `fallback=deploy` to GITHUB_OUTPUT when Vercel produced no build for main at all, so the workflow can
//      build and deploy the checkout directly.
// Its only Vercel mutation is promoting an existing READY build of main. It never prints the token or env values.
import process from 'node:process'
import { appendFileSync } from 'node:fs'

const API = 'https://api.vercel.com'
const token = String(process.env.VERCEL_TOKEN || '').trim()
const projectId = String(process.env.VERCEL_PROJECT_ID || '').trim()
const teamId = String(process.env.VERCEL_TEAM_ID || '').trim()
const mainSha = String(process.env.MAIN_SHA || '').trim()
const headWaitMs = Math.min(Math.max(Number(process.env.HEAD_WAIT_MS || 900000), 0), 1200000)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const withTeam = (path) => `${API}${path}${path.includes('?') ? '&' : '?'}${teamId ? `teamId=${encodeURIComponent(teamId)}` : ''}`.replace(/[?&]$/, '')
const short = (sha) => String(sha || '').slice(0, 7) || '-'
const when = (ms) => (Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '-')

function summary(line) {
  console.log(line)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`)
}

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  const text = await response.text()
  let body = {}
  try { body = text ? JSON.parse(text) : {} } catch { body = { text: text.slice(0, 500) } }
  if (!response.ok) {
    const message = body?.error?.message || body?.message || body?.text || `HTTP ${response.status}`
    throw new Error(`${response.status}: ${String(message).slice(0, 400)}`)
  }
  return body
}

const stateOf = (d) => String(d?.state || d?.readyState || '').toUpperCase()
const shaOf = (d) => String(d?.meta?.githubCommitSha || '')
const refOf = (d) => String(d?.meta?.githubCommitRef || '')
const createdOf = (d) => Number(d?.created || d?.createdAt || 0)
const idOf = (d) => String(d?.uid || d?.id || '')

async function listDeployments(limit = 40) {
  const query = new URLSearchParams({ projectId, limit: String(limit) })
  if (teamId) query.set('teamId', teamId)
  const page = await requestJson(`${API}/v6/deployments?${query.toString()}`)
  return Array.isArray(page?.deployments) ? page.deployments : []
}

async function currentProduction(deployments) {
  const project = await requestJson(withTeam(`/v9/projects/${encodeURIComponent(projectId)}`))
  const target = project?.targets?.production || null
  if (target && (target.id || target.uid)) {
    return { id: idOf(target), sha: shaOf(target), created: createdOf(target), source: 'project.targets.production' }
  }
  const newest = deployments.find(d => d?.target === 'production' && stateOf(d) === 'READY')
  return newest ? { id: idOf(newest), sha: shaOf(newest), created: createdOf(newest), source: 'newest READY production deployment' } : null
}

async function buildError(deployment) {
  try {
    const detail = await requestJson(withTeam(`/v13/deployments/${encodeURIComponent(idOf(deployment))}`))
    const parts = [detail?.errorCode, detail?.errorMessage].filter(Boolean).map(value => String(value).slice(0, 300))
    return parts.join(' | ') || 'no error message recorded'
  } catch (error) {
    return `could not read: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function promote(deployment, reason) {
  summary(`- Promoting \`${short(shaOf(deployment))}\` (${idOf(deployment)}) to production: ${reason}`)
  await requestJson(withTeam(`/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(idOf(deployment))}`), { method: 'POST' })
  const deadline = Date.now() + 300000
  while (Date.now() < deadline) {
    await sleep(10000)
    const live = await currentProduction(await listDeployments(20)).catch(() => null)
    if (live?.id === idOf(deployment)) {
      summary(`- Production now serves \`${short(shaOf(deployment))}\`.`)
      return true
    }
  }
  summary(`- Promotion of \`${short(shaOf(deployment))}\` was accepted but production had not switched after 5 minutes.`)
  return false
}

async function main() {
  if (!token) throw new Error('VERCEL_TOKEN secret is not available to this workflow')
  if (!projectId) throw new Error('VERCEL_PROJECT_ID is required')

  const deployments = await listDeployments()
  const production = await currentProduction(deployments)
  summary('## Vercel production vs main')
  summary(`- Production serves \`${short(production?.sha)}\` (${production?.id || 'unknown'}, created ${when(production?.created)}, from ${production?.source || 'n/a'}).`)
  summary(`- main is at \`${short(mainSha)}\`.`)
  summary('')
  summary('| created | state | target | ref | commit |')
  summary('|---|---|---|---|---|')
  for (const d of deployments.slice(0, 15)) {
    summary(`| ${when(createdOf(d))} | ${stateOf(d)} | ${d?.target || 'preview'} | ${refOf(d) || '-'} | \`${short(shaOf(d))}\` ${String(d?.meta?.githubCommitMessage || '').split('\n')[0].slice(0, 60)} |`)
  }
  summary('')

  const mainBuilds = deployments.filter(d => refOf(d) === 'main' && d?.target === 'production')
  const newestFailed = mainBuilds.find(d => stateOf(d) === 'ERROR')
  if (newestFailed) summary(`- Newest failed main build \`${short(shaOf(newestFailed))}\`: ${await buildError(newestFailed)}`)

  if (!mainBuilds.length) {
    summary('- Vercel has no production build of main at all in its recent deployments; building the checkout directly.')
    output('fallback', 'deploy')
    return
  }

  // 1. Newest READY build of main, if newer than what production serves.
  const newestReady = mainBuilds.find(d => stateOf(d) === 'READY')
  if (newestReady && idOf(newestReady) !== production?.id && createdOf(newestReady) > Number(production?.created || 0)) {
    await promote(newestReady, 'newest successful build of main is newer than production')
  } else if (newestReady) {
    summary(`- Newest successful main build \`${short(shaOf(newestReady))}\` is already production or older than it.`)
  } else {
    summary('- No successful production build of main exists in the recent deployments.')
  }

  // 2. The build of MAIN_SHA (usually still building when this runs on a push).
  if (!mainSha) return
  const deadline = Date.now() + headWaitMs
  while (true) {
    const head = (await listDeployments(40)).find(d => shaOf(d) === mainSha && refOf(d) === 'main' && d?.target === 'production')
    const state = stateOf(head)
    if (head && state === 'READY') {
      const live = await currentProduction(await listDeployments(20))
      if (live?.id !== idOf(head)) await promote(head, 'the build of the merged commit is ready')
      else summary(`- The merged commit \`${short(mainSha)}\` is already live.`)
      return
    }
    if (head && (state === 'ERROR' || state === 'CANCELED')) {
      summary(`- The build of the merged commit \`${short(mainSha)}\` ended ${state}: ${await buildError(head)}`)
      process.exitCode = 1
      return
    }
    if (Date.now() >= deadline) {
      if (!head) {
        summary(`- Vercel never started a build for \`${short(mainSha)}\`; building the checkout directly.`)
        output('fallback', 'deploy')
      } else {
        summary(`- The build of \`${short(mainSha)}\` is still ${state || 'pending'} after ${Math.round(headWaitMs / 60000)} minutes.`)
        process.exitCode = 1
      }
      return
    }
    await sleep(20000)
  }
}

main().catch(error => {
  summary(`- Failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
