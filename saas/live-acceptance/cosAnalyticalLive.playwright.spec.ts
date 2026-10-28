import { expect, test } from '@playwright/test'
import { missingAnalyticalTasks, requestedAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'

// Actual, authenticated HTTP request to COS. No route interception or model mocking.
// Prompts are synthesized scenarios, not real user/customer data.
const cases = [
  {
    name: 'PostgreSQL storage growth',
    prompt: [
      'You are an incident analyst. Respond with provisional conclusions. Do not write code or generate a project.',
      'Scenario: PostgreSQL storage increased 40% overnight. Disk I/O doubled. CPU was normal. No deployment happened. Backups succeeded.',
      '1. List and explain plausible technical sources of the unexplained storage growth.',
      '2. Rank competing hypotheses and explain which observations support or weaken each.',
      '3. Describe missing operational evidence required to distinguish hypotheses.',
      '4. Design concrete read-only diagnostic experiments and predicted outcomes.',
    ].join('\n'),
  },
  {
    name: 'queue replay and reconciliation',
    prompt: [
      'Analyze the following hypothetical service incident. Do not write code, execute tools or claim to possess unsupplied logs.',
      'Scenario: Payments settle once but reports occasionally count them twice. Message consumer lag rises before reporting discrepancies. A consumer restarts periodically. Database primary keys remain unique.',
      '1. List plausible mechanisms and explain how each could produce the observed discrepancy.',
      '2. Rank the hypotheses and distinguish temporal correlation from causation.',
      '3. Describe missing evidence and propose discriminating forensic checks.',
      '4. Explain potential interacting failures and identify the leading provisional explanation.',
    ].join('\n'),
  },
]

for (const scenario of cases) {
  test(`unmocked COS analysis: ${scenario.name}`, async ({ request }, testInfo) => {
    const started = Date.now()
    const response = await request.post('/api/cos-browser', {
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-signalboost-surface': 'cos',
      },
      data: {
        messages: [{ role: 'user', content: scenario.prompt }],
        context: { language: 'en', assistanceMode: 'guide' },
      },
      timeout: 170_000,
    })
    const raw = await response.text()
    let payload: Record<string, unknown> = {}
    try { payload = JSON.parse(raw) as Record<string, unknown> } catch {
      throw new Error(`COS returned non-JSON response (HTTP ${response.status()})`)
    }
    const answer = typeof payload.reply === 'string' ? payload.reply
      : typeof payload.answer === 'string' ? payload.answer : ''
    const missing = missingAnalyticalTasks(scenario.prompt, answer)
    const refusal = /I could not complete the requested analytical deliverables|No complete investigation was produced|the task requires a fresh reasoning attempt|need more readings before/i.test(answer)
    const receipt = {
      case: scenario.name,
      timestamp: new Date().toISOString(),
      target: new URL(process.env.COS_LIVE_BASE_URL!).origin,
      expectedCommit: process.env.COS_LIVE_EXPECTED_COMMIT,
      // Expected revision must be verified independently against the Vercel deployment.
      deploymentCommitVerified: false,
      status: response.status(),
      responseSource: typeof payload.source === 'string' ? payload.source : null,
      elapsedMs: Date.now() - started,
      requestedTasks: requestedAnalyticalTasks(scenario.prompt).length,
      missingTasks: missing.length,
      rejectedFallback: refusal,
      answerLength: answer.length,
      // No session state, cookies, authorization headers or request identifiers exposed.
    }
    await testInfo.attach('cos-live-acceptance-receipt.json', {
      body: Buffer.from(JSON.stringify(receipt, null, 2)),
      contentType: 'application/json',
    })
    expect(response.status(), JSON.stringify(receipt)).toBe(200)
    expect(answer.length, JSON.stringify(receipt)).toBeGreaterThan(350)
    expect(refusal, JSON.stringify(receipt)).toBe(false)
    expect(missing, JSON.stringify(receipt)).toEqual([])
    expect(/hypothes|provisional|uncertain|likely|possible/i.test(answer)).toBe(true)
  })
}


test('unmocked COS advice: supplied policy memorandum must not turn into an unsolicited email', async ({ request }, testInfo) => {
  const prompt = [
    'Reference memorandum — hypothetical, unverified example:',
    'The agency is considering longer time-in-grade limits and a one-time extension for employees facing promotion windows.',
    'The memorandum does not announce a change to age-based mandatory retirement.',
    'USER QUESTION: I am not near my time-in-grade limit, but I expect to reach age 65 next year. Does this memorandum create an opportunity to keep working? What options should I discuss with HR?',
    'Please advise on the significance of the memorandum and explain what needs independent confirmation. I am seeking advice, not a letter or email.',
  ].join('\\n')
  const started = Date.now()
  const response = await request.post('/api/cos-browser', {
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-signalboost-surface': 'cos' },
    data: { messages: [{ role: 'user', content: prompt }], context: { language: 'en', assistanceMode: 'guide' } },
    timeout: 170_000,
  })
  const raw = await response.text()
  let payload: Record<string, unknown> = {}
  try { payload = JSON.parse(raw) as Record<string, unknown> } catch {
    throw new Error(`COS returned non-JSON response (HTTP ${response.status()})`)
  }
  const answer = typeof payload.reply === 'string' ? payload.reply
    : typeof payload.answer === 'string' ? payload.answer : ''
  const refusal = /requires live authoritative evidence|No model-memory answer was used|Visual instructions can be up to|historical-list page|could not safely parse/i.test(answer)
  const unsolicitedDraft = /(?:^|\\n)\\s*(?:subject:\\s*request for|dear (?:hr|team|sir|madam)|respectfully,|sincerely,)/im.test(answer)
  const mentionsMemoLimit = /(?:memorandum|memo|time.in.grade|age.based|retirement)/i.test(answer)
  const receipt = {
    case: 'supplied-policy-advice-not-draft',
    timestamp: new Date().toISOString(),
    target: new URL(process.env.COS_LIVE_BASE_URL!).origin,
    expectedCommit: process.env.COS_LIVE_EXPECTED_COMMIT,
    deploymentCommitVerified: false,
    status: response.status(),
    source: typeof payload.source === 'string' ? payload.source : null,
    elapsedMs: Date.now() - started,
    answerLength: answer.length,
    refusal,
    unsolicitedDraft,
    mentionsMemoLimit,
  }
  await testInfo.attach('cos-advice-live-acceptance-receipt.json', {
    body: Buffer.from(JSON.stringify(receipt, null, 2)),
    contentType: 'application/json',
  })
  expect(response.status(), JSON.stringify(receipt)).toBe(200)
  expect(answer.length, JSON.stringify(receipt)).toBeGreaterThan(220)
  expect(refusal, JSON.stringify(receipt)).toBe(false)
  expect(unsolicitedDraft, JSON.stringify(receipt)).toBe(false)
  expect(mentionsMemoLimit, JSON.stringify(receipt)).toBe(true)
})
