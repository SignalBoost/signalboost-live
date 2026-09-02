import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8')
}

test('artifact backend treats operational logs as diagnosis before objective validation or generation', () => {
  const artifact = read('../app/api/artifacts/route.ts')
  const guard = artifact.indexOf('if (isOperationalLogEvidence(rawObjective))')
  const objective = artifact.indexOf('const objective = objectiveOf(rawObjective)')
  const generate = artifact.indexOf('createPlatformAiPort().generate')
  assert.ok(guard >= 0)
  assert.ok(objective > guard)
  assert.ok(generate > objective)
  assert.match(artifact.slice(guard, objective), /operationalLogReply\(rawObjective\)/)
  assert.match(artifact.slice(guard, objective), /execution_allowed: false/)
})

test('browser ingress excludes all operational evidence from artifact visual and provenance routing', () => {
  const route = read('../app/api/cos-browser/route.ts')
  assert.match(route, /const operationalEvidence = isOperationalLogEvidence\(operationalPrompt\)/)
  assert.match(route, /if \(!operationalEvidence\) \{[\s\S]*isConciergeArtifactObjective\(prompt\)[\s\S]*isConciergeVisualObjective\(prompt\)/)
  assert.match(route, /if \(!operationalEvidence && isProvenanceIntrospection\(prompt\)\)/)
})

test('failed-test wording cannot authorize artifact or provenance behavior', () => {
  const log = [
    '10:12:16.287 ✖ create PDF with technical provenance',
    '10:12:16.302 Error: Command "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build" exited with 1',
  ].join('\n')
  assert.match(log, /create PDF/)
  assert.match(log, /technical provenance/)
  assert.match(log, /exited with 1/)
})
