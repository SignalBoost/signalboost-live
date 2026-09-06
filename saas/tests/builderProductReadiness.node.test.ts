import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { appendBuilderChunk } from '../lib/builder/file-chunks.ts'
import { builderDependencyPlan } from '../lib/builder/dependencies.ts'
import { builderRepositoryImportIntent, builderRepositoryTarget, importBuilderRepository } from '../lib/builder/repository-import.ts'
import { VercelSandboxBuilderRunner } from '../lib/builder/vercel-sandbox-runner.ts'
import { builderMissingSourceReply } from '../lib/builder/user-guidance.ts'
import type { BuilderRunnerPort } from '../lib/builder/contracts.ts'

const action = (toolId: string, input: Record<string, unknown>) => JSON.stringify({ type: 'tool', toolId, input })
const scripted = (actions: string[]) => ({ async generate() { const next = actions.shift(); assert.ok(next, 'unexpected model call'); return next } })
const realNode: BuilderRunnerPort = { async run(input) {
  const root = await mkdtemp(join(tmpdir(), 'builder-acceptance-'))
  try {
    for (const file of input.files) { const path = join(root, file.path); await mkdir(dirname(path), { recursive: true }); await writeFile(path, file.content) }
    // Fixture-only Node commands; user commands never execute on this host.
    assert.match(input.command, /^node (?:--test )?[\w.-]+\.js$/)
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT
    const result = spawnSync(process.execPath, input.command.split(' ').slice(1), { cwd: root, encoding: 'utf8', timeout: 5_000, env })
    return { exitCode: result.status ?? 124, stdout: result.stdout || '', stderr: result.stderr || '', timedOut: Boolean(result.error) }
  } finally { await rm(root, { recursive: true, force: true }) }
} }

test('five separate create/run trials and five real fail/repair/pass variants', async () => {
  for (let n = 1; n <= 5; n++) {
    const workspace = new InMemoryBuilderWorkspace()
    const create = await new BuilderToolLoop(scripted([
      action('write_file', { path: 'hello.js', content: `console.log('Hello ${n}')` }),
      action('run', { command: 'node hello.js' }),
    ]), workspace, realNode).run({ objective: 'Create hello.js and run it.', workspaceId: `create-${n}` })
    assert.equal(create.ok, true)
    assert.equal((create.trace.at(-1)?.output as any).stdout, `Hello ${n}\n`)
    await workspace.writeFile(`repair-${n}`, 'math.js', `module.exports = x => x - ${n}`)
    await workspace.writeFile(`repair-${n}`, 'math.test.js', `const assert = require('node:assert/strict'); assert.equal(require('./math.js')(10), ${10+n});`)
    const repair = await new BuilderToolLoop(scripted([
      action('run', { command: 'node --test math.test.js' }),
      action('edit_file', { path: 'math.js', search: `x - ${n}`, replace: `x + ${n}` }),
      action('run', { command: 'node --test math.test.js' }),
    ]), workspace, realNode).run({ objective: 'Fix the failing math test.', workspaceId: `repair-${n}` })
    assert.equal(repair.ok, true, JSON.stringify(repair))
    assert.deepEqual(repair.trace.map(step => step.ok), [false, true, true])
  }
})

test('600-line file is assembled in chunks and executes only after finalization', async () => {
  const source = Array.from({ length: 600 }, (_, n) => `// row ${n}: a large source-file regression fixture`).join('\n') + '\nconsole.log("large complete")\n'
  const workspace = new InMemoryBuilderWorkspace()
  const actions: string[] = []
  for (let offset = 0; offset < source.length; offset += 4_000) actions.push(action('write_file', {
    path: 'large.js', mode: 'append', offset, content: source.slice(offset, offset + 4_000), final: offset + 4_000 >= source.length,
  }))
  const result = await new BuilderToolLoop(scripted(actions), workspace, realNode).run({
    objective: 'Create large.js.\nRun:\nnode large.js', workspaceId: 'large',
  })
  assert.equal(result.ok, true)
  assert.equal((await workspace.readFile('large', 'large.js'))?.content, source)
  assert.equal((result.trace.at(-1)?.output as any).stdout, 'large complete\n')
})

test('checkpoint continues an unfinished file without replay and rejects changed source', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const request = { objective: 'Create a.js.\nRun:\nnode a.js', workspaceId: 'resume', deadlineAtMs: Date.now() + 200_000 }
  const first = await new BuilderToolLoop({ async generate() {
    request.deadlineAtMs = 1
    return action('write_file', { path: 'a.js', mode: 'append', offset: 0, content: 'console.', final: false })
  } }, workspace, realNode).run(request)
  assert.equal(first.ok, false)
  assert.ok(!first.ok && first.checkpoint)
  if (first.ok || !first.checkpoint) throw new Error('checkpoint missing')
  assert.equal(await workspace.readFile('resume', 'a.js'), null, 'partial content must not be published')
  const complete = await new BuilderToolLoop(scripted([action('write_file', {
    path: 'a.js', mode: 'append', offset: 8, content: 'log("resumed")', final: true,
  })]), workspace, realNode).run({ ...request, deadlineAtMs: undefined, checkpoint: first.checkpoint })
  assert.equal(complete.ok, true)
  assert.equal(complete.trace.filter(step => step.toolId === 'run').length, 1)
  const stale = await new BuilderToolLoop(scripted([]), workspace, realNode).run({ ...request, checkpoint: first.checkpoint })
  assert.equal(stale.ok, false)
  if (!stale.ok) assert.equal(stale.error, 'builder_checkpoint_workspace_changed')
  const crossScope = await new BuilderToolLoop(scripted([]), workspace, realNode).run({ ...request, workspaceId: 'another-user', checkpoint: first.checkpoint })
  if (!crossScope.ok) assert.equal(crossScope.error, 'builder_checkpoint_scope_mismatch')
})

