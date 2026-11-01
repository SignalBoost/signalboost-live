// saas/tests/builderCampaignBrowser.node.test.ts
//
// PAC-13..PAC-15 in a browser: the fixed action sequences, the judgments, the hand-back across slices, and the runner
// carrying the browser session between slices. The driver is a fake page; the real one is the Builder's sandbox port.

import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stubOutcomeJudge } from './helpers/answerOutcomeJudgeStub.ts'
import assert from 'node:assert/strict'
import {
  runBrowserCheck, newBrowserSession, checkRequest, occurrences, productionRequestStatus,
  BROWSER_ANSWER_WAIT_MS, BROWSER_SLICE_RESERVE_MS, UI, campaignBrowserOrigins, type BrowserDriver, type BrowserSession, type DriverStep,
} from '../lib/builder/campaign/browserChecks.ts'
import { runCampaignSlice, emptyCampaignLedger } from '../lib/builder/campaign/runner.ts'
import { PAC_CATALOG } from '../lib/builder/campaign/catalog.ts'
import type { CampaignPorts } from '../lib/builder/campaign/ports.ts'

const ok = (stdout = ''): DriverStep => ({ ok: true, stdout, detail: 'exit=0' })

/** A fake live site: a page whose text the check reads, with hooks for what happens on each action. */
function fakePage(options: Readonly<{
  answerAfterMs?: number
  failureText?: string | null
  signedInAfterSubmit?: boolean
  requestsOutput?: string
  loginWorks?: boolean
  /** After a reload the Assistant page lists the conversation's title only until its entry is opened. */
  listedOnly?: boolean
}> = {}) {
  const actions: string[] = []
  let page = ''
  let submittedAt: number | null = null
  let clock = 1_000_000
  let request = ''
  let stopped = false
  let reloaded = false
  let reopened = false
  const now = () => clock
  const sleep = async (ms: number) => { clock += ms }
  const render = () => {
    const lines: string[] = []
    if (page === 'login') lines.push('textbox "Email address"', 'textbox "Password"', 'button "Log in"')
    if (page === 'home') lines.push('textbox "Ask COS anything…"')
    if (page === 'assistant') lines.push('textbox "Ask the concierge…"', 'button "' + (request ? request.slice(0, 40) : '') + '"')
    const transcriptHidden = page === 'assistant' && reloaded && options.listedOnly !== false && !reopened
    if (request && !transcriptHidden) lines.push(`user: ${request}`)
    if (request && submittedAt !== null && !stopped && !transcriptHidden) {
      const answered = clock - submittedAt >= (options.answerAfterMs ?? 20_000)
      if (options.failureText && answered) lines.push(options.failureText)
      else if (answered) lines.push('COS', page === 'home' ? 'answer: consumer lag rises when processing stalls on I/O; Copy response' : 'answer: consumer lag rises when processing stalls on I/O; button "👍 Helpful"')
      else lines.push(page === 'home' ? 'COS is thinking…' : 'button "Stop"')
    }
    return lines.join('\n')
  }
  const driver: BrowserDriver = {
    open: async url => { actions.push(`open ${url}`); page = url.endsWith('/dashboard') ? 'login' : 'home'; return ok() },
    goto: async url => { actions.push(`goto ${url}`); page = url.includes('assistant') ? 'assistant' : page; return ok() },
    fill: async (target, text) => { actions.push(`fill ${target}`); if (target === UI.homeInput || target === UI.assistantInput) request = text; return ok() },
    click: async target => {
      actions.push(`click ${target}`)
      if (target === UI.homeSend || target === UI.assistantSend) submittedAt = clock
      if (target === UI.loginSubmit && options.loginWorks !== false) page = 'dashboard'
      if (target === UI.assistantStop) stopped = true
      if (request && target === UI.historyEntry(request.slice(0, 7))) reopened = true
      return ok()
    },
    find: async text => { actions.push(`find ${text}`); const body = render(); return ok(body.split('\n').filter(line => line.includes(text)).join('\n')) },
    snapshot: async () => { actions.push('snapshot'); return ok(render()) },
    reload: async () => { actions.push('reload'); reloaded = true; return ok() },
    requests: async () => { actions.push('requests'); return ok(options.requestsOutput ?? '1 [POST] https://itmounts.com/api/cos-browser => 200') },
    close: async () => { actions.push('close'); return ok() },
  }
  return { driver, actions, now, sleep, request: () => request }
}

