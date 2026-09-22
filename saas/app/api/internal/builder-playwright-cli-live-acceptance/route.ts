import { NextResponse } from 'next/server'
import { createBuilderPlaywrightCliPort } from '@/lib/builder/playwright-cli-port'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

type Check = Readonly<{ name: string; passed: boolean; detail: string }>

function bounded(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 240)
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const checks: Check[] = []
  const port = createBuilderPlaywrightCliPort({
    ownerAuthorized: true,
    env: {
      ...process.env,
      BUILDER_PLAYWRIGHT_CLI_ALLOWED_ORIGINS: 'https://itmounts.com,https://www.itmounts.com',
    },
  })

  try {
    const capability = await port.capabilities()
    checks.push({
      name: 'owner_builder_cli_capability',
      passed: Boolean(capability?.actions.includes('open') && capability.actions.includes('snapshot')),
      detail: capability ? `actions=${capability.actions.join(',')}` : 'missing',
    })

    const opened = await port.invoke({ action: 'open', url: 'https://itmounts.com/' })
    checks.push({
      name: 'itmounts_open',
      passed: opened.ok,
      detail: `exit=${opened.exitCode}; stderr=${bounded(opened.stderr)}`,
    })

    if (opened.ok) {
      const snapshot = await port.invoke({ action: 'snapshot' })
      checks.push({
        name: 'live_snapshot',
        passed: snapshot.ok && /Page|iTMounts|itmounts/i.test(snapshot.stdout),
        detail: `exit=${snapshot.exitCode}; evidence=${bounded(snapshot.stdout)}`,
      })

      const consoleResult = await port.invoke({ action: 'console', level: 'error' })
      checks.push({
        name: 'console_diagnostics',
        passed: consoleResult.ok,
        detail: `exit=${consoleResult.exitCode}; stderr=${bounded(consoleResult.stderr)}`,
      })

      const requests = await port.invoke({ action: 'requests' })
      checks.push({
        name: 'network_diagnostics',
        passed: requests.ok,
        detail: `exit=${requests.exitCode}; evidence=${bounded(requests.stdout)}`,
      })
    }

    const failed = checks.filter(check => !check.passed)
    return NextResponse.json({
      ok: failed.length === 0,
      schemaVersion: 'builder-playwright-cli-preview-live-acceptance-v1',
      checks,
      privacy: {
        pageBodiesStored: false,
        credentialsStored: false,
        sandboxDestroyed: true,
      },
    }, { status: failed.length === 0 ? 200 : 503 })
  } catch (error) {
    checks.push({
      name: 'runtime',
      passed: false,
      detail: bounded(error instanceof Error ? error.message : 'unknown_error'),
    })
    return NextResponse.json({
      ok: false,
      schemaVersion: 'builder-playwright-cli-preview-live-acceptance-v1',
      checks,
    }, { status: 503 })
  } finally {
    await port.close().catch(() => undefined)
  }
}
