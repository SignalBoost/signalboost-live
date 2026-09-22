import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import type { BuilderBrowserCliPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import {
  BUILDER_PLAYWRIGHT_CLI_VERSION,
  classifyBuilderPlaywrightCliFailure,
  createBuilderPlaywrightCliPort,
} from '../lib/builder/playwright-cli-port.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

function commandResult(exitCode = 0, stdout = '', stderr = '') {
  return {
    exitCode,
    async stdout() { return stdout },
    async stderr() { return stderr },
  }
}

const idleRunner: BuilderRunnerPort = {
  async run() {
    assert.fail('Playwright CLI diagnostics must not execute through BuilderRunnerPort')
  },
}

test('ordinary Builder never receives the owner Playwright CLI diagnostic lane', async () => {
  let created = 0
  const port = createBuilderPlaywrightCliPort({
    ownerAuthorized: false,
    createSandbox: (async () => {
      created += 1
      throw new Error('must not create')
    }) as any,
  })
  assert.equal(await port.capabilities(), null)
  assert.equal(created, 0)
  await port.close()
})

test('Playwright CLI rejects off-origin navigation before sandbox creation', async () => {
  let created = 0
  const port = createBuilderPlaywrightCliPort({
    ownerAuthorized: true,
    env: { BUILDER_PLAYWRIGHT_CLI_ALLOWED_ORIGINS: 'https://itmounts.com' },
    createSandbox: (async () => {
      created += 1
      throw new Error('must not create')
    }) as any,
  })
  await assert.rejects(
    () => port.invoke({ action: 'open', url: 'https://example.com/' }),
    /builder_browser_cli_origin_rejected/,
  )
  assert.equal(created, 0)
})

test('Playwright CLI bootstraps host-owned package before locking egress to approved hosts', async () => {
  const steps: string[] = []
  const commands: Array<{ cmd: string; args: string[]; sudo?: boolean }> = []
  const written: string[] = []
  const fake = {
    async updateNetworkPolicy(policy: unknown) {
      steps.push(`network:${JSON.stringify(policy)}`)
    },
    async runCommand(command: any) {
      commands.push({ cmd: command.cmd, args: [...(command.args || [])], sudo: command.sudo })
      steps.push(`command:${command.cmd} ${(command.args || []).join(' ')}`)
      if (command.cmd === 'node' && command.args?.[0] === '-e') {
        return commandResult(0, '/tmp/cos-builder-playwright-cli/pw-browsers/chromium-1234/chrome-linux/chrome')
      }
      if (command.cmd.endsWith('/playwright-cli') && command.args?.includes('open')) {
        return commandResult(0, '### Page\n- Page URL: https://itmounts.com/\n- Page Title: iTMounts')
      }
      return commandResult()
    },
    async writeFiles(files: any[]) {
      steps.push(`write:${files.map(file => file.path).join(',')}`)
      for (const file of files) written.push(Buffer.from(file.content).toString('utf8'))
    },
    async stop() {
      steps.push('stop')
    },
  }
  const port = createBuilderPlaywrightCliPort({
    ownerAuthorized: true,
    env: { BUILDER_PLAYWRIGHT_CLI_ALLOWED_ORIGINS: 'https://itmounts.com' },
    createSandbox: (async (options: any) => {
      assert.equal(options.image, 'vercel/sandbox/node:24')
      assert.equal(options.runtime, undefined)
      assert.equal(options.networkPolicy, 'deny-all')
      assert.equal(options.persistent, false)
      assert.equal(options.env.PLAYWRIGHT_MCP_WEBMCP, 'false')
      assert.equal(options.env.PLAYWRIGHT_MCP_CONFIG, undefined)
      assert.equal(options.env.PLAYWRIGHT_BROWSERS_PATH, '/tmp/cos-builder-playwright-cli/pw-browsers')
      return fake
    }) as any,
  })

  const capabilities = await port.capabilities()
  assert.deepEqual(capabilities?.allowedOrigins, ['https://itmounts.com'])
  assert.ok(capabilities?.actions.includes('snapshot'))
  assert.ok(!capabilities?.actions.includes('fill' as any))

  const result = await port.invoke({ action: 'open', url: 'https://itmounts.com/' })
  assert.equal(result.ok, true)
  assert.match(result.stdout, /Page Title: iTMounts/)
  const snapshot = await port.invoke({ action: 'snapshot' })
  assert.equal(snapshot.ok, true)
  assert.ok(commands.some(command => command.cmd === 'npm' && command.args.includes(`@playwright/cli@${BUILDER_PLAYWRIGHT_CLI_VERSION}`)))
  assert.ok(commands.some(command =>
    command.cmd === 'node'
      && command.sudo === true
      && command.args.join(' ') === '/tmp/cos-builder-playwright-cli/node_modules/playwright/cli.js install-deps chromium'
  ))
  assert.ok(commands.some(command =>
    command.cmd === 'node'
      && command.sudo !== true
      && command.args.join(' ') === '/tmp/cos-builder-playwright-cli/node_modules/playwright/cli.js install chromium'
  ))
  assert.ok(commands.some(command => command.cmd === 'node' && command.args[0] === '-e'))
  assert.ok(commands.some(command => command.cmd.includes('/pw-browsers/') && command.args.join(' ') === '--version'))
  assert.ok(written.some(value =>
    value.includes('"browserName":"chromium"')
      && value.includes('"executablePath":"/tmp/cos-builder-playwright-cli/pw-browsers/chromium-1234/chrome-linux/chrome"')
      && !value.includes('"saveSession"')
      && !value.includes('"outputMaxSize"')
      && !value.includes('"settle"')
  ))
  const dependencyBootstrap = steps.findIndex(step => step.includes('node /tmp/cos-builder-playwright-cli/node_modules/playwright/cli.js install-deps chromium'))
  const browserDownload = steps.findIndex(step => step.includes('node /tmp/cos-builder-playwright-cli/node_modules/playwright/cli.js install chromium'))
  const lockdown = steps.findIndex(step => step === 'network:{"allow":["itmounts.com"]}')
  const open = steps.findIndex(step => step.includes('playwright-cli open https://itmounts.com/'))
  const snapshotCommand = steps.findIndex(step => step.includes('playwright-cli snapshot'))
  assert.ok(dependencyBootstrap >= 0 && browserDownload > dependencyBootstrap, JSON.stringify(steps))
  assert.ok(lockdown > browserDownload, JSON.stringify(steps))
  assert.ok(lockdown >= 0 && open > lockdown, JSON.stringify(steps))
  assert.ok(snapshotCommand > open, JSON.stringify(steps))
  assert.ok(!commands.some(command => command.cmd.endsWith('/playwright-cli') && command.args.includes('--config')))
  assert.ok(!commands.some(command => command.cmd === 'sh' || command.cmd === 'bash'))

  await port.close()
  assert.equal(steps.at(-1), 'stop')
})

test('Playwright CLI failure classifier emits bounded machine codes only', () => {
  assert.equal(
    classifyBuilderPlaywrightCliFailure('Host system is missing dependencies to run browsers'),
    'browser_missing_dependencies',
  )
  assert.equal(
    classifyBuilderPlaywrightCliFailure('builder_browser_cli_browser_deps_failed: apt failed'),
    'browser_missing_dependencies',
  )
  assert.equal(
    classifyBuilderPlaywrightCliFailure("Executable doesn't exist at /tmp/chromium"),
    'browser_not_installed',
  )
  assert.equal(
    classifyBuilderPlaywrightCliFailure('builder_browser_cli_browser_probe_failed: missing'),
    'browser_not_installed',
  )
  assert.equal(
    classifyBuilderPlaywrightCliFailure('browserType.launch: Failed to launch browser process'),
    'browser_launch_failed',
  )
  assert.equal(
    classifyBuilderPlaywrightCliFailure('page.goto: net::ERR_NAME_NOT_RESOLVED'),
    'navigation_failed',
  )
  assert.equal(
    classifyBuilderPlaywrightCliFailure('Origin request was blocked by network policy'),
    'network_policy_failed',
  )
  assert.equal(
    classifyBuilderPlaywrightCliFailure('error: unknown option --bad'),
    'config_invalid',
  )
  assert.equal(classifyBuilderPlaywrightCliFailure('unclassified failure'), 'cli_exit_nonzero')
})

test('nonzero CLI result reports a sanitized failure code without logging raw stderr', async () => {
  const originalInfo = console.info
  const events: unknown[][] = []
  console.info = (...args: unknown[]) => { events.push(args) }
  try {
    const fake = {
      async updateNetworkPolicy() {},
      async runCommand(command: any) {
        if (command.cmd === 'node' && command.args?.[0] === '-e') {
          return commandResult(0, '/tmp/cos-builder-playwright-cli/pw-browsers/chromium-1234/chrome-linux/chrome')
        }
        if (command.cmd.endsWith('/playwright-cli') && command.args?.includes('open')) {
          return commandResult(1, '', 'Host system is missing dependencies to run browsers: SECRET_RAW_DETAIL')
        }
        return commandResult()
      },
      async writeFiles() {},
      async stop() {},
    }
    const port = createBuilderPlaywrightCliPort({
      ownerAuthorized: true,
      env: { BUILDER_PLAYWRIGHT_CLI_ALLOWED_ORIGINS: 'https://itmounts.com' },
      createSandbox: (async () => fake) as any,
    })
    const result = await port.invoke({ action: 'open', url: 'https://itmounts.com/' })
    assert.equal(result.ok, false)
    assert.equal(result.failureCode, 'browser_missing_dependencies')
    const encoded = JSON.stringify(events)
    assert.match(encoded, /browser_missing_dependencies/)
    assert.doesNotMatch(encoded, /SECRET_RAW_DETAIL/)
    await port.close()
  } finally {
    console.info = originalInfo
  }
})

test('failed bootstrap destroys the half-initialized Sandbox and retries cleanly', async () => {
  let created = 0
  let stopped = 0

  function fake(failDeps: boolean) {
    return {
      async updateNetworkPolicy() {},
      async runCommand(command: any) {
        if (failDeps && command.cmd === 'node' && command.args?.includes('install-deps')) {
          return commandResult(1, '', 'dependency install failed')
        }
        if (command.cmd === 'node' && command.args?.[0] === '-e') {
          return commandResult(0, '/tmp/cos-builder-playwright-cli/pw-browsers/chromium-1234/chrome-linux/chrome')
        }
        if (command.cmd.endsWith('/playwright-cli') && command.args?.includes('open')) {
          return commandResult(0, '### Page\n- Page URL: https://itmounts.com/\n- Page Title: iTMounts')
        }
        return commandResult()
      },
      async writeFiles() {},
      async stop() { stopped += 1 },
    }
  }

  const port = createBuilderPlaywrightCliPort({
    ownerAuthorized: true,
    env: { BUILDER_PLAYWRIGHT_CLI_ALLOWED_ORIGINS: 'https://itmounts.com' },
    createSandbox: (async () => {
      created += 1
      return fake(created === 1)
    }) as any,
  })

  const first = await port.invoke({ action: 'open', url: 'https://itmounts.com/' })
  assert.equal(first.ok, false)
  assert.equal(first.failureCode, 'browser_missing_dependencies')
  assert.equal(stopped, 1)

  const second = await port.invoke({ action: 'open', url: 'https://itmounts.com/' })
  assert.equal(second.ok, true)
  assert.equal(created, 2)
  await port.close()
  assert.equal(stopped, 2)
})

test('Playwright CLI production telemetry is metadata-only', () => {
  const source = readFileSync(new URL('../lib/builder/playwright-cli-port.ts', import.meta.url), 'utf8')
  assert.match(source, /\[builder_browser_cli_action\]/)
  assert.match(source, /action: observed\.action/)
  assert.match(source, /ok: observed\.ok/)
  assert.match(source, /exitCode: observed\.exitCode/)
  assert.match(source, /timedOut: observed\.timedOut/)
  assert.match(source, /failureCode/)
  assert.doesNotMatch(source, /console\.info\([^\n]*stdout/)
  assert.doesNotMatch(source, /console\.info\([^\n]*stderr/)
  assert.doesNotMatch(source, /console\.info\([^\n]*url/)
})

test('Builder can consume Playwright CLI evidence in the next reasoning round', async () => {
  const prompts: string[] = []
  const calls: string[] = []
  const browser: BuilderBrowserCliPort = {
    async capabilities() {
      return { actions: ['open', 'snapshot', 'console', 'requests', 'close'], allowedOrigins: ['https://itmounts.com'] }
    },
    async invoke(input) {
      calls.push(input.action)
      return {
        ok: true,
        action: input.action,
        exitCode: 0,
        stdout: '### Page\n- Page URL: https://itmounts.com/\n- Page Title: iTMounts',
        stderr: '',
        timedOut: false,
      }
    },
    async close() {},
  }
  const responses = [
    JSON.stringify({ type: 'tool', toolId: 'browser_cli', input: { action: 'open', url: 'https://itmounts.com/' } }),
    JSON.stringify({ type: 'answer', answer: 'The live page loaded successfully.' }),
  ]
  const result = await new BuilderToolLoop({
    async generate(input) {
      prompts.push(input.prompt)
      return responses.shift() || null
    },
  }, new InMemoryBuilderWorkspace(), idleRunner, undefined, browser).run({
    objective: 'Inspect the live iTMounts page and report whether it loads.',
    workspaceId: 'owner:browser-cli',
    maxRounds: 3,
  })

  assert.equal(result.ok, true)
  assert.deepEqual(calls, ['open'])
  assert.match(prompts[0] || '', /PLAYWRIGHT CLI BROWSER DIAGNOSTICS/)
  assert.match(prompts[1] || '', /Page Title: iTMounts/)
})

test('Builder checkpoint drops raw Playwright CLI evidence and stale browser refs', async () => {
  let browserCalls = 0
  const browser: BuilderBrowserCliPort = {
    async capabilities() {
      return { actions: ['snapshot'], allowedOrigins: ['https://itmounts.com'] }
    },
    async invoke() {
      browserCalls += 1
      return {
        ok: true,
        action: 'snapshot',
        exitCode: 0,
        stdout: 'PRIVATE_LIVE_PAGE_EVIDENCE ref=e42',
        stderr: '',
        timedOut: false,
      }
    },
    async close() {},
  }
  const result = await new BuilderToolLoop({
    async generate() {
      return JSON.stringify({ type: 'tool', toolId: 'browser_cli', input: { action: 'snapshot' } })
    },
  }, new InMemoryBuilderWorkspace(), idleRunner, undefined, browser).run({
    objective: 'Inspect the live page.',
    workspaceId: 'owner:browser-cli-checkpoint',
    maxRounds: 3,
    shouldPause: () => browserCalls > 0,
  })

  assert.equal(result.ok, false)
  if (result.ok || !result.checkpoint) assert.fail('checkpoint required')
  assert.equal(result.trace.some(item => item.toolId === 'browser_cli' && item.ok), true)
  assert.equal(result.checkpoint.trace.some(item => item.toolId === 'browser_cli'), false)
  assert.equal(JSON.stringify(result.checkpoint).includes('PRIVATE_LIVE_PAGE_EVIDENCE'), false)
})
