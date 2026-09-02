// tests/mainWriteDiscipline.node.test.ts
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const saas = fileURLToPath(new URL('../', import.meta.url))
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

test('Vercel refuses an unverified direct-main deployment before the build starts', () => {
  const vercel = JSON.parse(readRoot('saas/vercel.json'))
  const guard = readRoot('saas/scripts/vercel-main-write-guard.mjs')
  assert.equal(vercel.ignoreCommand, 'node scripts/vercel-main-write-guard.mjs')
  assert.match(guard, /VERCEL_GIT_COMMIT_REF/)
  assert.match(guard, /branch !== 'main'\) process\.exit\(1\)/)
  assert.match(guard, /parents\.length !== 2/)
  assert.match(guard, /\^Merge pull request #\\d\+ from /)
  assert.match(guard, /git\(\['diff', '--quiet', firstParent, 'HEAD', '--', '\.github\/main-write-token'\]\)/)
  assert.match(guard, /skipping main deployment/)
  assert.match(guard, /verified serialized PR merge; continuing deployment/)

  const preview = spawnSync(process.execPath, ['scripts/vercel-main-write-guard.mjs'], {
    cwd: saas,
    env: { ...process.env, VERCEL_GIT_COMMIT_REF: 'feature/proof' },
    encoding: 'utf8',
  })
  assert.equal(preview.status, 1, `preview branch must build: ${preview.stderr}`)

  const directMain = spawnSync(process.execPath, ['scripts/vercel-main-write-guard.mjs'], {
    cwd: saas,
    env: { ...process.env, VERCEL_GIT_COMMIT_REF: 'main' },
    encoding: 'utf8',
  })
  assert.equal(directMain.status, 0, `unverified main commit must be skipped: ${directMain.stderr}`)
  assert.match(directMain.stderr, /skipping main deployment/)
})

test('owner review and no-agent-self-merge are repository policy', () => {
  const codeowners = readRoot('.github/CODEOWNERS')
  const policy = readRoot('docs/MAIN-WRITE-DISCIPLINE.md')
  assert.match(codeowners, /^\* @SignalBoost$/m)
  assert.match(policy, /Agents do not self-merge\./)
  assert.match(policy, /only one PR at a time using a GitHub merge commit/i)
  assert.match(policy, /There is no agent emergency bypass\./)
})

test('the shared token is a conflict surface, not an authority credential', () => {
  const token = readRoot('.github/main-write-token')
  assert.match(token, /^base_sha=[0-9a-f]{40}$/m)
  assert.match(token, /^branch=\S+$/m)
  assert.doesNotMatch(token, /token=|secret=|password=|api[_-]?key=/i)
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