const credentials = { email: 'campaign@example.com', password: 'not-a-real-password' }

test('PAC-13: the authenticated COS Assistant receives the request and responds on the page', async () => {
  const site = fakePage({ answerAfterMs: 12_000 })
  const session = newBrowserSession('PAC-13', site.now(), 'sbx-1')
  const outcome = await runBrowserCheck({ testId: 'PAC-13', session, driver: site.driver, credentials, records: async () => null, now: site.now, remainingMs: () => 200_000, sleep: site.sleep })
  assert.equal(outcome.status, 'done')
  if (outcome.status !== 'done') return
  assert.equal(outcome.result.verdict, 'PASS', outcome.result.actual)
  assert.equal(site.request(), checkRequest('PAC-13', session.token))
  assert.ok(site.actions.includes(`click ${UI.loginSubmit}`))
  assert.ok(site.actions.includes(`fill ${UI.assistantInput}`) && site.actions.includes(`click ${UI.assistantSend}`))
  assert.ok(!site.actions.includes(`click ${UI.assistantSend}`), 'a public Concierge request cannot certify authenticated COS')
  assert.ok(site.actions.includes('close'), 'the browser is closed after the check')
  assert.ok(outcome.result.evidence.some(item => /answer on the page \d+ ms after submit/.test(item.detail)))
})

test('PAC-13 cannot PASS without an authenticated COS test account', async () => {
  const site = fakePage({ answerAfterMs: 0 })
  const outcome = await runBrowserCheck({ testId: 'PAC-13', session: newBrowserSession('PAC-13', site.now(), 'sbx'), driver: site.driver, credentials: null, records: async () => null, now: site.now, remainingMs: () => 200_000, sleep: site.sleep })
  assert.equal(outcome.status, 'done')
  assert.equal(outcome.status === 'done' && outcome.result.verdict, 'BLOCKED')
  assert.ok(!site.actions.includes(`click ${UI.homeSend}`))
})

test('PAC-13: a failure message on the page is FAIL; no answer within the window is FAIL', async () => {
  const failing = fakePage({ answerAfterMs: 5_000, failureText: 'I could not finish a reliable answer to this request just now' })
  const failed = await runBrowserCheck({ testId: 'PAC-13', session: newBrowserSession('PAC-13', failing.now(), 'sbx'), driver: failing.driver, credentials, records: async () => null, now: failing.now, remainingMs: () => 200_000, sleep: failing.sleep })
  assert.equal(failed.status === 'done' && failed.result.verdict, 'FAIL')
  assert.match(failed.status === 'done' ? failed.result.actual : '', /failure message/)
  const silent = fakePage({ answerAfterMs: BROWSER_ANSWER_WAIT_MS + 60_000 })
  const timedOut = await runBrowserCheck({ testId: 'PAC-13', session: newBrowserSession('PAC-13', silent.now(), 'sbx'), driver: silent.driver, credentials, records: async () => null, now: silent.now, remainingMs: () => 10 * 60_000, sleep: silent.sleep })
  assert.equal(timedOut.status === 'done' && timedOut.result.verdict, 'FAIL')
  assert.match(timedOut.status === 'done' ? timedOut.result.actual : '', /no answer on the page/)
})

test('a check waiting for the page hands the slice back and continues from the same session in the next slice', async () => {
  const site = fakePage({ answerAfterMs: 90_000 })
  let remaining = 60_000
  const first = await runBrowserCheck({ testId: 'PAC-13', session: newBrowserSession('PAC-13', site.now(), 'sbx-7'), driver: site.driver, credentials, records: async () => null, now: site.now, remainingMs: () => { remaining -= 5_000; return remaining }, sleep: site.sleep })
  assert.equal(first.status, 'pending')
  assert.equal(first.session.phase, 'submitted')
  assert.equal(first.session.sandboxName, 'sbx-7')
  const submitsBefore = site.actions.filter(action => action === `click ${UI.assistantSend}`).length
  const second = await runBrowserCheck({ testId: 'PAC-13', session: first.session, driver: site.driver, credentials, records: async () => null, now: site.now, remainingMs: () => 200_000, sleep: site.sleep })
  assert.equal(second.status, 'done')
  assert.equal(second.status === 'done' && second.result.verdict, 'PASS')
  assert.equal(site.actions.filter(action => action === `click ${UI.assistantSend}`).length, submitsBefore, 'the request is not submitted a second time')
})

