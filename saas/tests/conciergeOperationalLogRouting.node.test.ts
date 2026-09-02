import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isOperationalLogEvidence } from '../lib/ai/cos/pastedOperationalLog.ts'
import { isProvenanceIntrospection } from '../lib/ai/cos/provenanceIntrospection.ts'

const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')

test('browser ingress sends passive pasted build logs to COS without granting Builder authority', () => {
  const repair = route.indexOf('const explicitOperationalRepair =')
  assert.ok(repair >= 0)
  assert.doesNotMatch(route, /if \(pastedOperationalLog && !hasSourceAttachment\)/)
  assert.match(route, /Passive logs carry evidence but no execution authority/)
  assert.match(route, /isConciergeBuilderObjective\(operationalPrompt, routingContext\) \? legacyConciergePost\(routedRequest\) : cosPrimaryPost\(routedRequest\)/)
})

test('standalone immediately preceding debug intent carries into the next pasted log turn', () => {
  assert.match(route, /hasExplicitOperationalLogRepairIntent/)
  assert.match(route, /const previousUser = userMessages\.at\(-2\)/)
  assert.match(route, /const previousUserPrompt = typeof previousUser\?\.content === 'string' \? previousUser\.content : ''/)
  assert.match(route, /isExplicitOperationalLogRepairRequest\(operationalPrompt\)[\s\S]{0,160}pastedOperationalLog && hasExplicitOperationalLogRepairIntent\(previousUserPrompt\)/)
  assert.doesNotMatch(route, /pastedOperationalLog && isExplicitOperationalLogRepairRequest\(previousUserPrompt\)/)
  const repair = route.indexOf('if (explicitOperationalRepair && !hasSourceAttachment)')
  assert.ok(repair >= 0)
})

test('Full Assistant browser requests enter the same Concierge browser ingress before A2A routing', () => {
  const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
  const fullAssistant = proxy.indexOf("pathname === '/api/cos-primary' && req.method === 'POST' && isFullAssistantBrowserRequest(req)")
  const browserRewrite = proxy.indexOf("cosBrowserUrl.pathname = '/api/cos-browser'", fullAssistant)
  const specialist = proxy.indexOf("specialistUrl.pathname = '/api/cos-specialist'", browserRewrite)
  assert.ok(fullAssistant >= 0)
  assert.ok(browserRewrite > fullAssistant)
  assert.ok(specialist > browserRewrite)
  assert.match(proxy, /url\.origin === req\.nextUrl\.origin && url\.pathname\.startsWith\('\/dashboard\/assistant'\)/)
})

test('explicit failed SignalBoost log repair may reach only the owner-only pinned repository lane', () => {
  const explicitRepair = route.indexOf('if (explicitOperationalRepair && !hasSourceAttachment)')
  const parse = route.indexOf('parseSignalBoostRepositoryRepairTarget(operationalPrompt)', explicitRepair)
  const owner = route.indexOf('access?.isOwner', parse)
  const execute = route.indexOf('enqueueSignalBoostRepositoryRepairJob({', owner)
  const schedule = route.indexOf('runBuilderJob(job.jobId', execute)
  const publicScope = route.indexOf('withPublicDeliveryScope', execute)
  assert.ok(explicitRepair >= 0)
  assert.ok(parse > explicitRepair)
  assert.ok(owner > parse)
  assert.ok(execute > owner)
  assert.ok(schedule > execute)
  assert.ok(publicScope > schedule)
  assert.match(route.slice(execute, publicScope), /status: 'queued'/)
})

test('only failed owner SignalBoost logs reach Platform Engineer before passive analysis', () => {
  const classification = route.indexOf('const operationalEvidence = isOperationalLogEvidence(operationalPrompt)')
  const analysis = route.indexOf('const operationalLogAnalysis = analyzeOperationalLog(operationalPrompt)', classification)
  const exactTarget = route.indexOf('const exactFailedLogTarget = operationalLogAnalysis.failed', analysis)
  const projectBinding = route.indexOf('const signalBoostProjectBound =', exactTarget)
  const target = route.indexOf('const ownerSignalBoostLogTarget =', projectBinding)
  const owner = route.indexOf('access?.isOwner', target)
  const evidence = route.indexOf('operationalEvidence', owner)
  const failed = route.indexOf('operationalLogAnalysis.failed', evidence)
  const binding = route.indexOf('signalBoostProjectBound', failed)
  const preferExact = route.indexOf('exactFailedLogTarget ?? signalBoostDeployedRepairTarget', binding)
  const execute = route.indexOf('enqueueSignalBoostRepositoryRepairJob({', binding)
  const schedule = route.indexOf('runBuilderJob(job.jobId', execute)
  assert.ok(classification >= 0 && analysis > classification && exactTarget > analysis && projectBinding > exactTarget && target > projectBinding)
  assert.ok(owner > target && evidence > owner && failed > evidence && binding > failed)
  assert.ok(preferExact > binding && execute > preferExact && schedule > execute)
  assert.match(route.slice(exactTarget, projectBinding), /parseSignalBoostRepositoryRepairTarget\(operationalPrompt\)/)
  assert.match(route.slice(projectBinding, target), /SIGNALBOOST_OPERATIONAL_TARGET\.test\(operationalPrompt\) \|\| isSignalBoostDeploymentContext\(req\)/)
  assert.match(route.slice(target), /commitSha: process\.env\.VERCEL_GIT_COMMIT_SHA/)
  assert.match(route.slice(target), /target: ownerSignalBoostLogTarget/)
  assert.match(route.slice(target), /status: 'queued'/)
})

