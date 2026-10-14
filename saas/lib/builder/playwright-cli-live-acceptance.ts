import { createBuilderPlaywrightCliPort } from './playwright-cli-port.ts'

export type BuilderPlaywrightCliLiveAcceptanceCheck = Readonly<{
  name: string
  passed: boolean
  detail: string
}>

export type BuilderPlaywrightCliLiveAcceptanceResult = Readonly<{
  ok: boolean
  schemaVersion: 'builder-playwright-cli-live-acceptance-v2'
  checks: readonly BuilderPlaywrightCliLiveAcceptanceCheck[]
  privacy: Readonly<{
    pageBodiesStored: false
    credentialsStored: false
    browserEvidenceStored: false
    sandboxDestroyed: true
  }>
}>

function bounded(value: unknown, max = 120): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function browserDiagnosticSummary(action: 'console' | 'requests', output: string): { clear: boolean; count: number; complete: boolean } {
  // The sandbox CLI caps stdout to 16 KiB; a full buffer may omit later failures.
  const complete = output.length < 16_000
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  // CLI emits headings and an explicit no-events marker; do not treat headings as failures.
  const entries = lines.filter(line => action === 'console'
    ? /^(?:\[?error\]?\s*[:\-]|\[console\.error\]|(?:\d+\s+)?error\s*[:\-])/i.test(line)
    : /(?:\b(?:net::ERR_[A-Z_]+|HTTP\s+[45]\d\d|status\s*[:=]\s*[45]\d\d|\b[45]\d\d\s+(?:GET|POST|PUT|PATCH|DELETE)\b)\b)/i.test(line))
  return { clear: complete && entries.length === 0, count: entries.length, complete }
}

function observationDetail(result: {
  exitCode: number
  timedOut: boolean
  failureCode?: string
}): string {
  return [
    `exit=${result.exitCode}`,
    `timeout=${result.timedOut ? 'true' : 'false'}`,
    ...(result.failureCode ? [`failure=${bounded(result.failureCode)}`] : []),
  ].join('; ')
}

export async function runBuilderPlaywrightCliLiveAcceptance(input: { targetUrl?: string; expectedText?: string } = {}): Promise<BuilderPlaywrightCliLiveAcceptanceResult> {
  const checks: BuilderPlaywrightCliLiveAcceptanceCheck[] = []
  const port = createBuilderPlaywrightCliPort({
    ownerAuthorized: true,
    env: {
      ...process.env,
      BUILDER_PLAYWRIGHT_CLI_ALLOWED_ORIGINS: 'https://itmounts.com,https://www.itmounts.com',
    },
  })

  try {
    const capability = await port.capabilities()
    checks.push(Object.freeze({
      name: 'owner_builder_cli_capability',
      passed: Boolean(
        capability
        && ['open', 'snapshot', 'console', 'requests', 'close'].every(action => capability.actions.includes(action as any)),
      ),
      detail: capability ? `actions=${capability.actions.join(',')}` : 'missing',
    }))

    const targetUrl = input.targetUrl || 'https://itmounts.com/'
    const opened = await port.invoke({ action: 'open', url: targetUrl })
    checks.push(Object.freeze({
      name: 'itmounts_open',
      passed: opened.ok,
      detail: observationDetail(opened),
    }))

    if (opened.ok) {
      const snapshot = await port.invoke({ action: 'snapshot' })
      checks.push(Object.freeze({
        name: 'live_snapshot',
        passed: snapshot.ok && (input.expectedText ? snapshot.stdout.includes(input.expectedText) : /Page|iTMounts|itmounts/i.test(snapshot.stdout)),
        detail: `${observationDetail(snapshot)}; repairEvidence=${input.expectedText ? (snapshot.stdout.includes(input.expectedText) ? 'present' : 'missing') : 'smoke'}`,
      }))

      const consoleResult = await port.invoke({ action: 'console', level: 'error' })
      checks.push(Object.freeze({
        name: 'console_diagnostics',
        passed: consoleResult.ok && browserDiagnosticSummary('console', consoleResult.stdout).clear,
        detail: `${observationDetail(consoleResult)}; observedErrors=${browserDiagnosticSummary('console', consoleResult.stdout).count}; complete=${browserDiagnosticSummary('console', consoleResult.stdout).complete}`,
      }))

      const requests = await port.invoke({ action: 'requests' })
      checks.push(Object.freeze({
        name: 'network_diagnostics',
        passed: requests.ok && browserDiagnosticSummary('requests', requests.stdout).clear,
        detail: `${observationDetail(requests)}; observedFailures=${browserDiagnosticSummary('requests', requests.stdout).count}; complete=${browserDiagnosticSummary('requests', requests.stdout).complete}`,
      }))

      const closed = await port.invoke({ action: 'close' })
      checks.push(Object.freeze({
        name: 'browser_close',
        passed: closed.ok,
        detail: observationDetail(closed),
      }))
    }
  } catch (error) {
    checks.push(Object.freeze({
      name: 'runtime',
      passed: false,
      detail: bounded(error instanceof Error ? error.message : 'unknown_error', 200),
    }))
  } finally {
    await port.close().catch(() => undefined)
  }

  const ok = checks.length >= 6 && checks.every(check => check.passed)
  return Object.freeze({
    ok,
    schemaVersion: 'builder-playwright-cli-live-acceptance-v2',
    checks: Object.freeze(checks),
    privacy: Object.freeze({
      pageBodiesStored: false,
      credentialsStored: false,
      browserEvidenceStored: false,
      sandboxDestroyed: true,
    }),
  })
}
