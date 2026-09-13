// tests/mainWriteDiscipline.node.test.ts
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const readRoot = (path: string) => readFileSync(new URL(path, root), 'utf8')

test('every PR to main must advance the shared serialization token from its current base', () => {
  const workflow = readRoot('.github/workflows/main-write-discipline.yml')
  assert.match(workflow, /pull_request:[\s\S]*branches: \[main\]/)
  assert.match(workflow, /expected_base="base_sha=\$\{PR_BASE\}"/)
  assert.match(workflow, /expected_branch="branch=\$\{PR_BRANCH\}"/)
  assert.match(workflow, /git diff --quiet "\$\{PR_BASE\}" "\$\{PR_HEAD\}" -- "\$token"/)
  assert.match(workflow, /Every PR to main must modify/)
})

test('direct, squash, and rebase writes to main are classified as integration violations', () => {
  const workflow = readRoot('.github/workflows/main-write-discipline.yml')
  assert.match(workflow, /push:[\s\S]*branches: \[main\]/)
  assert.match(workflow, /git rev-list --parents -n 1/)
  assert.match(workflow, /parent_count.*-ne 2/)
  assert.match(workflow, /Direct, squash, or rebase write detected on main/)
  assert.match(workflow, /commits\/\$\{GITHUB_SHA\}\/pulls/)
  assert.match(workflow, /merged_prs.*-ne 1/)
})

test('onboarding independently rejects stale main integration tokens', () => {
  const onboarding = readRoot('.github/workflows/onboard-enforcement.yml')
  assert.match(onboarding, /PR_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/)
  assert.match(onboarding, /PR_HEAD_REF: \$\{\{ github\.event\.pull_request\.head\.ref \}\}/)
  assert.match(onboarding, /token='\.github\/main-write-token'/)
  assert.match(onboarding, /Stale main integration base/)
  assert.match(onboarding, /Every PR to main must modify/)
})

test('Vercel does not skip deployments based on Git commit provenance', () => {
  const vercel = JSON.parse(readRoot('saas/vercel.json'))
  assert.equal(vercel.ignoreCommand, undefined)
})

test('ordinary PRs require owner integration while owner-authorized Platform Engineer repairs have one narrow self-merge exception', () => {
  const codeowners = readRoot('.github/CODEOWNERS')
  const policy = readRoot('docs/MAIN-WRITE-DISCIPLINE.md')
  assert.match(codeowners, /^\* @SignalBoost$/m)
  assert.match(policy, /Agents do not self-merge ordinary task PRs\./)
  assert.match(policy, /owner-authorized COS Platform Engineer repair/i)
  assert.match(policy, /every GitHub check is green/i)
  assert.match(policy, /restorable production checkpoint/i)
  assert.match(policy, /two-parent GitHub merge commit|GitHub \*\*merge commit\*\*/i)
  assert.match(policy, /There is no generic agent emergency bypass\./)
})

test('the shared token is a conflict surface, not an authority credential', () => {
  const token = readRoot('.github/main-write-token')
  assert.match(token, /^base_sha=[0-9a-f]{40}$/m)
  assert.match(token, /^branch=\S+$/m)
  assert.doesNotMatch(token, /token=|secret=|password=|api[_-]?key=/i)
})

test('a library or route file committed into tests/ is caught, whatever it is named', () => {
  // The guard below only reads *.node.test.ts, so on 2026-09-13 a library module committed as
  // saas/tests/cosUniversityEvidenceSupply.ts sat on main unnoticed: nothing imported it, no suite
  // ran it, and the gate had no opinion. The signature is the same as the pasted-route corruption —
  // a first-line path comment pointing somewhere other than tests/ — so the same rule applies to
  // every TypeScript file in the directory, not only the ones that end in .node.test.ts.
  //
  // Files that legitimately live here keep pointing at tests/: fixtures, .cases.ts, e2e specs.
  const testsDir = fileURLToPath(new URL('./', import.meta.url))
  const files = readdirSync(testsDir).filter(name => /\.tsx?$/.test(name))
  assert.ok(files.length > 0, 'no TypeScript files found to verify')

  for (const name of files) {
    const firstLine = readFileSync(new URL(name, import.meta.url), 'utf8').split('\n', 1)[0].trim()
    if (!firstLine.startsWith('//')) continue
    const headerPath = firstLine.replace(/^\/\/\s*/, '').trim()
    if (!/\.(?:ts|tsx|js|mjs|cjs)$/.test(headerPath)) continue
    assert.ok(
      /(?:^|\/)tests\//.test(headerPath),
      `${name}: first-line path comment points outside tests/ ("${headerPath}") — this file belongs at that path, not in tests/`,
    )
  }
})

test('every gated file actually registers tests, so an empty pass is impossible', () => {
  // The stronger half of the same corruption. On 2026-09-13 tests/releaseSignalSeverity.node.test.ts
  // held a byte-identical copy of lib/ai/cos/cognitiveReasoningPatterns.ts. It declared no tests, so
  // node --test reported the file as PASSING and the gate printed a tick for it. A header check
  // could not see it: the pasted module's first line is `export type ...`, not a path comment.
  // A gated file that registers nothing is never a pass; it is a missing regression.
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  const listed = [...gate.matchAll(/'(tests\/[^']+\.node\.test\.ts)'/g)].map(match => match[1])
  assert.ok(listed.length > 100, `gate list looks truncated: ${listed.length} entries`)

  for (const relative of listed) {
    const source = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
    assert.match(source, /from ['"]node:test['"]/, `${relative}: gated file does not import node:test`)
    assert.match(source, /(?:^|\W)test\s*\(\s*['"`]/, `${relative}: gated file registers no test`)
  }
})

test('every gated test file is a real test, not source code pasted into a test path', () => {
  // Recurring corruption: an agent overwrites a tests/*.node.test.ts with the contents of a
  // route/lib source file. The pasted file keeps its own first-line path comment (e.g.
  // "// saas/app/api/builder/route.ts") and imports runtime-only modules like next/server, which
  // then fail ESM resolution under Node 24 and break the whole gate. Catch it at the gate instead.
  const testsDir = fileURLToPath(new URL('./', import.meta.url))
  const files = readdirSync(testsDir).filter(name => name.endsWith('.node.test.ts'))
  assert.ok(files.length > 0, 'no test files found to verify')

  for (const name of files) {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8')
    const firstLine = source.split('\n', 1)[0].trim()

    // A first-line path comment must point at this file's own tests/ location, never at a
    // route/lib/source path. This is the exact signature of the route-pasted-into-test corruption.
    const headerPath = firstLine.startsWith('//') ? firstLine.replace(/^\/\/\s*/, '').trim() : ''
    if (headerPath && /\.(?:ts|tsx|js|mjs|cjs)$/.test(headerPath)) {
      assert.ok(
        /(?:^|\/)tests\//.test(headerPath),
        `${name}: first-line path comment points outside tests/ ("${headerPath}") — a source file was pasted into a test path`,
      )
    }

    // A test file must never pull the Next server runtime; that only appears when route.ts was pasted in.
    assert.doesNotMatch(
      source,
      /from ['"]next\/server['"]/,
      `${name}: imports next/server — route/source code was pasted into this test file`,
    )
  }
})