test('clipped failed owner log can bind only to the current SignalBoost deployment', () => {
  assert.match(route, /function isSignalBoostDeploymentContext\(req: NextRequest\)/)
  assert.match(route, /const projectUrl = String\(process\.env\.VERCEL_PROJECT_PRODUCTION_URL \|\| ''\)/)
  assert.match(route, /const requestHost = String\(req\.headers\.get\('host'\) \|\| ''\)/)
  assert.match(route, /return projectUrl === 'saas\.signalboostapp\.com' \|\| requestHost === 'saas\.signalboostapp\.com'/)
  assert.match(route, /signalBoostDeployedRepairTarget\(operationalPrompt,/)
})

test('source-attached log repairs still hand off to the ordinary Concierge Builder lane', () => {
  assert.match(route, /if \(explicitOperationalRepair && !hasSourceAttachment\)/)
  assert.match(route, /isConciergeBuilderObjective\(operationalPrompt, routingContext\) \? legacyConciergePost\(routedRequest\) : cosPrimaryPost\(routedRequest\)/)
})

test('attached text logs join the user request before Concierge diagnosis without becoming a visual or artifact objective', () => {
  assert.match(route, /readAttachedOperationalEvidence\(body\?\.attachments\)/)
  assert.match(route, /const operationalPrompt = attachedOperationalEvidence/)
  assert.match(route, /messages: messages\.map\([\s\S]{0,180}content: operationalPrompt/)
  assert.match(route, /routedHeaders\.delete\('content-length'\)/)
  assert.match(route, /if \(!operationalEvidence\) \{[\s\S]*isConciergeArtifactObjective\(prompt\)[\s\S]*isConciergeVisualObjective\(prompt\)/)
})

test('artifact and provenance trigger words inside a failed build remain operational evidence', () => {
  const log = [
    '10:12:16.287 ✖ create PDF with technical provenance',
    '10:12:16.302 Error: Command "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build" exited with 1',
  ].join('\n')
  assert.equal(isOperationalLogEvidence(log), true)
  assert.equal(isProvenanceIntrospection(log), false)

  const creativeGate = route.indexOf('if (!operationalEvidence) {')
  const artifact = route.indexOf('isConciergeArtifactObjective(prompt)', creativeGate)
  const visual = route.indexOf('isConciergeVisualObjective(prompt)', artifact)
  const provenance = route.indexOf('if (!operationalEvidence && isProvenanceIntrospection(prompt))', visual)
  assert.ok(creativeGate >= 0 && artifact > creativeGate && visual > artifact && provenance > visual)

  const artifactRoute = readFileSync(new URL('../app/api/artifacts/route.ts', import.meta.url), 'utf8')
  const backendGuard = artifactRoute.indexOf('if (isOperationalLogEvidence(rawObjective))')
  const objectiveValidation = artifactRoute.indexOf('const objective = objectiveOf(rawObjective)', backendGuard)
  const generation = artifactRoute.indexOf('createPlatformAiPort().generate', objectiveValidation)
  assert.ok(backendGuard >= 0 && objectiveValidation > backendGuard && generation > objectiveValidation)
  assert.match(artifactRoute.slice(backendGuard, objectiveValidation), /operationalLogReply\(rawObjective\)/)
})

test('the operational creative-routing regression remains in the mandatory Vercel gate', () => {
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  assert.match(gate, /tests\/conciergeOperationalLogRouting\.node\.test\.ts/)
})

test('legacy Concierge sends passive logs to COS instead of returning the obsolete canned reply', () => {
  const legacy = readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(legacy, /isPastedOperationalLog\(objective\)/)
  assert.doesNotMatch(legacy, /source: 'concierge-operational-log-analysis'/)
  assert.match(legacy, /const primaryRun = await boundedPrimary\(req\)/)
})
