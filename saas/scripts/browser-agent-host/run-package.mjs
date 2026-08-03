// saas/scripts/browser-agent-host/run-package.mjs
//
// THE RUNNER. This is the "separately reviewed buyer runtime" that
// portable-browser-executor.ts names in its own rejection message — the component that
// takes a validated package and actually drives a browser.
//
// IT IS PLAIN JAVASCRIPT ON PURPOSE. It runs on a GitHub Actions worker with no build
// step and no TypeScript toolchain, and it imports nothing from saas/lib. A host that
// imported the portable would invert the dependency direction the whole architecture
// rests on: the portable must be copyable to a buyer without dragging a host with it.
// The cost of that independence is the small amount of duplicated validation below, and
// that cost is worth paying — every rule here is also enforced on the producing side, so
// the duplication is a second lock on the same door, not the only lock.
//
// WHAT IT WILL NOT DO, in the order it checks:
//   1. Run a package whose fingerprint does not recompute. A package edited in transit
//      is rejected before Chromium launches.
//   2. Visit anything outside the single declared origin — checked per navigation AND
//      re-checked after the page settles, because a redirect is a navigation the package
//      never approved.
//   3. Execute a step kind outside the six the task contract defines.
//   4. Execute a step whose id is not in approvedStepIds.
//   5. Continue past a checkpoint unless the run was explicitly told the approval
//      already happened. Silence is not approval.
//   6. Type a value the package spells out literally. Steps carry a valueRef; the value
//      itself comes from this host's secret store, by name.

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const packagePath = process.env.BROWSER_PACKAGE_PATH
const resultPath = process.env.BROWSER_RESULT_PATH
const evidenceDir = process.env.BROWSER_EVIDENCE_DIR
const allowCheckpoints = String(process.env.BROWSER_ALLOW_CHECKPOINTS || 'false') === 'true'

const ALLOWED_KINDS = new Set(['navigate', 'click', 'fill', 'wait_for', 'screenshot', 'checkpoint'])
const STEP_TIMEOUT_MS = 15_000

