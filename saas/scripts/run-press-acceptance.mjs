// saas/scripts/run-press-acceptance.mjs
//
// Runs the Press & Media acceptance scenario against a REAL set of ports and writes the
// result to disk as the buyer's acceptance record.
//
//   node scripts/run-press-acceptance.mjs <ports-module> --self <your-address> [--out <file>] [--provider <id>]
//
// <ports-module> is a path to a module whose default export is either a PortBundle, or an
// object { ports, registry }, or a function returning one of those (sync or async). It is
// YOUR file: it wires your model, your mail transport, your company record. Nothing here
// supplies a default, because a default would mean testing our wiring instead of yours.
//
// --self is REQUIRED and must be an address YOU control. The scenario sends one real message
// there. It is real because a stubbed transport proves nothing about whether your mail
// actually leaves. Never point it at a journalist or a publication.
//
// EXIT CODE IS THE POINT: 0 only if every check passes. Wire it into a deployment pipeline and
// a regression in the anti-fabrication rules fails the deploy.
//
// If your ports module imports through the repository's '@/' alias, run it with
//   node --import ./scripts/test-alias-loader.mjs --experimental-strip-types scripts/run-press-acceptance.mjs …

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function usage(message) {
  console.error(`\n  ${message}\n`)
  console.error('  usage: node scripts/run-press-acceptance.mjs <ports-module> --self <address> [--out <file>] [--provider <id>]')
  console.error('         <ports-module>  module whose default export is a PortBundle, { ports, registry }, or a function returning one')
  console.error('         --self          an address YOU control; the run sends one real message there')
  console.error('         --out           write the evidence record here (default: press-media-acceptance.json)')
  console.error('         --provider      provider id to exercise (default: free_submission)')
  console.error('')
  process.exit(2)
}

const args = process.argv.slice(2)
const FLAGS_WITH_VALUES = ['self', 'out', 'provider']

// Positions consumed as a flag's value, so the positional argument is found by elimination
// rather than by guessing at ordering.
const consumed = new Set()
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return undefined
  return args[i + 1]
}

for (const name of FLAGS_WITH_VALUES) {
  const i = args.indexOf(`--${name}`)
  if (i !== -1) {
    consumed.add(i)
    consumed.add(i + 1)
  }
}

const modulePath = args.find((a, i) => !consumed.has(i) && !a.startsWith('--'))
if (!modulePath) usage('No ports module was given.')

const selfAddress = flag('self')
if (!selfAddress) usage('--self is required. The run sends a real message and will not guess a recipient.')

const outFile = flag('out') || 'press-media-acceptance.json'
const providerId = flag('provider') || 'free_submission'

let loaded
try {
  loaded = await import(pathToFileURL(resolve(process.cwd(), modulePath)).href)
} catch (error) {
  usage(`Could not load ${modulePath}: ${error?.message || error}`)
}

let exported = loaded?.default
if (typeof exported === 'function') {
  try {
    exported = await exported()
  } catch (error) {
    console.error(`\n  Building your ports threw before acceptance could start: ${error?.message || error}\n`)
    process.exit(1)
  }
}

if (!exported || typeof exported !== 'object') {
  usage(`${modulePath} default-exports ${typeof exported}. It must export a PortBundle, { ports, registry }, or a function returning one.`)
}

// Accept either shape. A PortBundle is recognised by its required members; anything else must
// name its ports explicitly, so a wrong-shaped module is reported here rather than surfacing
// later as an unexplained failed check.
const looksLikePorts = exported.ai && exported.email && exported.notify
const ports = looksLikePorts ? exported : exported.ports
const registry = looksLikePorts ? undefined : exported.registry

if (!ports || !ports.ai || !ports.email || !ports.notify) {
  usage(`${modulePath} did not provide ports with ai, email and notify. Those three are required.`)
}

// Imported here rather than at the top so a bad module path fails with the usage text above
// instead of a resolution error from a file the operator did not mention.
const { runPressAcceptance } = await import('../press-media-core/acceptance-harness.ts')

console.log(`\n  Press & Media acceptance — provider ${providerId}`)
console.log(`  A real message will be sent to ${selfAddress}\n`)

let result
try {
  result = await runPressAcceptance({ ports, selfAddress, registry, providerId })
} catch (error) {
  // The harness is written not to throw. If it did, that is worth reporting loudly rather
  // than swallowing into a plausible-looking failure record.
  console.error(`  The harness itself threw, which it is designed not to do: ${error?.message || error}`)
  process.exit(1)
}

console.log(result.summary)
console.log('')

try {
  writeFileSync(resolve(process.cwd(), outFile), `${JSON.stringify(result, null, 2)}\n`)
  console.log(`  evidence record written to ${outFile}`)
} catch (error) {
  // A failed write does not change whether the deployment passed. Report it; do not fail a
  // passing run over a file permission.
  console.error(`  WARNING: could not write ${outFile}: ${error?.message || error}`)
}

if (result.passed) {
  console.log('  PASS — keep this record. It is the acceptance evidence for this deployment.\n')
} else {
  console.log('  FAIL — do not point this deployment at a real editor until every check passes.\n')
}

process.exit(result.passed ? 0 : 1)
