// saas/scripts/check-platform-harness-bypasses.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const scanRoots = ['app/api', 'lib', 'agent-gateway-host']

function filesUnder(dir) {
  const abs = join(root, dir)
  const out = []
  for (const name of readdirSync(abs)) {
    const path = join(abs, name)
    const stat = statSync(path)
    if (stat.isDirectory()) out.push(...filesUnder(relative(root, path)))
    else if (/\.(?:ts|tsx|mjs)$/.test(name)) out.push(path)
  }
  return out
}

const files = scanRoots.flatMap(filesUnder)
const failures = []

const providerImportAllowlist = new Set([
  'lib/ai/providerRouter.ts',
  'lib/cos/textGateway.ts',
  'lib/cos/aiPort.ts',
  // Type-only compatibility shim; execution delegates into lib/cos/textGateway.ts.
  'lib/ai/modelRouter.ts',
])

for (const abs of files) {
  const rel = relative(root, abs).replaceAll('\\', '/')
  if (rel.includes('/tests/') || rel.endsWith('.test.ts')) continue
  const source = readFileSync(abs, 'utf8')

  const importsProviderRouter = /from ['"][^'"]*providerRouter(?:\.ts)?['"]/.test(source)
  if (importsProviderRouter && !providerImportAllowlist.has(rel)) {
    failures.push(`${rel}: raw providerRouter import outside canonical gateway/adapters`)
  }

  const invokesGoverned = /\brunGoverned\s*\(/.test(source)
  if (invokesGoverned && !rel.startsWith('agent-gateway/')) {
    const harnessBound = /withHostProductionHarnessIngress|createGovernedHarnessExecutor/.test(source)
    if (!harnessBound) failures.push(`${rel}: runGoverned() without Platform Harness ingress`)
  }
}

const mandatoryIngress = new Map([
  ['lib/builder/job-runner.ts', 'builder.job.execute'],
  ['lib/ai/cos/cosUniversityMassDistillationWorkflow.ts', 'university.distillation.execute'],
  ['lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', 'university.evaluation.execute'],
  ['agent-gateway-host/supervisor-repair.ts', 'self_healing.repair.dispatch'],
  ['lib/ai/cos/cosUniversityPracticeExecution.ts', 'university.practice.execute'],
  ['lib/ai/cos/cosUniversityAgentExamRuntime.ts', 'university.exam.execute'],
  ['lib/ai/cos/cosUniversityAgentCapstoneRuntime.ts', 'university.capstone.execute'],
  ['lib/audit/modelRouter.ts', 'audit.reasoning.execute'],
])

for (const [rel, capability] of mandatoryIngress) {
  const source = readFileSync(join(root, rel), 'utf8')
  if (!source.includes('withHostProductionHarnessIngress')) {
    failures.push(`${rel}: mandatory Harness ingress missing`)
  }
  if (!source.includes(capability)) {
    failures.push(`${rel}: expected bounded capability ${capability} missing`)
  }
}

if (failures.length) {
  console.error('Platform Harness bypass audit failed:')
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log(`Platform Harness bypass audit passed (${files.length} files scanned; ${mandatoryIngress.size} mandatory seams verified).`)
