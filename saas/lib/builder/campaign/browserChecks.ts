// saas/lib/builder/campaign/browserChecks.ts
//
// PAC-13..PAC-15 IN A REAL BROWSER. Each check is a fixed sequence of browser actions against the live site, driven
// through a small driver (the host binds it to the Builder's Vercel Sandbox + Playwright CLI port) and judged by what
// the page shows. A check spans job slices: the driver's browser session survives between slices, and the phase the
// check reached is kept in the campaign checkpoint, so a two-minute COS answer is waited for across slices instead of
// being cut by one slice's deadline.
//
//   PAC-13  the public Concierge on the home page: type the request, press "Ask COS", wait for the real answer.
//           PASS when the page shows the answer and no failure message, and the request to the production path
//           returned 200.
//   PAC-14  signed in: submit on the Assistant page, wait for the answer, reload; PASS when the request and its answer
//           are still on the page after the reload (History persisted).
//   PAC-15  signed in: submit, press Stop while COS is working, reload; PASS when nothing is still executing and the
//           production records hold exactly one request and at most one answer for it (no duplicate execution).
//           The page alone cannot count executions (the History sidebar repeats a request's title), so the host
//           also reads the signed-in user's message records for the request's token.
//
// PAC-14 and PAC-15 need a signed-in user; without test-account credentials they are BLOCKED with that cause.
// Pure: no I/O of its own; every effect goes through the driver.

import type { PortResult } from './ports.ts'
import type { CampaignEvidence } from './ledger.ts'

export const SITE_URL = 'https://itmounts.com'
/** How long a submitted request may take on the page before the check fails: the production path's own window plus margin. */
export const BROWSER_ANSWER_WAIT_MS = 200_000
/** Polling cadence while waiting for the page. */
export const BROWSER_POLL_MS = 5_000
/** A slice hands the check back to the job when less than this is left, so the checkpoint write still fits. */
export const BROWSER_SLICE_RESERVE_MS = 30_000

/** The real labels of the live UI (English copy; the browser runs with no stored language, so English renders). */
export const UI = Object.freeze({
  homeInput: "getByRole('textbox', { name: 'Ask COS anything…' })",
  homeSend: "getByRole('button', { name: 'Ask COS' })",
  homeThinking: 'COS is thinking…',
  homeCopyResponse: 'Copy response',
  loginEmail: "getByPlaceholder('Email address')",
  loginPassword: "getByPlaceholder('Password')",
  // The navbar also has a Log in button; only the modal submit actually authenticates.
  loginSubmit: "getByTestId('auth-modal-submit')",
  loginEmailText: 'Email address',
  loginErrorText: 'alert',
  assistantInput: "getByPlaceholder('Ask the concierge…')",
  assistantSend: "getByRole('button', { name: 'Send' })",
  assistantStop: "getByRole('button', { name: 'Stop' })",
  assistantStopText: 'Stop',
  /** Every answer on the Assistant page carries its feedback row; this label marks a rendered answer. */
  assistantAnswerText: 'Helpful',
  /** The History sidebar entry whose title carries the request token (the page lists titles only until one is opened). */
  historyEntry: (token: string) => `getByRole('button', { name: /${token}/ })`,
})

/** Failure messages the UI shows when the production path did not answer; any of them on the page is FAIL. */
export const FAILURE_TEXTS = Object.freeze([
  'I could not finish a reliable answer',
  'Connection problem',
  'I could not create a response',
  'I could not reach COS just now',
])

/**
 * The origins the campaign browser may reach: the live site, and the authentication service the site's sign-in
 * form calls from the browser (Codex on #4980: with egress limited to the site, PAC-14/15 could never sign in).
 */
export function campaignBrowserOrigins(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const origins = [SITE_URL, 'https://www.itmounts.com']
  try {
    const auth = new URL(String(env.NEXT_PUBLIC_SUPABASE_URL || '')).origin
    if (auth && !origins.includes(auth)) origins.push(auth)
  } catch {
    // No authentication origin configured: the site alone.
  }
  return origins.join(',')
}

export type DriverStep = Readonly<{ ok: boolean; stdout: string; detail: string }>

