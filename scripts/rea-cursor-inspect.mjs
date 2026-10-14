#!/usr/bin/env node
/**
 * Run morluto/rea against an authorized local Cursor Electron application bundle.
 * This script never uploads extracted code, tokens, or REA output.
 *
 * Usage:
 *   node scripts/rea-cursor-inspect.mjs /absolute/path/to/Cursor/resources/app.asar
 *   node scripts/rea-cursor-inspect.mjs /absolute/path/to/extracted/app
 */
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node scripts/rea-cursor-inspect.mjs /absolute/path/to/Cursor/app.asar')
  process.exit(2)
}
const major = Number(process.versions.node.split('.')[0])
const minor = Number(process.versions.node.split('.')[1])
if (!(major >= 26 || (major === 24 && minor >= 11) || (major === 22 && minor >= 19))) {
  console.error('REA requires Node.js >=22.19, >=24.11, or >=26. Current:', process.version)
  process.exit(2)
}
const absolute = resolve(target)
if (!existsSync(absolute)) {
  console.error('Cursor analysis input not found:', absolute)
  process.exit(2)
}
if (!statSync(absolute).isDirectory() && !absolute.toLowerCase().endsWith('.asar')) {
  console.error('Expected extracted Electron directory or ASAR file.')
  process.exit(2)
}
const dest = resolve('rea-local-results')
mkdirSync(dest, { recursive: true })
const output = resolve(dest, 'cursor-static-analysis.json')
const result = spawnSync('npx', ['-y', 'rea-agents@latest', 'analyze-javascript-application', absolute, '--json'], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000, shell: process.platform === 'win32',
})
if (result.error || result.status !== 0) {
  console.error('REA analysis failed:', result.error?.message || result.stderr || result.status)
  process.exit(1)
}
let findings
try { findings = JSON.parse(result.stdout) } catch {
  console.error('REA output was not valid JSON; no evidence artifact created.')
  process.exit(1)
}
writeFileSync(output, JSON.stringify({
  target: absolute,
  analyzedAt: new Date().toISOString(),
  cli: 'rea-agents@latest analyze-javascript-application',
  evidence: findings,
}, null, 2), { mode: 0o600 })
console.log('REA Cursor analysis saved locally:', output)
console.log('Do not upload this file to a public repository; review/redact it before sharing findings.')