test('chunk offsets, traversal and missing source fail without invented execution', async () => {
  assert.throws(() => appendBuilderChunk('abc', { offset: 0, content: 'def', final: false }), /offset/)
  const result = await new BuilderToolLoop(scripted([]), new InMemoryBuilderWorkspace(), realNode)
    .run({ objective: 'Repair the broken application.', workspaceId: 'missing' })
  assert.equal(result.ok, false)
  assert.equal(result.trace.length, 0)
  assert.match(builderMissingSourceReply(), /no source files to inspect/)
})

test('dependency policy removes scripts and rejects non-registry dependencies', () => {
  const plan = builderDependencyPlan([{ path: 'package.json', content: JSON.stringify({ dependencies: { 'is-number': '7.0.0' }, scripts: { preinstall: 'steal source' } }) }])
  assert.ok(plan)
  assert.doesNotMatch(plan.manifest, /steal|preinstall/)
  for (const version of ['git+https://evil.example/repo', 'file:../private', 'https://evil.example/a.tgz', 'npm:other@1.0.0']) {
    assert.throws(() => builderDependencyPlan([{ path: 'package.json', content: JSON.stringify({ dependencies: { evil: version } }) }]), /source_disallowed/)
  }
})

test('sandbox closes install egress before staging source or running commands', async () => {
  const steps: string[] = []
  const lock = JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/is-number': {
    version: '7.0.0', resolved: 'https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz', integrity: 'sha512-YWJjZA==',
  } } })
  const fake = {
    async updateNetworkPolicy(policy: unknown) { steps.push(`network:${JSON.stringify(policy)}`) },
    async writeFiles(files: any[]) { steps.push(files.some(file => file.path.endsWith('app.js')) ? 'source' : 'manifest') },
    async runCommand(command: any) {
      steps.push(command.cmd)
      if (command.cmd === 'npm') assert.ok(command.args.includes('--ignore-scripts'))
      return { exitCode: 0, async stdout() { return command.cmd === 'cat' ? lock : 'ok' }, async stderr() { return '' } }
    },
    async stop() { steps.push('stop') },
  }
  const runner = new VercelSandboxBuilderRunner((async (options: any) => { assert.equal(options.networkPolicy, 'deny-all'); return fake }) as any)
  const result = await runner.run({ workspaceId: 'sandbox', command: 'node app.js', files: [
    { path: 'package.json', content: '{"dependencies":{"is-number":"7.0.0"}}' }, { path: 'app.js', content: 'private source' },
  ] })
  assert.ok(steps.indexOf('npm') < steps.indexOf('network:"deny-all"'))
  assert.ok(steps.indexOf('network:"deny-all"') < steps.indexOf('source'))
  assert.ok(steps.indexOf('source') < steps.indexOf('sh'))
  assert.equal(steps.at(-1), 'stop')
  assert.equal(result.generatedFiles?.[0]?.path, 'package-lock.json')
  fake.updateNetworkPolicy = async policy => { if (policy === 'deny-all') throw new Error('policy failed') }
  steps.length = 0
  await assert.rejects(() => runner.run({ workspaceId: 'sandbox', command: 'node app.js', files: [
    { path: 'package.json', content: '{"dependencies":{"is-number":"7.0.0"}}' }, { path: 'app.js', content: 'private source' },
  ] }), /policy failed/)
  assert.ok(!steps.includes('source') && !steps.includes('sh'))
  assert.equal(steps.at(-1), 'stop')
})