export type BrowserDriver = Readonly<{
  open: (url: string) => Promise<DriverStep>
  goto: (url: string) => Promise<DriverStep>
  fill: (target: string, text: string) => Promise<DriverStep>
  click: (target: string) => Promise<DriverStep>
  /** Search the page's current snapshot for a text; stdout holds the matches. */
  find: (text: string) => Promise<DriverStep>
  snapshot: () => Promise<DriverStep>
  reload: () => Promise<DriverStep>
  requests: () => Promise<DriverStep>
  close: () => Promise<DriverStep>
}>

export type BrowserPhase = 'start' | 'submitted' | 'answered'

export type BrowserSession = Readonly<{
  /** The sandbox holding the browser, for the next slice to attach to. */
  sandboxName: string | null
  testId: string | null
  phase: BrowserPhase
  /** A token inside the request so the page can be searched for exactly this request. */
  token: string
  submittedAt: number | null
  /** Credential-free step log carried between slices; it becomes the row's evidence. */
  log: readonly string[]
}>

export type BrowserCheckOutcome =
  | Readonly<{ status: 'done'; result: PortResult; session: BrowserSession }>
  | Readonly<{ status: 'pending'; session: BrowserSession }>

export function newBrowserSession(testId: string, now: number, sandboxName: string | null = null): BrowserSession {
  return { sandboxName, testId, phase: 'start', token: `PAC${now.toString(36).toUpperCase()}`, submittedAt: null, log: [] }
}

/** The request each check types: short, analytical, and carrying the session token so the page can be searched for it. */
export function checkRequest(testId: string, token: string): string {
  switch (testId) {
    case 'PAC-15':
      return `${token}: A payment service shows 18% 5xx errors while Kafka consumer lag climbs to minutes and CPU stays flat. 1. Identify plausible root causes. 2. Describe the decisive measurements. 3. State the most likely explanation with its uncertainty.`
    default:
      return `${token}: In three sentences, why can Kafka consumer lag rise while the consumers' CPU stays flat?`
  }
}

function evidence(session: BrowserSession, extra: readonly string[] = []): CampaignEvidence[] {
  return [...session.log, ...extra].map((line, index) => ({ kind: 'browser' as const, label: `step ${index + 1}`, detail: line }))
}

function failed(session: BrowserSession, cause: string, extra: readonly string[] = []): BrowserCheckOutcome {
  return { status: 'done', session, result: { verdict: 'FAIL', actual: cause, evidence: evidence(session, extra), failureCause: cause } }
}

function passed(session: BrowserSession, actual: string, extra: readonly string[] = []): BrowserCheckOutcome {
  return { status: 'done', session, result: { verdict: 'PASS', actual, evidence: evidence(session, extra) } }
}

function found(step: DriverStep, text: string): boolean {
  return step.ok && step.stdout.includes(text)
}

/** Count how many times a text appears in a snapshot, with the snapshot's own repetition (refs, nested nodes) collapsed per line. */
export function occurrences(snapshot: string, text: string): number {
  return snapshot.split(/\r?\n/).filter(line => line.includes(text)).length
}

/** The production request's HTTP status as the browser saw it, from the CLI's request list; null when not listed. */
export function productionRequestStatus(requestsOutput: string): number | null {
  const line = requestsOutput.split(/\r?\n/).find(item => /\/api\/(?:cos-browser|concierge|assistant)\b/.test(item) && /\bPOST\b/i.test(item))
  if (!line) return null
  const status = line.match(/\b(\d{3})\b(?!.*\b\d{3}\b)/)
  return status ? Number(status[1]) : null
}

export type BrowserCheckInput = Readonly<{
  testId: string
  session: BrowserSession
  driver: BrowserDriver
  credentials: Readonly<{ email: string; password: string }> | null
  /** How many user and assistant messages the production records hold for a request token; null when unreadable. */
  records: (token: string) => Promise<Readonly<{ user: number; assistant: number }> | null>
  now: () => number
  remainingMs: () => number
  sleep: (ms: number) => Promise<void>
}>

