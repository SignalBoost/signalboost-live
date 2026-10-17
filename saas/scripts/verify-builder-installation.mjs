// Non-invasive Builder V2 installation preflight.
// Verifies repository wiring only; live Supabase/Vercel/model access requires an authenticated smoke test.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export function verifyBuilderInstallation(root) {
  const failures = []
  const checks = []
  const check = (name, ok, detail) => {
    checks.push({ name, status: ok ? 'pass' : 'fail', detail })
    if (!ok) failures.push(name)
  }
  const read = relative => {
    const file = path.join(root, relative)
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
  }
  let pkg = {}
  try { pkg = JSON.parse(read('package.json')) } catch { /* reported below */ }
  check('package manifest', Boolean(pkg.name), 'package.json must parse')
  for (const dependency of ['@vercel/sandbox', '@supabase/supabase-js']) {
    check('dependency: ' + dependency, Boolean(pkg.dependencies?.[dependency]),
      'Runtime dependency must be declared')
  }
  const runner = read('lib/builder/vercel-sandbox-runner.ts')
  const workspace = read('lib/builder/workspace-supabase.ts')
  const jobs = read('lib/builder/job-runner.ts')
  const agent = read('lib/builder/agent-v2.ts')
  const cycle = read('lib/builder/agent-v2-job-cycle.ts')
  check('sandbox runtime', /runtime:\s*['"]node24['"]/.test(runner), 'Expected Node 24 runner')
  check('sandbox default egress', /networkPolicy:\s*['"]deny-all['"]/.test(runner), 'User execution is network denied')
  check('sandbox cleanup', /sandbox\.stop\(\)/.test(runner), 'Sandbox is stopped in finally')
  check('sandbox dependency install', /builderDependencyPlan/.test(runner) && /validateBuilderLock/.test(runner),
    'Dependency plan and lock validation are imported')
  check('workspace ownership isolation', /eq\(['"]user_id['"],\s*this\.userId\)/.test(workspace),
    'Workspace operations must scope owner')
  check('builder V2 wiring', /new BuilderV2Agent/.test(jobs) && /new BuilderV2Dispatcher/.test(jobs),
    'Job runner must instantiate Builder V2 with dispatcher')
  check('model governance', /createGovernedBuilderAiPort/.test(jobs), 'Coding model uses governed adapter')
  check('durable continuation', /onCheckpoint/.test(cycle) && /store\.save/.test(cycle),
    'Job cycle must persist checkpoint')
  check('host-side test proof', /builderV2Acceptance/.test(agent) && /run_tests/.test(agent),
    'Builder only accepts real host test receipts')
  return { ok: failures.length === 0, scope: 'repository-static-only', checks, failures,
    productionVerified: false }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const result = verifyBuilderInstallation(root)
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.ok ? 0 : 1
}
