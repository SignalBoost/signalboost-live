// saas/tests/builderAssistanceModes.node.test.ts
//
// The owner's harness direction (2026-10-21): every user picks how much COS does — Guide me, Work with me, Handle it
// for me — and the choice is remembered. Before this change no chat could choose a mode, nothing was remembered, and
// "Work with me" only answered (in English) "switch to Handle it for me"; its proposal approval returned 409.
// Work with me now runs Builder in its sandbox, pauses before anything leaves it, and publishes on the user's "go".
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ASSISTANCE_MODES, ASSISTANCE_MODE_ARIA, ASSISTANCE_MODE_DESCRIPTION, ASSISTANCE_MODE_LABEL, COLLABORATE_APPROVAL_STARTED,
  COLLABORATE_MERGE_HELD, COLLABORATE_PUBLICATION_PAUSED, COLLABORATE_SOURCE_CHANGED, isAssistanceApproval, normalizeAssistanceMode,
} from '../lib/ai/cos/assistanceMode.ts'
import { approvalJobId, awaitingPublication, startApprovedIsolatedPublication } from '../lib/builder/collaborate-approval.ts'
import { SUPPORTED_LANGUAGES } from '../lib/i18n/supportedLanguages.ts'
import type { BuilderJobRecord } from '../lib/builder/job-store.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('every mode label, description and message exists in all 11 languages', () => {
  const copies = [ASSISTANCE_MODE_ARIA, COLLABORATE_PUBLICATION_PAUSED, COLLABORATE_APPROVAL_STARTED, COLLABORATE_SOURCE_CHANGED, COLLABORATE_MERGE_HELD,
    ...ASSISTANCE_MODES.flatMap(mode => [ASSISTANCE_MODE_LABEL[mode], ASSISTANCE_MODE_DESCRIPTION[mode]])]
  for (const copy of copies) for (const lang of SUPPORTED_LANGUAGES) assert.ok(copy[lang]?.trim(), `${lang}: ${copy.en}`)
  assert.equal(normalizeAssistanceMode('collaborate'), 'collaborate')
  assert.equal(normalizeAssistanceMode('admin'), null)
})

test('"go" is recognised in every supported language; a sentence that merely contains it is not an approval', () => {
  for (const go of ['go', 'Go ahead!', 'yes', 'adelante', 'sí', 'pode seguir', 'dalej', 'давай', 'los', 'vas-y', 'vai', '進めて', '진행해', 'تابع', '«adelante»'])
    assert.equal(isAssistanceApproval(go), true, go)
  for (const other of ['yes I think the login page is broken', 'go to the dashboard and fix the bug', 'fix the build', 'gone', ''])
    assert.equal(isAssistanceApproval(other), false, other)
})

const job = (patch: Partial<BuilderJobRecord> = {}): BuilderJobRecord => ({
  id: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333', conversationId: '44444444-4444-4444-8444-444444444444',
  objective: 'Build the Calculator API and create a new private GitHub repository', jobKind: 'standard', metadata: {},
  ownerAuthorized: true, claimGeneration: 1, checkpoint: null, status: 'succeeded', error: null, historyMessageId: null,
  createdAt: '2026-10-21T10:00:00Z', startedAt: null, finishedAt: '2026-10-21T10:02:00Z', updatedAt: '2026-10-21T10:02:00Z',
  result: { awaitingApproval: { action: 'isolated_publication', fingerprint: 'fp-1' } }, ...patch,
})
function approval(source: BuilderJobRecord | null, options: { fingerprint?: string; queued?: Set<string> } = {}) {
  const queued = options.queued ?? new Set<string>()
  const enqueued: any[] = []
  return {
    enqueued,
    run: () => startApprovedIsolatedPublication({
      userId: job().userId, conversationId: job().conversationId, responseLanguage: 'es', runningReply: 'Aprobado.',
      readLatestJob: async () => source,
      fingerprint: async () => options.fingerprint ?? 'fp-1',
      enqueue: async request => { if (queued.has(request.jobId)) throw new Error('duplicate key'); queued.add(request.jobId); enqueued.push(request) },
      jobExists: async id => queued.has(id),
    }),
  }
}