async function signIn(input: BrowserCheckInput, log: string[]): Promise<string | null> {
  const { driver, credentials } = input
  if (!credentials) return 'no test account configured'
  const opened = await driver.open(`${SITE_URL}/dashboard`)
  log.push(`open /dashboard: ${opened.detail}`)
  if (!opened.ok) return 'could not open /dashboard'
  const gate = await driver.find(UI.loginEmailText)
  if (!found(gate, UI.loginEmailText)) return 'the sign-in form did not appear'
  const email = await driver.fill(UI.loginEmail, credentials.email)
  const password = await driver.fill(UI.loginPassword, credentials.password)
  const submit = await driver.click(UI.loginSubmit)
  log.push(`sign in: fill email ${email.detail}; fill password ${password.detail}; submit ${submit.detail}`)
  if (!email.ok || !password.ok || !submit.ok) return 'could not submit the sign-in form'
  const deadline = input.now() + 30_000
  while (input.now() < deadline) {
    await input.sleep(2_000)
    const still = await driver.find(UI.loginEmailText)
    if (!found(still, UI.loginEmailText)) {
      log.push('signed in: the sign-in form is gone')
      return null
    }
    // The modal exposes auth errors as an accessible alert. Report the failure category,
    // never the raw server message, email, password or authorization response.
    const authError = await driver.find(UI.loginErrorText)
    if (found(authError, UI.loginErrorText)) {
      log.push('sign-in rejected: authentication error alert visible')
      return 'sign-in rejected by authentication service'
    }
  }
  const requests = await driver.requests()
  const tokenLine = requests.ok
    ? requests.stdout.split(/\r?\n/).find(line => /\/auth\/v1\/token(?:\?|\s|$)/i.test(line))
    : undefined
  const tokenStatus = tokenLine?.match(/\b(\d{3})\b(?!.*\b\d{3}\b)/)?.[1]
  if (tokenStatus) log.push(`sign-in auth token HTTP status: ${tokenStatus}`)
  return tokenStatus === '200'
    ? 'authentication returned HTTP 200 but sign-in did not finish'
    : tokenStatus
      ? `authentication token request returned HTTP ${tokenStatus}`
      : 'sign-in did not complete within 30 s (no token response status available)'
}

