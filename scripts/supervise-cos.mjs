#!/usr/bin/env node
/** Read-only/repairable Supervisor guard for COS ingress integrity. */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const concierge = resolve(root, 'app/api/concierge/route.ts')
const supportImport = '@' + '/app/api/support/route'
const thinEntryPoint = `/**\n * Public Concierge ingress is intentionally a thin alias for the governed COS\n * support handler. Do not add regex routers or response workflows here.\n */\nexport { dynamic, GET, POST } from '${supportImport}'\n`
const forbidden = [/new\s+RegExp\s*\(/, /\/(?:[^/\\]|\\.)+\/[gimsuy]*\s*\.test\s*\(/, /if\s*\([^\n]*(?:query|message|prompt)[^\n]*\)/i, /answerSignalBoostConcierge/]
const source = readFileSync(concierge, 'utf8')
const isThin = source === thinEntryPoint
const bypass = forbidden.some(pattern => pattern.test(source))
const violation = !isThin || bypass

if (violation && process.argv.includes('--restore')) {
  writeFileSync(concierge, thinEntryPoint)
  console.error('Supervisor alert: restored the canonical thin /api/concierge entry point; owner review is required.')
  process.exit(0)
}
if (violation) {
  console.error('Supervisor alert: /api/concierge contains a bypass or is not the canonical thin entry point. Run `node scripts/supervise-cos.mjs --restore`, review the change, and notify the owner.')
  process.exit(1)
}
console.log('Supervisor: /api/concierge is a canonical thin COS entry point')