test('PAC-14 and PAC-15 are BLOCKED without a test account, and sign in with one', async () => {
  const site = fakePage()
  const blocked = await runBrowserCheck({ testId: 'PAC-14', session: newBrowserSession('PAC-14', site.now(), 'sbx'), driver: site.driver, credentials, records: async () => null, now: site.now, remainingMs: () => 200_000, sleep: site.sleep })
  assert.equal(blocked.status === 'done' && blocked.result.verdict, 'BLOCKED')
  assert.equal(blocked.status === 'done' && blocked.result.failureCause, 'no test account configured')

  const persisted = fakePage({ answerAfterMs: 10_000 })
  const records = async () => ({ user: 1, assistant: 1 })
  const pass14 = await runBrowserCheck({ testId: 'PAC-14', session: newBrowserSession('PAC-14', persisted.now(), 'sbx'), driver: persisted.driver, credentials, records, now: persisted.now, remainingMs: () => 300_000, sleep: persisted.sleep })
  assert.equal(pass14.status === 'done' && pass14.result.verdict, 'PASS', pass14.status === 'done' ? pass14.result.actual : '')
  assert.ok(persisted.actions.includes(`fill ${UI.loginEmail}`) && persisted.actions.includes(`click ${UI.loginSubmit}`) && persisted.actions.includes('reload'))
  assert.ok(persisted.actions.some(action => action.startsWith('click getByRole(\'button\', { name: /PAC')), 'the saved conversation is reopened from History after the reload')
  assert.ok(!persisted.actions.some(action => action.includes(credentials.password)), 'the password never enters the action log')
  assert.ok(!JSON.stringify(pass14).includes(credentials.password), 'the password never enters the evidence')

  const lost = fakePage({ answerAfterMs: 10_000 })
  const fail14 = await runBrowserCheck({ testId: 'PAC-14', session: newBrowserSession('PAC-14', lost.now(), 'sbx'), driver: lost.driver, credentials, records: async () => ({ user: 0, assistant: 0 }), now: lost.now, remainingMs: () => 300_000, sleep: lost.sleep })
  assert.equal(fail14.status === 'done' && fail14.result.verdict, 'FAIL')
  assert.match(fail14.status === 'done' ? fail14.result.actual : '', /records do not hold it/)
})

test('PAC-15: Stop while in flight, reload, exactly one recorded request and no duplicate', async () => {
  const site = fakePage({ answerAfterMs: 120_000 })
  const pass = await runBrowserCheck({ testId: 'PAC-15', session: newBrowserSession('PAC-15', site.now(), 'sbx'), driver: site.driver, credentials, records: async () => ({ user: 1, assistant: 0 }), now: site.now, remainingMs: () => 300_000, sleep: site.sleep })
  assert.equal(pass.status === 'done' && pass.result.verdict, 'PASS', pass.status === 'done' ? pass.result.actual : '')
  assert.ok(site.actions.includes(`click ${UI.assistantStop}`))
  const duplicated = fakePage({ answerAfterMs: 120_000 })
  const fail = await runBrowserCheck({ testId: 'PAC-15', session: newBrowserSession('PAC-15', duplicated.now(), 'sbx'), driver: duplicated.driver, credentials, records: async () => ({ user: 2, assistant: 1 }), now: duplicated.now, remainingMs: () => 300_000, sleep: duplicated.sleep })
  assert.equal(fail.status === 'done' && fail.result.verdict, 'FAIL')
  assert.match(fail.status === 'done' ? fail.result.actual : '', /duplicate execution/)
  const notInFlight = fakePage({ answerAfterMs: 0 })
  const early = await runBrowserCheck({ testId: 'PAC-15', session: newBrowserSession('PAC-15', notInFlight.now(), 'sbx'), driver: notInFlight.driver, credentials, records: async () => ({ user: 1, assistant: 1 }), now: notInFlight.now, remainingMs: () => 300_000, sleep: notInFlight.sleep })
  assert.equal(early.status === 'done' && early.result.verdict, 'FAIL')
  assert.match(early.status === 'done' ? early.result.actual : '', /not in flight/)
})