/** Run or continue one browser check inside this slice's remaining time. */
export async function runBrowserCheck(input: BrowserCheckInput): Promise<BrowserCheckOutcome> {
  const { testId, driver } = input
  const log = [...input.session.log]
  let session: BrowserSession = { ...input.session, testId }
  const request = checkRequest(testId, session.token)
  const save = (patch: Partial<BrowserSession>): BrowserSession => (session = { ...session, ...patch, log: [...log] })

  if (session.phase === 'start') {
    // PAC-13 through PAC-15 must all exercise authenticated COS, not the public Concierge.
    const cause = await signIn(input, log)
    if (cause) {
      save({})
      return cause === 'no test account configured'
        ? { status: 'done', session, result: { verdict: 'BLOCKED', actual: `Not executed: ${cause}.`, evidence: evidence(session), failureCause: cause } }
        : failed(session, cause)
    }
    const assistant = await driver.goto(`${SITE_URL}/dashboard/assistant`)
    log.push(`open /dashboard/assistant: ${assistant.detail}`)
    if (!assistant.ok) return failed(save({}), 'could not open the Assistant page')
    const filled = await driver.fill(UI.assistantInput, request)
    const sent = await driver.click(UI.assistantSend)
    log.push(`type request (${request.length} chars): ${filled.detail}; press "Send": ${sent.detail}`)
    if (!filled.ok || !sent.ok) return failed(save({}), 'could not submit the request on the authenticated Assistant page')
    save({ phase: 'submitted', submittedAt: input.now() })
  }

  if (session.phase === 'submitted') {
    const submittedAt = session.submittedAt ?? input.now()
    if (testId === 'PAC-15') {
      // Cancel while COS is working: the Stop button is shown only while the request is in flight.
      const stop = await driver.find(UI.assistantStopText)
      if (!found(stop, UI.assistantStopText)) return failed(save({}), 'the request was not in flight (no Stop button) when the cancel was attempted')
      const clicked = await driver.click(UI.assistantStop)
      log.push(`press "Stop" ${input.now() - submittedAt} ms after submit: ${clicked.detail}`)
      if (!clicked.ok) return failed(save({}), 'could not press Stop')
      await input.sleep(3_000)
      save({ phase: 'answered' })
    } else {
      // Wait for the answer, inside this slice's time; hand back to the job when the slice is nearly spent.
      while (true) {
        if (input.now() - submittedAt > BROWSER_ANSWER_WAIT_MS) {
          const snapshot = await driver.snapshot()
          return failed(save({}), `no answer on the page ${BROWSER_ANSWER_WAIT_MS / 1000} s after submit`, [`page excerpt: ${snapshot.stdout.slice(0, 400)}`])
        }
        if (input.remainingMs() < BROWSER_SLICE_RESERVE_MS) return { status: 'pending', session: save({}) }
        const snapshot = await driver.snapshot()
        const failure = FAILURE_TEXTS.find(text => snapshot.stdout.includes(text))
        if (failure) return failed(save({}), `the page shows a failure message: "${failure}"`, [`page excerpt: ${snapshot.stdout.slice(0, 400)}`])
        const stillWorking = snapshot.stdout.includes(UI.homeThinking) || occurrences(snapshot.stdout, UI.assistantStopText) > 0
        const answered = !stillWorking && snapshot.stdout.includes(UI.assistantAnswerText)
        if (answered && !stillWorking) {
          log.push(`answer on the page ${input.now() - submittedAt} ms after submit`)
          save({ phase: 'answered' })
          break
        }
        await input.sleep(BROWSER_POLL_MS)
      }
    }
  }

  if (session.phase === 'answered') {
    if (testId === 'PAC-13') {
      const requests = await driver.requests()
      const status = productionRequestStatus(requests.stdout)
      log.push(`production request status as the browser saw it: ${status ?? 'not listed'}`)
      await driver.close()
      if (status !== null && status >= 400) return failed(save({}), `the production request returned HTTP ${status}`)
      return passed(save({}), 'The request submitted in authenticated COS received its answer on the Assistant page.')
    }
    const reloaded = await driver.reload()
    log.push(`reload: ${reloaded.detail}`)
    if (!reloaded.ok) return failed(save({}), 'could not reload the page')
    await input.sleep(5_000)
    // After a reload the Assistant page lists saved conversations by title; the saved result is shown only once its
    // entry is opened, so that is what "return" means here.
    const listed = await driver.find(session.token)
    const reopened = found(listed, session.token) ? await driver.click(UI.historyEntry(session.token)) : null
    if (reopened) { log.push(`open the saved conversation from History: ${reopened.detail}`); await input.sleep(3_000) }
    const snapshot = await driver.snapshot()
    const requestsOnPage = occurrences(snapshot.stdout, session.token)
    const answerShown = snapshot.stdout.includes(UI.assistantAnswerText)
    const records = await input.records(session.token)
    const recorded = records ? `records: ${records.user} request(s), ${records.assistant} answer(s)` : 'records: unreadable'
    log.push(`after reload: request on the page ${requestsOnPage} time(s); answer shown: ${answerShown ? 'yes' : 'no'}; ${recorded}`)
    await driver.close()
    if (testId === 'PAC-14') {
      if (!reopened || !reopened.ok) return failed(save({}), 'the completed request is not listed in History after reload', [`page excerpt: ${snapshot.stdout.slice(0, 400)}`])
      if (requestsOnPage === 0 || !answerShown) return failed(save({}), 'the saved conversation does not show the request and its answer after reload', [`page excerpt: ${snapshot.stdout.slice(0, 400)}`])
      if (!records || records.user < 1 || records.assistant < 1) return failed(save({}), `the completed request is shown after reload but the production records do not hold it (${recorded})`)
      return passed(save({}), 'After a reload the conversation is listed in History, reopens with the request and its answer, and is held in the production records.')
    }
    // PAC-15: nothing still executing; exactly one request recorded and at most one answer.
    if (occurrences(snapshot.stdout, UI.assistantStopText) > 0) return failed(save({}), 'the request is still executing after Stop and reload')
    if (!records) return failed(save({}), 'the production records for the cancelled request could not be read')
    if (records.user !== 1 || records.assistant > 1) return failed(save({}), `duplicate execution: ${recorded}`)
    return passed(save({}), `After Stop and reload nothing is still executing; ${recorded}.`)
  }

  return failed(save({}), `unknown phase ${session.phase}`)
}