// Mirrors canonicalize/hashCanonical in browser-runtime-dry-run-schema.ts. Keys sorted
// recursively, arrays left in order, then sha256 of the JSON. If that implementation
// changes, this must change with it — and the mismatch will announce itself loudly here
// rather than quietly executing an unverified package.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonicalize(v)]),
    )
  }
  return value
}
function hashCanonical(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function fail(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

function loadValueRefs() {
  const raw = String(process.env.BROWSER_VALUE_REFS || '').trim()
  if (!raw) return {}
  let parsed
  try { parsed = JSON.parse(raw) } catch { fail('value_refs_unparseable', 'BROWSER_VALUE_REFS is not valid JSON.') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('value_refs_shape', 'BROWSER_VALUE_REFS must be a JSON object of reference name to value.')
  return parsed
}

// Exact origin comparison — scheme, host and port, nothing else. No wildcards, no
// prefix matching, no "ends with our domain": a check that accepts evil-example.com for
// example.com is the failure this whole product exists to prevent.
function originOf(url) {
  try { return new URL(url).origin } catch { return null }
}

async function main() {
  if (!packagePath || !resultPath || !evidenceDir) fail('missing_env', 'BROWSER_PACKAGE_PATH, BROWSER_RESULT_PATH and BROWSER_EVIDENCE_DIR are all required.')
  mkdirSync(evidenceDir, { recursive: true })

  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))

  // ── 1. Fingerprint ────────────────────────────────────────────────────────
  // Recomputed over exactly the fields the producer hashed, in the producer's order.
  const recomputed = hashCanonical({
    incidentId: pkg.incidentId,
    planId: pkg.planId,
    targetOrigin: pkg.targetOrigin,
    approvedStepIds: pkg.approvedStepIds,
    browserTask: pkg.browserTask,
    approvalRequirements: pkg.approvalRequirements,
    verificationRequirements: pkg.verificationRequirements,
    schemaVersion: pkg.schemaVersion,
  })
  if (recomputed !== pkg.packageFingerprint) {
    fail('fingerprint_mismatch', `Package fingerprint does not recompute. Expected ${pkg.packageFingerprint}, got ${recomputed}. Refusing to execute.`)
  }

  const declaredOrigin = originOf(pkg.targetOrigin)
  if (!declaredOrigin) fail('bad_target_origin', `targetOrigin ${pkg.targetOrigin} is not a valid origin.`)
  if (!pkg.targetOrigin.startsWith('https://') && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(pkg.targetOrigin)) {
    fail('insecure_origin', 'Plain http is confined to loopback. A real target must be https.')
  }

  const approved = new Set(pkg.approvedStepIds || [])
  const steps = (pkg.browserTask && pkg.browserTask.steps) || []
  if (!steps.length) fail('empty_task', 'Package contains no steps.')

  const valueRefs = loadValueRefs()
  const evidence = []
  const executed = []
  const skipped = []
  let status = 'completed'
  let stopReason = null

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  const record = (stepId, kind, summary, extra = {}) => {
    evidence.push({ stepId, kind, summary, at: new Date().toISOString(), ...extra })
  }

  // Any navigation the page performs on its own — a redirect, a meta refresh, a script
  // sending the browser elsewhere — is checked against the declared origin. This is the
  // check that catches a login page bouncing to an identity provider nobody approved.
  page.on('framenavigated', frame => {
    if (frame !== page.mainFrame()) return
    const landed = originOf(frame.url())
    if (landed && landed !== declaredOrigin) {
      stopReason = `Page navigated to ${landed}, which is outside the declared origin ${declaredOrigin}.`
    }
  })

  try {
    for (const step of steps) {
      if (stopReason) { skipped.push(step.id); continue }

      if (!ALLOWED_KINDS.has(step.kind)) fail('unknown_step_kind', `Step ${step.id} has kind ${step.kind}, which is not in the task contract.`)

      if (!approved.has(step.id)) {
        skipped.push(step.id)
        record(step.id, 'checkpoint', 'Step was not in approvedStepIds and was not executed.')
        continue
      }

      if (step.kind === 'checkpoint') {
        record(step.id, 'checkpoint', `Checkpoint reached: ${step.label}.`)
        if (!allowCheckpoints) {
          status = 'paused'
          stopReason = `Paused at checkpoint ${step.id} (${step.label}). Re-run with allow_checkpoints once the approval exists.`
          continue
        }
        executed.push(step.id)
        continue
      }

      if (step.kind === 'navigate') {
        const target = originOf(step.url)
        if (target !== declaredOrigin) fail('origin_violation', `Step ${step.id} navigates to ${target}, outside the declared origin ${declaredOrigin}.`)
        await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT_MS })
        // Read the address back from the browser rather than trusting the request:
        // a redirect is only visible from where the page actually landed.
        record(step.id, 'navigation', `Navigated to ${page.url()}.`, { landedUrl: page.url() })
        executed.push(step.id)
        continue
      }

      if (step.kind === 'wait_for') {
        await page.waitForSelector(step.selector, { timeout: step.timeoutMs || STEP_TIMEOUT_MS })
        record(step.id, 'interaction', `Selector appeared: ${step.selector}.`)
        executed.push(step.id)
        continue
      }

      if (step.kind === 'click') {
        await page.click(step.selector, { timeout: STEP_TIMEOUT_MS })
        record(step.id, 'interaction', `Clicked ${step.selector}.`)
        executed.push(step.id)
        continue
      }

      if (step.kind === 'fill') {
        if (!step.valueRef) fail('missing_value_ref', `Step ${step.id} is a fill with no valueRef.`)
        if (!Object.prototype.hasOwnProperty.call(valueRefs, step.valueRef)) {
          fail('unresolved_value_ref', `Step ${step.id} needs value reference "${step.valueRef}", which this host does not hold. Add it to the BROWSER_VALUE_REFS secret.`)
        }
        // fill() clears the field first; WebDriver-style appending would corrupt a
        // pre-populated form. The value never enters the evidence record.
        await page.fill(step.selector, String(valueRefs[step.valueRef]), { timeout: STEP_TIMEOUT_MS })
        record(step.id, 'interaction', `Filled ${step.selector} from reference ${step.valueRef}.`)
        executed.push(step.id)
        continue
      }

      if (step.kind === 'screenshot') {
        const file = join(evidenceDir, `${step.id}.png`)
        await page.screenshot({ path: file, fullPage: true })
        record(step.id, 'screenshot', `Captured ${step.label}.`, { artifact: `${step.id}.png` })
        executed.push(step.id)
        continue
      }
    }
  } catch (error) {
    status = 'failed'
    stopReason = `${error.code || 'step_failed'}: ${error.message}`
    record('run', 'error', stopReason)
  } finally {
    // Closed in a finally block because hosted browser vendors bill by the minute and a
    // leaked session bills until someone notices.
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }

  if (stopReason && status === 'completed') status = 'blocked'

  const expectedOrder = (pkg.verificationRequirements && pkg.verificationRequirements.expectedStepCompletionOrder) || []
  const orderHeld = JSON.stringify(executed) === JSON.stringify(expectedOrder.filter(id => approved.has(id)))

  const result = {
    packageId: pkg.packageId,
    dispatchId: pkg.dispatchId,
    incidentId: pkg.incidentId,
    planId: pkg.planId,
    packageFingerprint: pkg.packageFingerprint,
    host: 'github-actions',
    status,
    stopReason,
    executedStepIds: executed,
    skippedStepIds: skipped,
    // Deliberately NOT called 'verified'. This host reports what it did; the verifier
    // that owns the plan's own verification steps decides whether the repair worked.
    completionOrderMatchedPlan: orderHeld,
    evidence,
    completedAt: new Date().toISOString(),
    schemaVersion: 'browser-host-result-v1',
  }

  writeFileSync(resultPath, JSON.stringify(result, null, 2))
  console.log(`status=${status} executed=${executed.length} skipped=${skipped.length}`)
  if (stopReason) console.log(stopReason)
  if (status === 'failed') process.exit(1)
}

main().catch(error => {
  const payload = {
    host: 'github-actions',
    status: 'failed',
    stopReason: `${error.code || 'host_error'}: ${error.message}`,
    completedAt: new Date().toISOString(),
    schemaVersion: 'browser-host-result-v1',
  }
  try { writeFileSync(process.env.BROWSER_RESULT_PATH || 'browser-result.json', JSON.stringify(payload, null, 2)) } catch {}
  console.error(payload.stopReason)
  process.exit(1)
})
