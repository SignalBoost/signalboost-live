//
// Owner, 2026-10-02: "PLAYWRIGHT WATCHDOG - independently proves the line."
//
// This is the independent prover. It runs outside the deployment, in a real browser context, against the live
// production URL, and it does NOT accept the controller's own word for anything. The controller reports what it
// DISPATCHED; this spec reports what MOVED. Those are different claims, and every stall in this pipeline's history
// looked identical from the dispatch side: a station woken every minute, reporting success, moving nothing.
//
// Method: read per-unit placement, wait at least one takt time, read it again, and compute the delta here. The
// controller cannot fake a pass - to make a unit appear at a different station it has to actually move it.
//
// Honest failure modes, stated up front:
//   - No base URL or no secret: the spec SKIPS with a loud reason. It never passes by default. A prover that goes
//     green when it could not run is worse than no prover.
//   - An idle line: reported as NOT PROVEN, not as a pass. A pipeline with nothing in it satisfies every liveness
//     check ever written and has proved nothing.
//   - Material waiting past a station's own SLA with nothing moving: that is the hard failure. It is the one
//     condition that means the line stopped.
//
// Run it with:  PLAYWRIGHT_BASE_URL=https://<production> CRON_SECRET=<secret> npx playwright test tests/cosUniversityAssemblyLine.playwright.spec.ts
import { expect, test } from '@playwright/test'
import {
  describeLineProof,
  proveLineMovement,
  sampleFromLineState,
  type LineSample,
} from '../lib/ai/cos/cosUniversityLineMovementProof.ts'
import { lineProofMinimumIntervalSeconds } from '../lib/ai/cos/cosUniversityLineMovementProof.ts'
import { stationForStatus } from '../lib/ai/cos/cosUniversityAssemblyLine.ts'

const LINE_STATE_PATH = '/api/cron/cos-university-lifecycle-orchestrator'
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || ''
const SECRET = process.env.CRON_SECRET || ''
// The slowest station's cycle time, not the line's takt. Widening the line shrinks the takt to seconds while one
// unit still takes as long as the station's work, so sampling on the takt would read work-in-progress as a stoppage.
const TAKT_SECONDS = lineProofMinimumIntervalSeconds()
const REQUESTED_INTERVAL = Number.parseInt(String(process.env.LINE_PROOF_INTERVAL_SECONDS || ''), 10) || 0
// A scheduled proof run must wait at least one takt, or a no-movement result means nothing. A SHORTER interval is
// allowed only for a rehearsal, and it is safe by construction rather than by trust: `proveLineMovement` refuses to
// return `line_stopped` below the takt time, so a short run can only ever report `proven_moving` or `inconclusive`.
// It can confirm the harness works; it can never manufacture a failure or a pass.
const REHEARSAL = String(process.env.LINE_PROOF_ALLOW_SHORT_INTERVAL || '').trim() === 'true'
const INTERVAL_SECONDS = REHEARSAL && REQUESTED_INTERVAL > 0
  ? REQUESTED_INTERVAL
  : Math.max(TAKT_SECONDS + 60, REQUESTED_INTERVAL)

type LineState = {
  ok?: boolean
  schemaVersion?: string
  at?: string
  line?: Array<Record<string, unknown>>
  constraint?: Record<string, unknown> | null
  lineStops?: Array<Record<string, unknown>>
  units?: unknown
  unitsReported?: number
}

