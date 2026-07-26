// saas/scripts/run-self-healing-acceptance.mjs
//
// Runs the Self-Healing Supervisor acceptance scenario against a REAL HostContext and writes
// the result to disk as the buyer's acceptance record.
//
// WHY THIS EXISTS. Item 7 of the integration guide is the last thing standing between this
// portable and "live", and it is the one item no amount of code can close on the buyer's
// behalf: someone has to run it against their own vault, their own channel, their own
// approver directory. The harness itself has existed since the acceptance work landed, but
// invoking it still meant writing a throwaway script — which is exactly the kind of friction
// that turns "we ran the acceptance test" into something nobody actually did.
//
//   node scripts/run-self-healing-acceptance.mjs <host-module> [--out <file>] [--category <c>]
//
// <host-module> is a path to a module whose default export is a HostContext, or a function
// returning one (sync or async). It is YOUR file: it wires your vault, your sink, your
// directory. Nothing here supplies a default, because a default would be the vendor deciding
// who approves your destructive changes.
//
// Runs every risk category unless --category narrows it, because approver routing is
// per-category and a single-category pass proves only that one route.
//
// EXIT CODE IS THE POINT: 0 only if every category passes every check. Wire it into a
// deployment pipeline and a regression in approval gating fails the deploy.
//
// SAFE TO RUN REPEATEDLY, including against production wiring: no network call, no provider
// call, no real repair. The consequential step is required to pause, so nothing consequential
// can execute. Your notification channel does receive a real message — that is deliberate,
// since a stubbed channel would not be testing the thing you need tested.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const CATEGORIES = ['financial', 'destructive', 'credential_security']

function usage(message) {
  console.error(`\n  ${message}\n`)
  console.error('  usage: node scripts/run-self-healing-acceptance.mjs <host-module> [--out <file>] [--category <c>]')
  console.error('         <host-module>  module whose default export is a HostContext (or a function returning one)')
  console.error('         --out          write the evidence record here (default: self-healing-acceptance.json)')
  console.error(`         --category     one of ${CATEGORIES.join(', ')}; default runs all three\n`)
  process.exit(2)
}

const args = process.argv.slice(2)
if (args.length === 0 || args[0].startsWith('-')) usage('a host module path is required')

const hostModulePath = args[0]
const flag = name => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const outPath = flag('out') ?? 'self-healing-acceptance.json'
const only = flag('category')
if (only && !CATEGORIES.includes(only)) usage(`unknown category "${only}"`)

const { runAcceptanceScenario } = await import('../lib/supervisor/portable/acceptance-harness.ts')

let host
try {
  const module = await import(pathToFileURL(resolve(hostModulePath)).href)
  const exported = module.default ?? module.host ?? module.hostContext
  if (!exported) usage(`${hostModulePath} has no default export (or named "host") to use as the HostContext`)
  host = typeof exported === 'function' ? await exported() : exported
} catch (error) {
  usage(`could not load ${hostModulePath}: ${error instanceof Error ? error.message : error}`)
}

for (const required of ['secrets', 'notifications', 'approvers', 'branding']) {
  // Checked here rather than left to the harness so the failure names the missing piece
  // instead of surfacing as an unexplained failed check five lines later.
  if (!host?.[required]) usage(`the HostContext from ${hostModulePath} is missing "${required}"`)
}

const categories = only ? [only] : CATEGORIES
const runs = []
for (const dangerousCategory of categories) {
  const result = await runAcceptanceScenario({ host, dangerousCategory })
  runs.push({ category: dangerousCategory, ...result })
  console.log(`\n── ${dangerousCategory} ──`)
  console.log(result.summary)
}

const passed = runs.every(run => run.passed)
const record = {
  schemaVersion: 'self-healing-acceptance-record-v1',
  portable: 'self-healing-supervisor',
  ranAt: new Date().toISOString(),
  hostModule: hostModulePath,
  productName: host.branding?.productName ?? null,
  passed,
  categories: categories,
  runs,
}

try {
  writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n')
  console.log(`\nevidence record → ${outPath}`)
} catch (error) {
  // A failed write must not turn a passing acceptance run into a failure, but the operator
  // needs to know the record they were told to keep does not exist.
  console.error(`\ncould not write the evidence record to ${outPath}: ${error instanceof Error ? error.message : error}`)
}

console.log(`\nSelf-Healing Supervisor acceptance across ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}: ${passed ? 'PASSED' : 'FAILED'}\n`)
process.exit(passed ? 0 : 1)
