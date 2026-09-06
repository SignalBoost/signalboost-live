// saas/tests/builderCertificationRunner.node.test.ts
//
// The ladder only means something if the cases are real. These tests run the seeded fixtures
// through actual Node to prove each one fails the way its level requires, and check the route
// itself scripts nothing: same durable job path, same live model, fresh workspace per attempt.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUILDER_CERTIFICATION_CASES } from '../lib/builder/certification.ts'
import { isConciergeBuilderObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'
import { BUILDER_CERTIFICATION_FIXTURES } from '../lib/builder/certification-fixtures.ts'

const source = readFileSync(new URL('../app/api/admin/builder-certification/route.ts', import.meta.url), 'utf8')

function runNode(files: Record<string, string>, entry: string): { code: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'cert-'))
  try {
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
    try {
      const output = execFileSync(process.execPath, [join(dir, entry)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      return { code: 0, output }
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string }
      return { code: Number(failure.status ?? 1), output: `${failure.stdout || ''}${failure.stderr || ''}` }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The shipped fixture body for a seeded file, graded as the route would submit it. */
function seededFile(caseId: keyof typeof BUILDER_CERTIFICATION_FIXTURES, name: string): string {
  const file = BUILDER_CERTIFICATION_FIXTURES[caseId].seed.find(entry => entry.path === name)
  assert.ok(file, `fixture ${name} is missing`)
  return file.content
}

test('every ladder level has a fixture and the route runs exactly one per request', () => {
  for (const entry of BUILDER_CERTIFICATION_CASES) assert.ok(BUILDER_CERTIFICATION_FIXTURES[entry.id])
  // A single caseId is read from the body; there is no loop that would run the whole ladder and
  // turn the first wall-clock timeout into a false capability failure.
  assert.match(source, /isCertificationCaseId\(body\.caseId\)/)
  assert.equal(/for \(const entry of BUILDER_CERTIFICATION_CASES\)[\s\S]{0,200}enqueueBuilderJob/.test(source), false)
})

test('the level 2 fixture genuinely fails and the intended minimal repair proves it', () => {
  const broken = seededFile('inspect_repair_and_run_v1', 'total.js')
  const before = runNode({ 'total.js': broken }, 'total.js')
  assert.notEqual(before.output.trim(), '6')

  const repaired = broken.replace('index <= values.length', 'index < values.length')
  const after = runNode({ 'total.js': repaired }, 'total.js')
  assert.equal(after.code, 0)
  assert.equal(after.output.trim(), '6')
})

test('the level 3 fixture fails at runtime so a classified failure is actually observable', () => {
  const report = seededFile('observe_failure_and_recover_v1', 'report.js')
  const before = runNode({ 'report.js': report }, 'report.js')
  assert.notEqual(before.code, 0)
  assert.match(before.output, /Cannot find module/)

  // Recoverable inside the workspace: supplying the missing module makes the same command pass.
  const after = runNode({
    'report.js': report,
    'format-report.js': "exports.formatReport = ({ title, total }) => `${title}: ${total}`\n",
  }, 'report.js')
  assert.equal(after.code, 0)
  assert.match(after.output, /Quarterly: 42/)
})

test('every fixture objective is a real coding objective the intake gate accepts', () => {
  assert.equal(Object.keys(BUILDER_CERTIFICATION_FIXTURES).length, BUILDER_CERTIFICATION_CASES.length)
  for (const entry of BUILDER_CERTIFICATION_CASES) {
    const objective = BUILDER_CERTIFICATION_FIXTURES[entry.id].objective
    assert.equal(isConciergeBuilderObjective(objective), true, objective)
  }
})

test('the route is owner-only on both read and run', () => {
  const get = source.slice(source.indexOf('export async function GET'), source.indexOf('export async function POST'))
  const post = source.slice(source.indexOf('export async function POST'))
  for (const handler of [get, post]) {
    assert.match(handler, /await requireOwner\(\)/)
    assert.match(handler, /if \(!guard\.ok\) return noStore\(\{ error: guard\.error \}, \{ status: guard\.status \}\)/)
  }
})

test('nothing is scripted: the live durable job path runs the case', () => {
  // The same enqueue + background run pair /api/builder uses. No alternate lane, no fixture model.
  assert.match(source, /await enqueueBuilderJob\(\{/)
  assert.match(source, /after\(async \(\) => \{ await runBuilderJob\(jobId, userId\) \}\)/)
  assert.equal(/ScriptedBuilderAi|BuilderToolLoop|generate\s*:/.test(source), false)
  // A fresh workspace per attempt, or a previous run's repaired file would satisfy the next one.
  assert.match(source, /const workspaceId = crypto\.randomUUID\(\)/)
})

test('the certification runner regression is mandatory in the deployment gate', () => {
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  assert.match(gate, /tests\/builderCertificationRunner\.node\.test\.ts/)
})
