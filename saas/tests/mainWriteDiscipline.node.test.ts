// tests/mainWriteDiscipline.node.test.ts
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  const listed = [...gate.matchAll(/'((?:tests|regression)\/[^']+\.node\.test\.ts)'/g)].map(match => match[1])
  assert.ok(listed.length > 100, `gate list looks truncated: ${listed.length} entries`)

  for (const relative of listed) {
    const source = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
    assert.match(source, /from ['"]node:test['"]/, `${relative}: gated file does not import node:test`)
    assert.match(source, /(?:^|\W)test\s*\(\s*['"`]/, `${relative}: gated file registers no test`)
  }
})

test('every gated test file is a real test, not source code pasted into a test path', () => {
  const testsDir = fileURLToPath(new URL('./', import.meta.url))
  const files = readdirSync(testsDir).filter(name => name.endsWith('.node.test.ts'))
  assert.ok(files.length > 0, 'no test files found to verify')

  for (const name of files) {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8')
    const firstLine = source.split('\n', 1)[0].trim()
    const headerPath = firstLine.startsWith('//') ? firstLine.replace(/^\/\/\s*/, '').trim() : ''
    if (headerPath && /\.(?:ts|tsx|js|mjs|cjs)$/.test(headerPath)) {
      assert.ok(
        /(?:^|\/)tests\//.test(headerPath),
        `${name}: first-line path comment points outside tests/ ("${headerPath}") — a source file was pasted into this test path`,
      )
    }

    assert.doesNotMatch(
      source,
      /from ['"]next\/server['"]/,
      `${name}: imports next/server — route/source code was pasted into this test file`,
    )
  }
})

test('test files cannot import missing bare siblings', () => {
  const testsDir = new URL('./', import.meta.url)
  const files = readdirSync(testsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.node.test.ts'))
    .map(entry => entry.name)

  for (const name of files) {
    const fileUrl = new URL(name, testsDir)
    const source = readFileSync(fileUrl, 'utf8')
    const specifiers = [
      ...source.matchAll(/\bfrom\s+['"](\.\/[^'"]+\.(?:ts|tsx|js|mjs|cjs))['"]/g),
      ...source.matchAll(/^\s*import\s+['"](\.\/[^'"]+\.(?:ts|tsx|js|mjs|cjs))['"]/gm),
    ].map(match => match[1])

    for (const specifier of specifiers) {
      assert.equal(
        existsSync(fileURLToPath(new URL(specifier, fileUrl))),
        true,
        `${name}: imports missing sibling ${specifier}; likely source code was copied into tests/`,
      )
    }
  }
})

test('critical release regressions cannot sit dead outside the COS gate', () => {
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  const criticalReleaseTests = [
    'tests/releaseSignalSeverity.node.test.ts',
    'regression/powerStabilizationRelease.node.test.ts',
  ]

  for (const relative of criticalReleaseTests) {
    assert.ok(gate.includes(`'${relative}'`), `${relative}: critical regression is not registered in the COS gate`)
  }
})