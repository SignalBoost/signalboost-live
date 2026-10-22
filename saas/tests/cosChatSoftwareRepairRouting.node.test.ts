// saas/tests/cosChatSoftwareRepairRouting.node.test.ts
//
// Production 2026-10-21: a plain-language request to fix software never left chat. "Fix the Failed to fetch error on
// the Builder page" was run as a text edit; "my login form does not submit, can you fix it?" got a canned answer.
// A repair request now reaches the Software Specialist on every chat surface: the owner's becomes a platform repair at
// the deployed revision (fix, test, commit, merge), anyone else's continues their project or is asked for the code.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isSoftwareRepairRequest, repairAwaitingSource } from '../lib/ai/cos/softwareRepairIntent.ts'
import { isFastTextTransform } from '../lib/ai/cos/fastTextTransformIntent.ts'
import { SUPPORTED_LANGUAGES } from '../lib/i18n/supportedLanguages.ts'
import { isConciergeBuilderObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

const REPAIRS = [
  'Fix the Failed to fetch error on the Builder page',
  'The Run Builder button on /dashboard/developer shows Failed to fetch, debug and fix it',
  'my login form does not submit, can you fix it?',
  'Fix the bug in my calculator: sum returns 23 for 2 and 3',
  'the checkout page crashes when I click pay',
  'my website is broken after the last deploy',
  'debug why the cron job fails every night',
  'can you repair the upload feature, it throws an error',
  'the dashboard does not load',
]
// The owner's real edit requests from the same chat, plus prose repairs and non-software problems.
const NOT_REPAIRS = [
  'edit - i have voted for Trump three times and i would vote for him a foruth time if he could run again.',
  'edit  - Hi Ryland,  how can I get SCRY added to my phone? Would you have some time we culd meet before my trip?  Thank you',
  'edit - Hi AskISSO, as rover i travel to many post and i have the opportunity to visit many ACC in these post',
  'edit  - Hi Tim,\n\nI am filling up the DS 7100 form for my coming request leave in January 27, can you please confirm how many hours of COMP Time I have, thank you.',
  'fix the grammar: me and him goes to the store',
  'fix my email to the landlord',
  'correct this paragraph about our product',
  'fix the typos in: The login button doesnt work so we will reschedule',
  'what is a 502 error?',
  'my car does not start in the morning',
  'how do I fix a leaking faucet',
  'write a LinkedIn post about our new dashboard',
  'translate: the page is broken',
]

test('a plain-language software repair is recognized; edits, prose fixes and non-software problems are not', () => {
  for (const prompt of REPAIRS) assert.equal(isSoftwareRepairRequest(prompt), true, prompt)
  for (const prompt of NOT_REPAIRS) assert.equal(isSoftwareRepairRequest(prompt), false, prompt)
})

test('"Fix the …" software requests are never taken by the fast text-edit lane; real edits still are', () => {
  for (const prompt of REPAIRS) assert.equal(isFastTextTransform(prompt), false, prompt)
  assert.equal(isFastTextTransform('edit  - Hi Ryland,  how can I get SCRY added to my phone? Would you have some time we culd meet before my trip?  Thank you'), true)
})

test('chat ingress sends a repair request to the Software Specialist before any edit, authoring or identity lane', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(route, /const ownerRepairFollowup = pendingOwnerSoftwareRepair\(messages, prompt\)/)
  assert.match(route, /const softwareRepairRequest = isSoftwareRepairRequest\(prompt\) \|\| Boolean\(ownerRepairFollowup\)\s*\n\s*const directTextTransformation = softwareRepairRequest \? null : detectDirectTextTransformation\(prompt\)/)
  assert.match(route, /isAuthoringObjectiveWithoutLiveLookup\(prompt\)\s*\n\s*&& !softwareRepairRequest/)
  assert.match(route, /browserSurface === 'concierge' && !softwareRepairRequest && !isConciergeBuilderObjective/)
  assert.match(route, /shouldConsultSoftwareSpecialist = hasSourceAttachment \|\| explicitOperationalRepair\s*\n\s*\|\| softwareRepairRequest/)
})