test.describe('COS University assembly line, proved from outside', () => {
  // One real takt plus the two reads, with generous headroom for a cold start on each.
  test.setTimeout((INTERVAL_SECONDS + 240) * 1000)

  test.beforeAll(() => {
    // Skip, never pass. If this prover cannot reach a real deployment it has proved nothing and must say so.
    test.skip(!BASE_URL, 'PLAYWRIGHT_BASE_URL is not set: this prover must run against a live deployment')
    test.skip(!SECRET, 'CRON_SECRET is not set: the line state cannot be read without it')
  })

  test('the line moves a real unit between two stations', async ({ request }) => {
    const read = async (): Promise<{ state: LineState; sample: LineSample }> => {
      const response = await request.get(`${BASE_URL}${LINE_STATE_PATH}`, {
        headers: { authorization: `Bearer ${SECRET}` },
        timeout: 120_000,
      })
      expect(response.status(), 'the line controller must answer an authorized read').toBe(200)
      const state = (await response.json()) as LineState
      expect(state.ok, 'the line controller reported a failure').toBe(true)
      expect(state.schemaVersion, 'the controller is not the assembly-line version').toBe('cos-university-assembly-line-controller-v2')
      return { state, sample: sampleFromLineState({ at: String(state.at || ''), units: state.units }) }
    }

    const first = await read()
    test.info().annotations.push({
      type: 'line-sample-1',
      description: `${first.sample.at} units=${first.sample.units.length} reported=${first.state.unitsReported ?? 0}`,
    })

    await new Promise(resolve => setTimeout(resolve, INTERVAL_SECONDS * 1000))

    const second = await read()
    test.info().annotations.push({
      type: 'line-sample-2',
      description: `${second.sample.at} units=${second.sample.units.length} reported=${second.state.unitsReported ?? 0}`,
    })

    const proof = proveLineMovement({ first: first.sample, second: second.sample })
    const summary = describeLineProof(proof)
    test.info().annotations.push({ type: 'line-proof', description: summary })
    if (REHEARSAL) {
      test.info().annotations.push({
        type: 'line-proof-rehearsal',
        description: `Harness rehearsal at ${INTERVAL_SECONDS}s, below the ${TAKT_SECONDS}s takt. Not a scheduled proof run.`,
      })
    }
    await test.info().attach('assembly-line-movement-proof.json', {
      body: JSON.stringify({
        summary,
        proof,
        constraint: second.state.constraint ?? null,
        stations: second.state.line ?? [],
        commit: String(process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12),
        provedAgainst: BASE_URL,
      }, null, 2),
      contentType: 'application/json',
    })

    // The one hard failure: material in, nothing out, past the station's own allowance.
    expect(proof.verdict, summary).not.toBe('line_stopped')

    // An inconclusive run is reported, never silently passed. It is a run that produced no proof.
    if (proof.verdict !== 'proven_moving') {
      test.info().annotations.push({
        type: 'line-proof-not-obtained',
        description: `NOT PROVEN this run: ${proof.reason}. The line is not failing, but nothing was demonstrated.`,
      })
    }
  })

  test('the controller agrees with the artifact table about where every unit is', async ({ request }) => {
    // The prover reads placement FROM the controller, so the one way that read could lie is the controller's station
    // disagreeing with the raw artifact status it was derived from. Checked here so the movement proof above rests on
    // something, rather than on the controller's self-consistency.
    const response = await request.get(`${BASE_URL}${LINE_STATE_PATH}`, {
      headers: { authorization: `Bearer ${SECRET}` },
      timeout: 120_000,
    })
    expect(response.status()).toBe(200)
    const state = (await response.json()) as LineState
    const rows = Array.isArray(state.units) ? (state.units as Array<Record<string, unknown>>) : []

    const mismatched = rows.filter(row => {
      const expected = stationForStatus(String(row.sourceStatus ?? ''))
      return !expected || expected.id !== String(row.station ?? '')
    }).slice(0, 20)

    expect(
      mismatched,
      `units whose station disagrees with their artifact status: ${JSON.stringify(mismatched)}`,
    ).toEqual([])

    // Rule 1: no unit without a destination. Every reported unit must carry a full identity and a placement.
    const incomplete = rows.filter(row =>
      !String(row.candidateId ?? '').trim()
      || !String(row.artifactHash ?? '').trim()
      || !String(row.station ?? '').trim()
      || !String(row.enteredAt ?? '').trim()).slice(0, 20)
    expect(incomplete, `units missing identity or placement: ${JSON.stringify(incomplete)}`).toEqual([])
  })

  test('no station is reported stopped by the controller itself', async ({ request }) => {
    // Independent of the movement proof: the controller's OWN line-stop detector should be quiet. When this fails and
    // the movement proof passes, a station is limping rather than stopped - which is the case worth looking at.
    const response = await request.get(`${BASE_URL}${LINE_STATE_PATH}`, {
      headers: { authorization: `Bearer ${SECRET}` },
      timeout: 120_000,
    })
    expect(response.status()).toBe(200)
    const state = (await response.json()) as LineState
    const stops = Array.isArray(state.lineStops) ? state.lineStops : []
    test.info().annotations.push({ type: 'controller-line-stops', description: JSON.stringify(stops) })
    expect(stops, `the controller reports stopped stations: ${JSON.stringify(stops)}`).toEqual([])
  })
})