test('PAC-14 fails when History lists the conversation but reopening it shows no answer', async () => {
  const site = fakePage({ answerAfterMs: 10_000 })
  const original = site.driver.click
  const driver = { ...site.driver, click: async (target: string) => { if (target.startsWith("getByRole('button', { name: /PAC")) return { ok: false, stdout: '', detail: 'exit=1' }; return original(target) } }
  const result = await runBrowserCheck({ testId: 'PAC-14', session: newBrowserSession('PAC-14', site.now(), 'sbx'), driver, credentials, records: async () => ({ user: 1, assistant: 1 }), now: site.now, remainingMs: () => 300_000, sleep: site.sleep })
  assert.equal(result.status === 'done' && result.result.verdict, 'FAIL')
})

test('the campaign browser may reach the site and the sign-in service the site calls from the browser', () => {
  assert.equal(campaignBrowserOrigins({}), 'https://itmounts.com,https://www.itmounts.com')
  assert.equal(campaignBrowserOrigins({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/rest' }), 'https://itmounts.com,https://www.itmounts.com,https://abc.supabase.co')
  assert.equal(campaignBrowserOrigins({ NEXT_PUBLIC_SUPABASE_URL: 'not a url' }), 'https://itmounts.com,https://www.itmounts.com')
})

test('helpers: occurrences and the production request status from the CLI request list', () => {
  assert.equal(occurrences('a PACX b\nc\nPACX again', 'PACX'), 2)
  assert.equal(productionRequestStatus('1 [GET] https://itmounts.com/ => 200\n2 [POST] https://itmounts.com/api/cos-browser => 503 Service Unavailable'), 503)
  assert.equal(productionRequestStatus('1 [GET] https://itmounts.com/ => 200'), null)
})

test('runner: a pending browser check ends the slice with its session checkpointed; the next slice continues it; the sandbox carries to the next browser item', async () => {
  const deployment = async () => ({ mainCommit: 'abc' })
  const calls: Array<{ testId: string; session: BrowserSession | null; last: boolean }> = []
  let pendingOnce = true
  const ports: CampaignPorts = {
    outcomeJudge: stubOutcomeJudge,
    deployment,
    browser: async (testId, session, slice) => {
      calls.push({ testId, session, last: slice.last })
      const current = session ?? newBrowserSession(testId, 0, 'sbx-run')
      if (testId === 'PAC-13' && pendingOnce) { pendingOnce = false; return { status: 'pending', session: { ...current, phase: 'submitted', submittedAt: 1 } } }
      return { status: 'done', session: { ...current, phase: 'answered' }, result: { verdict: 'PASS', actual: 'ok', evidence: [] } }
    },
  }
  const browserOnly = PAC_CATALOG.filter(item => item.port === 'browser')
  const first = await runCampaignSlice({ catalog: browserOnly, state: { ledger: emptyCampaignLedger('COS-PAC-001'), reliability: null }, ports, remainingMs: () => 10 * 60_000 })
  assert.equal(first.stopped, 'budget')
  assert.equal(first.ledger.rows.length, 0, 'a pending check has no row yet')
  assert.equal(first.browser?.testId, 'PAC-13')
  assert.equal(first.browser?.phase, 'submitted')
  const second = await runCampaignSlice({ catalog: browserOnly, state: { ...first, reliability: null }, ports, remainingMs: () => 10 * 60_000 })
  assert.equal(second.stopped, 'complete')
  assert.deepEqual(second.ledger.rows.map(row => `${row.testId}:${row.verdict}`), ['PAC-13:PASS', 'PAC-14:PASS', 'PAC-15:PASS'])
  assert.equal(calls[1].session?.phase, 'submitted', 'the second slice continues the checkpointed session')
  assert.equal(calls[2].session?.sandboxName, 'sbx-run', 'the next browser item reuses the sandbox')
  assert.equal(calls[2].session?.phase, 'start')
  assert.notEqual(calls[2].session?.token, calls[1].session?.token, 'each browser item gets its own request token')
  assert.equal(calls[2].session?.testId, 'PAC-14')
  assert.deepEqual(calls.map(call => call.last), [false, false, false, true])
})


test('PAC sign-in targets the real auth modal submit instead of the navbar login', () => {
  const modal = readFileSync(new URL('../components/AuthModal.tsx', import.meta.url), 'utf8')
  assert.equal(UI.loginSubmit, "getByTestId('auth-modal-submit')")
  assert.match(modal, /data-testid="auth-modal-submit" onClick=\{handleSubmit\}/)
})
