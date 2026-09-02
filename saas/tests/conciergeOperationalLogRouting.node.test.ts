import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isOperationalLogEvidence } from '../lib/ai/cos/pastedOperationalLog.ts'
import { isConciergeVisualObjective } from '../lib/visuals/intent.ts'

test('browser ingress sends passive pasted build logs to COS without granting Builder authority', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const repair = route.indexOf('const explicitOperationalRepair =')
  assert.ok(repair >= 0)
  assert.doesNotMatch(route, /if \(pastedOperationalLog && !hasSourceAttachment\)/)
  assert.match(route, /Passive logs carry evidence but no execution authority/)
  assert.match(route, /isConciergeBuilderObjective\(operationalPrompt, routingContext\) \? legacyConciergePost\(routedRequest\) : cosPrimaryPost\(routedRequest\)/)
})

test('standalone immediately preceding debug intent carries into the next pasted log turn', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
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
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
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
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const analysis = route.indexOf('const operationalLogAnalysis = analyzeOperationalLog(operationalPrompt)')
  const exactTarget = route.indexOf('const exactFailedLogTarget = operationalLogAnalysis.failed', analysis)
  const target = route.indexOf('const ownerSignalBoostLogTarget =')
  const owner = route.indexOf('access?.isOwner', target)
  const evidence = route.indexOf('isOperationalLogEvidence(operationalPrompt)', owner)
  const failed = route.indexOf('operationalLogAnalysis.failed', evidence)
  const binding = route.indexOf('SIGNALBOOST_OPERATIONAL_TARGET.test(operationalPrompt)', failed)
  const preferExact = route.indexOf('exactFailedLogTarget ?? signalBoostDeployedRepairTarget', binding)
  const execute = route.indexOf('enqueueSignalBoostRepositoryRepairJob({', binding)
  const schedule = route.indexOf('runBuilderJob(job.jobId', execute)
  assert.ok(analysis >= 0 && exactTarget > analysis && target > exactTarget)
  assert.ok(owner > target && evidence > owner && failed > evidence && binding > failed)
  assert.ok(preferExact > binding && execute > preferExact && schedule > execute)
  assert.match(route.slice(exactTarget, target), /parseSignalBoostRepositoryRepairTarget\(operationalPrompt\)/)
  assert.match(route.slice(target), /commitSha: process\.env\.VERCEL_GIT_COMMIT_SHA/)
  assert.match(route.slice(target), /target: ownerSignalBoostLogTarget/)
  assert.match(route.slice(target), /status: 'queued'/)
})

test('source-attached log repairs still hand off to the ordinary Concierge Builder lane', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(route, /if \(explicitOperationalRepair && !hasSourceAttachment\)/)
  assert.match(route, /isConciergeBuilderObjective\(operationalPrompt, routingContext\) \? legacyConciergePost\(routedRequest\) : cosPrimaryPost\(routedRequest\)/)
})

test('attached text logs join the user request before Concierge diagnosis without becoming a visual or artifact objective', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(route, /readAttachedOperationalEvidence\(body\?\.attachments\)/)
  assert.match(route, /const operationalPrompt = attachedOperationalEvidence/)
  assert.match(route, /messages: messages\.map\([\s\S]{0,180}content: operationalPrompt/)
  assert.match(route, /routedHeaders\.delete\('content-length'\)/)
  assert.match(route, /const creativeRoutingAllowed = !isOperationalLogEvidence\(operationalPrompt\)/)
  assert.match(route, /if \(creativeRoutingAllowed && isConciergeArtifactObjective\(prompt\)\)/)
  assert.match(route, /if \(creativeRoutingAllowed && isConciergeVisualObjective\(prompt\)\)/)
})

test('visual words inside a failed Vercel test title cannot divert the log to Wikimedia', () => {
  const log = [
    '22:56:02.374 Running build in Cleveland, USA',
    'Cloning github.com/SignalBoost/signalboost-live (Branch: main, Commit: abc1234)',
    '✖ create image with every named person only after exact reference verification',
    'Error: Command "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build" exited with 1',
  ].join('\n')
  assert.equal(isOperationalLogEvidence(log), true)
  assert.equal(isConciergeVisualObjective(log), true, 'the fixture must exercise the former routing collision')

  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const guard = route.indexOf('const creativeRoutingAllowed = !isOperationalLogEvidence(operationalPrompt)')
  const artifact = route.indexOf('creativeRoutingAllowed && isConciergeArtifactObjective(prompt)', guard)
  const visual = route.indexOf('creativeRoutingAllowed && isConciergeVisualObjective(prompt)', artifact)
  const primary = route.indexOf('cosPrimaryPost(routedRequest)', visual)
  assert.ok(guard >= 0 && artifact > guard && visual > artifact && primary > visual)
})

test('legacy Concierge sends passive logs to COS instead of returning the obsolete canned reply', () => {
  const legacy = readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(legacy, /isPastedOperationalLog\(objective\)/)
  assert.doesNotMatch(legacy, /source: 'concierge-operational-log-analysis'/)
  assert.match(legacy, /const primaryRun = await boundedPrimary\(req\)/)
})