test('repository importer pins source and never sends platform credentials', async () => {
  const target = builderRepositoryTarget('Inspect https://github.com/example/project/tree/main/src')!
  const sha = 'a'.repeat(40)
  const urls: string[] = []
  const fetched = await importBuilderRepository(target, (async (url: string, options: any) => {
    urls.push(url)
    assert.equal(options.headers.Authorization, undefined)
    assert.equal(options.redirect, 'error')
    if (url.includes('/commits/main%2Fsrc')) return new Response('{}', { status: 404 })
    if (url.endsWith(`/git/trees/${sha}`)) return Response.json({ tree: [{ path: 'src', type: 'tree', sha: 'b'.repeat(40) }] })
    const data = url.includes('/commits/') ? { sha } : url.includes('/git/trees/') ? { tree: [
      { path: 'app.js', type: 'blob', mode: '100644', size: 10 },
      { path: '.env.json', type: 'blob', mode: '100644', size: 10 },
      { path: 'link.js', type: 'blob', mode: '120000', size: 10 },
    ] } : null
    return new Response(data ? JSON.stringify(data) : 'console.log(1)')
  }) as typeof fetch)
  assert.equal(fetched.commitSha, sha)
  assert.deepEqual(fetched.files.map(file => file.path), ['app.js'])
  assert.ok(urls.at(-1)?.includes(`/${sha}/src/app.js`))
  assert.throws(() => builderRepositoryTarget('', 'https://evil.example/a/b'), /url_invalid/)
  assert.throws(() => builderRepositoryTarget('', 'https://github.com/SignalBoost/signalboost-live'), /owner_lane/)
})

test('resume is scoped, generation-fenced and scheduled independently of the browser', async () => {
  const route = await readFile(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url), 'utf8')
  const sql = await readFile(new URL('../supabase/migrations/20260905061418_builder_job_checkpoints.sql', import.meta.url), 'utf8')
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.match(route, /CRON_SECRET/) 
  assert.doesNotMatch(route, /request.json/)
  assert.match(sql, /claim_generation = p_generation/)
  assert.match(sql, /claim_generation < 4/)
  assert.match(sql, /revoke all on function public.pause_builder_job_slice.*from public, anon, authenticated/)
  assert.ok(config.crons.some((job: any) => job.path === '/api/cron/builder-continuations'))
})


test('GitHub links in questions never authorize executable import', async () => {
  for (const prompt of ['What does this repository do? https://github.com/example/project', 'Explain https://github.com/example/project', 'https://github.com/example/project', 'Does this build correctly? https://github.com/example/project']) assert.equal(builderRepositoryImportIntent(prompt), false)
  for (const prompt of ['Import https://github.com/example/project', 'Please fix https://github.com/example/project', 'Can you build this repository?']) assert.equal(builderRepositoryImportIntent(prompt), true)
  const source = await readFile(new URL('../lib/ai/cos/softwareSpecialist.ts', import.meta.url), 'utf8')
  assert.match(source, /repositoryTarget = importRequested \? builderRepositoryTarget/)
})

test('slash refs resolve longest-first and only the requested subtree is recursively fetched', async () => {
  const sha = 'c'.repeat(40), folderSha = 'd'.repeat(40)
  const urls: string[] = []
  const result = await importBuilderRepository(builderRepositoryTarget('Import https://github.com/example/project/tree/feature/foo/src')!, (async (url: string) => {
    urls.push(url)
    if (url.endsWith('/commits/feature%2Ffoo%2Fsrc')) return new Response('{}', { status: 404 })
    if (url.endsWith('/commits/feature%2Ffoo')) return Response.json({ sha })
    if (url.endsWith(`/git/trees/${sha}`)) return Response.json({ tree: [{ path: 'src', type: 'tree', sha: folderSha }] })
    if (url.endsWith(`/git/trees/${folderSha}?recursive=1`)) return Response.json({ tree: [{ path: 'app.js', type: 'blob', mode: '100644', size: 14 }] })
    if (url.endsWith(`/${sha}/src/app.js`)) return new Response('console.log(1)')
    throw new Error(`unexpected request ${url}`)
  }) as typeof fetch)
  assert.equal(result.directory, 'src')
  assert.equal(result.files[0].path, 'app.js')
  assert.ok(!urls.includes(`https://api.github.com/repos/example/project/git/trees/${sha}?recursive=1`))
})

test('full workspace cannot erase a completed command when its lockfile cannot be saved', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  for (let n = 0; n < 99; n++) await workspace.writeFile('full', `file${n}.js`, '')
  await workspace.writeFile('full', 'package.json', '{"dependencies":{"is-number":"7.0.0"}}')
  const originalWrite = workspace.writeFile.bind(workspace)
  workspace.writeFile = async (id, path, content) => {
    if (path === 'package-lock.json') throw new Error('builder_file_limit')
    return originalWrite(id, path, content)
  }
  let runs = 0
  const result = await new BuilderToolLoop(scripted([action('run', { command: 'node file0.js' }), JSON.stringify({ type: 'answer', answer: 'Command passed; generated lockfile was not saved.' })]), workspace, { async run() {
    runs++
    return { exitCode: 0, stdout: 'executed once', stderr: '', timedOut: false, generatedFiles: [{ path: 'package-lock.json', content: '{"lockfileVersion":3,"packages":{}}' }] }
  } }).run({ objective: 'Run node file0.js and report its output.', workspaceId: 'full' })
  assert.equal(runs, 1)
  const proof = result.trace.find(item => item.toolId === 'run')!
  assert.equal(proof.ok, true)
  assert.equal((proof.output as any).stdout, 'executed once')
  assert.ok(result.trace.some(item => item.error?.includes('builder_generated_lock_not_saved')))
})