test('the specialist repairs the platform for the owner and asks everyone else for the code, never a dead end', () => {
  const specialist = readFileSync(new URL('../lib/ai/cos/softwareSpecialist.ts', import.meta.url), 'utf8')
  const legacy = specialist.slice(specialist.indexOf('async function tryCosSoftwareSpecialistLegacy'), specialist.indexOf('export async function tryCosSoftwareSpecialist('))
  const branch = legacy.slice(legacy.indexOf('if (repairAwaitingSource(objective) && !newProject && !designMatched && !suppliedSource'), legacy.indexOf("source: 'cos-builder-source-requested'"))
  assert.ok(branch.length > 100, 'the request-for-code branch is found')
  assert.ok(legacy.indexOf('const project = await selectBuilderProject(') < legacy.indexOf('if (repairAwaitingSource(objective)'), 'an existing project is continued, not replaced')
  assert.match(branch, /!project\.context/)
  assert.match(branch, /input\.allowRepositoryRepair && access\?\.isOwner && access\.userId/)
  assert.match(branch, /signalBoostDeployedRepairTarget\(rawObjective, \{[\s\S]*?\}, \{ ownerRepairWithoutSource: true \}\)/)
  assert.match(branch, /return enqueueRepositoryRepair\(/)
  assert.match(branch, /SOURCE_REQUEST_REPLY\[resolveResponseLanguage\(rawObjective, input\.body\?\.context\?\.language\)\]/)
  const table = specialist.slice(specialist.indexOf('const SOURCE_REQUEST_REPLY'), specialist.indexOf('function runningReply'))
  for (const language of SUPPORTED_LANGUAGES) assert.match(table, new RegExp(`\\n  ${language}: '[^']{40,}`), language)
  assert.match(specialist, /const specialistRelevant = sourceAttached\s*\n\s*\|\| mediaAttached\s*\n\s*\|\| isSoftwareRepairRequest\(objective\)/)
})

test('a conversation with a recorded project is continued by Builder V2 instead of refused (PR #4719 parity)', () => {
  const specialist = readFileSync(new URL('../lib/ai/cos/softwareSpecialist.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(specialist, /if \(project\.context \|\| selectionBody\?\.workspaceId\)/)
  assert.match(specialist, /if \(!project\.context && selectionBody\?\.workspaceId\)/)
  assert.match(specialist, /\.\.\.\(project\.context && !stagedFiles\.length \? \{ requiresExistingSource: true \} : \{\}\)/)
})

test('the acceptance spec is a Builder build, not a repair waiting for code', () => {
  const spec = readFileSync(new URL('./builderTitledSpecificationRouting.node.test.ts', import.meta.url), 'utf8')
  const objective = JSON.parse(spec.slice(spec.indexOf('const spec = ') + 'const spec = '.length, spec.indexOf('\nconst conversationId')))
  assert.equal(isSoftwareRepairRequest(objective), true, 'it does read as a repair')
  assert.equal(isConciergeBuilderObjective(objective, { attachmentNames: [] }), true, 'so Builder must take it before the request-for-code branch')
})

// Codex on #4734: naming a file or a language is not the file.
test('a repair of absent code asks for it; a build or inline code goes to Builder', () => {
  for (const prompt of [
    'Fix the bug in checkout.ts',
    'Debug my Python script, it crashes on startup',
    'my login form does not submit, can you fix it?',
    'Fix the Failed to fetch error on the Builder page',
    // Codex on #4736: a build word describing the problem is not an instruction to build.
    'Fix my app: users cannot create an account',
    'Fix the build error in my app',
  ]) assert.equal(repairAwaitingSource(prompt), true, prompt)
  const spec = readFileSync(new URL('./builderTitledSpecificationRouting.node.test.ts', import.meta.url), 'utf8')
  const objective = JSON.parse(spec.slice(spec.indexOf('const spec = ') + 'const spec = '.length, spec.indexOf('\nconst conversationId')))
  for (const prompt of [
    objective,
    'Create a Node.js script that adds two numbers, run it and fix any bugs',
    'debug this:\nfunction add(a, b) {\n  return a - b\n}',
    // Codex on #4736: a snippet too small for the paste detector is still the code.
    'Debug this Python script:\nx = [1, 2]\nprint(x[2])',
    'Can you build me a todo app and fix any failing tests?',
  ]) assert.equal(repairAwaitingSource(prompt), false, prompt.slice(0, 60))
})

test('authenticated platform owner receives an explicit repository routing blocker, not an upload request', () => {
  const specialist = readFileSync(new URL('../lib/ai/cos/softwareSpecialist.ts', import.meta.url), 'utf8')
  const ownerBranch = specialist.indexOf('if (access?.isOwner && access.userId) return NextResponse.json({')
  const genericFallback = specialist.indexOf('reply: SOURCE_REQUEST_REPLY[resolveResponseLanguage')
  assert.ok(ownerBranch > 0 && genericFallback > ownerBranch)
  assert.match(specialist, /source: 'cos-builder-repository-routing-blocked'/)
  assert.match(specialist, /Repository repair was not authorized on this COS route/)
  assert.match(specialist, /The repository repair target could not be established/)
  assert.match(specialist, /execution_allowed: false/)
})

// Production 2026-10-22: the owner pasted the failed Vercel log of a52675a with no request. It read as a repair
// request ("failed", "Error", "build"), so chat started a new-project Builder job in an empty workspace with the log
// as its specification: 1 list_files receipt, 17 model calls, builder_v2_continuation_no_progress.
const PASTED_VERCEL_FAILURE = [
  '14:31:05.498 Running build in Washington, D.C., USA (East) – iad1',
  '14:31:05.499 Build machine configuration: 30 cores, 60 GB (Turbo Build Machine)',
  '14:31:05.582 Cloning github.com/SignalBoost/signalboost-live (Branch: main, Commit: a52675a)',
  '14:31:07.301 Cloning completed: 1.719s',
  '14:31:08.321 Restored build cache from previous deployment (5cA4qFnAeabV42NyboimbFrnjuqw)',
  '14:31:08.558 Running "if [ "$VERCEL_ENV" = "production" ]; then npm run build:production; else npm run build; fi"',
  '14:33:10.100 ✖ failed host test preloads source and stops repeated read-only repair loops (28.9ms)',
  '14:33:10.103 ℹ fail 2',
  '14:33:10.200 Error: Command "npm run build:production" exited with 1',
].join('\n')

test('a pasted log with no request is evidence for diagnosis, never a repair request or an empty build', () => {
  assert.equal(isSoftwareRepairRequest(PASTED_VERCEL_FAILURE), false)
  assert.equal(repairAwaitingSource(PASTED_VERCEL_FAILURE), false)
  assert.equal(isConciergeBuilderObjective(PASTED_VERCEL_FAILURE, {}), false)
  // Asking for the repair still is one, with or without the log.
  assert.equal(isSoftwareRepairRequest(`Fix this build failure:\n${PASTED_VERCEL_FAILURE}`), true)
  assert.equal(isSoftwareRepairRequest('the build fails on main, fix it'), true)
  // Codex on #4815: the person's own words around the log decide, not only the narrow log-repair phrasing.
  for (const request of ['Fix my app:', 'debug my Python script', 'resolve the build failure', 'my website is broken after the last deploy']) {
    assert.equal(isSoftwareRepairRequest(`${request}\n${PASTED_VERCEL_FAILURE}`), true, request)
    assert.equal(isSoftwareRepairRequest(`${PASTED_VERCEL_FAILURE}\n${request}`), true, request)
  }
  assert.equal(isSoftwareRepairRequest(`here is the log\n${PASTED_VERCEL_FAILURE}`), false)
  // With no repair request the browser ingress answers with the diagnosis and its repair offer.
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.ok(route.indexOf('if (softwareSpecialist)') < route.indexOf('if (operationalEvidence && !hasSourceAttachment)'))
})