test('"go" starts one publish job bound to the paused job and the exact files it verified', async () => {
  const queued = new Set<string>()
  const first = approval(job(), { queued })
  const outcome = await first.run()
  assert.deepEqual(outcome, { kind: 'started', jobId: approvalJobId(job().id), sourceJobId: job().id, workspaceId: job().workspaceId })
  assert.match(approvalJobId(job().id), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.deepEqual(first.enqueued[0].metadata, { builderEngine: 'v2', approvedPublicationOf: job().id, approvedWorkspaceFingerprint: 'fp-1',
    assistanceMode: 'collaborate', responseLanguage: 'es' })
  assert.equal(first.enqueued[0].ownerAuthorized, true)
  assert.equal(first.enqueued[0].workspaceId, job().workspaceId)
  // A second "go" (or a resent request) finds the same job: nothing is published twice.
  const again = approval(job(), { queued })
  assert.equal((await again.run()).kind, 'started')
  assert.equal(again.enqueued.length, 0)
  assert.equal(queued.size, 1)
})

test('nothing is approved when no work is waiting, and files changed since verification refuse publication', async () => {
  assert.deepEqual(await approval(null).run(), { kind: 'none' })
  assert.deepEqual(await approval(job({ result: { status: 'succeeded' } })).run(), { kind: 'none' })
  assert.deepEqual(await approval(job({ status: 'failed' })).run(), { kind: 'none' })
  const changed = approval(job(), { fingerprint: 'fp-2' })
  assert.deepEqual(await changed.run(), { kind: 'source_changed' })
  assert.equal(changed.enqueued.length, 0)
  assert.equal(awaitingPublication(job({ result: { awaitingApproval: { action: 'merge' } } })), null)
})

test('the worker pauses Work with me before any publication and publishes after "go" only for unchanged files', () => {
  const runner = read('lib/builder/job-runner.ts')
  const lane = runner.slice(runner.indexOf('if (verified && acceptance.passed && requiresPublication) {'))
  assert.ok(lane.indexOf("if (job.metadata.assistanceMode === 'collaborate')") < lane.indexOf('await publishIsolatedJobFiles('), 'pause before publishing')
  const pause = lane.slice(0, lane.indexOf('await publishIsolatedJobFiles('))
  assert.match(pause, /awaitingApproval: \{ action: 'isolated_publication', fingerprint/)
  assert.match(pause, /COLLABORATE_PUBLICATION_PAUSED, job\.metadata\.responseLanguage/)
  const approved = runner.slice(runner.indexOf('async function runApprovedIsolatedPublication('), runner.indexOf('async function runBuilderJobInsideHarness('))
  assert.ok(approved.indexOf('readBuilderWorkspaceFingerprint(') < approved.indexOf('await publishIsolatedJobFiles('), 'files re-checked before publishing')
  assert.match(approved, /awaiting\.fingerprint !== job\.metadata\.approvedWorkspaceFingerprint/)
  assert.doesNotMatch(approved, /createBuilderCodingAiPort|BuilderV2Agent/, 'no model call')
  const dispatch = runner.slice(runner.indexOf("if (job.jobKind === 'standard' && job.metadata.builderEngine === 'v2')"))
  assert.ok(dispatch.indexOf('await runApprovedIsolatedPublication(job, totalDeadlineMs)') < dispatch.indexOf('new BuilderV2Agent('))
})

test('the owner live-site repair holds its merge in Work with me', () => {
  const repair = read('lib/builder/repository-repair.ts')
  assert.match(repair, /if \(autoMergeEnabled\(\) && input\.holdMerge !== true && writeback\.stage === 'pr_created'/)
  assert.match(repair, /COLLABORATE_MERGE_HELD, input\.responseLanguage/)
  assert.match(read('lib/builder/job-runner.ts'), /holdMerge: job\.metadata\.assistanceMode === 'collaborate',/)
  assert.match(read('lib/builder/repository-repair-job.ts'), /\.\.\.\(input\.assistanceMode \? \{ assistanceMode: input\.assistanceMode \} : \{\}\)/)
})

test('every chat offers the selector and sends the remembered mode; the server honours it or the saved one', () => {
  for (const [path, lang] of [['app/page.tsx', 'lang'], ['app/dashboard/assistant/page.tsx', 'l'], ['components/Concierge.tsx', 'activeLang']] as const) {
    const page = read(path)
    assert.match(page, /const \[assistanceMode, setAssistanceMode\] = useAssistanceMode\(\)/, path)
    assert.match(page, new RegExp(`<AssistanceModeSelector mode=\\{assistanceMode\\} onChange=\\{setAssistanceMode\\} lang=\\{${lang}\\}`), path)
    assert.match(page, /context: \{[^}]*assistanceMode[^}]*\}|assistanceMode,\n\s*\},/, path)
  }
  const hook = read('lib/ai/cos/useAssistanceMode.ts')
  assert.match(hook, /supabase\.auth\.updateUser\(\{ data: \{ \[ASSISTANCE_MODE_METADATA_KEY\]: next \} \}\)/)
  const specialist = read('lib/ai/cos/softwareSpecialist.ts')
  assert.match(specialist, /requestedMode \?\? await storedAssistanceMode\(\) \?\? DEFAULT_ASSISTANCE_MODE/)
  assert.ok(specialist.indexOf('if (isAssistanceApproval(objective))') < specialist.indexOf('if (!specialistRelevant) return null', specialist.indexOf('export async function tryCosSoftwareSpecialist(')))
})
