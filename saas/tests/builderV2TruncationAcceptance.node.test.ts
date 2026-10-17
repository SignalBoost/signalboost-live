// saas/tests/builderV2TruncationAcceptance.node.test.ts
// Acceptance for the production failure of 2026-10-16 (DeepInfra fallback returned exactly 4096 tokens with
// finish_reason=length; the job ended with local_model_output_truncated). Real code path end to end:
// HTTP response -> callLocalModel(allowTruncatedText) -> governed Builder adapter -> Builder V2 -> real node runs.
// It must show: the cut-off reply is preserved, only complete actions execute (no partial file is written),
// the build continues, completes on real passing commands, and a resume from the saved checkpoint is accepted.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

const href = (path: string) => JSON.stringify(new URL(path, import.meta.url).href)

test('a reply cut off at the output limit is preserved, executes only complete actions, and the build completes', () => {
  const source = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { dirname, join } from 'node:path';
    import { spawnSync } from 'node:child_process';
    registerHooks({
      resolve(specifier, context, next) {
        const mocks = ['localInferenceUsage.ts', 'cosTurnBudget.ts', 'modelRuntimeAssignment.ts', 'execution-context.ts'];
        const mock = mocks.find(name => specifier.endsWith(name));
        return mock ? { url: 'mock:' + mock, shortCircuit: true } : next(specifier, context);
      },
      load(url, context, next) {
        const modules = {
          'mock:localInferenceUsage.ts': 'export async function recordLocalInferenceUsage(){}',
          'mock:cosTurnBudget.ts': 'export function turnDeadlineRemainingMs(){return null}',
          'mock:modelRuntimeAssignment.ts': 'export async function tryAssignedPlatformModelTurn(){throw Error("unexpected")}',
          'mock:execution-context.ts': 'export function currentHarnessExecutionContext(){return null};export function harnessDeadlineRemainingMs(){return null};export function reserveHarnessProviderCostUsd(){}',
        };
        return modules[url] ? { format: 'module', source: modules[url], shortCircuit: true } : next(url, context);
      },
    });
    const { callLocalModel } = await import(${href('../lib/ai/local-inference.ts')});
    const { createGovernedBuilderAiPort } = await import(${href('../lib/builder/control-adapter.ts')});
    const { BuilderV2Agent } = await import(${href('../lib/builder/agent-v2.ts')});
    const { BuilderV2Dispatcher } = await import(${href('../lib/builder/agent-v2-dispatcher.ts')});
    const { InMemoryBuilderWorkspace } = await import(${href('../lib/builder/workspace.ts')});

    const files = {
      'package.json': '{"name":"mini","version":"1.0.0","scripts":{"test":"node --test test/*.test.js"}}\\n',
      'src/cart.js': 'function total(items) {\\n  return items.reduce((sum, item) => sum + item.price * item.qty, 0)\\n}\\nmodule.exports = { total }\\n',
      'test/cart.test.js': "const test = require('node:test')\\nconst assert = require('node:assert')\\nconst { total } = require('../src/cart.js')\\ntest('total', () => assert.equal(total([{ price: 2, qty: 3 }]), 6))\\ntest('empty', () => assert.equal(total([]), 0))\\n",
      'index.js': "const { total } = require('./src/cart.js')\\nconsole.log('Order total:', total([{ price: 5, qty: 2 }]))\\n",
    };
    const write = path => ({ tool: 'write_file', path, content: files[path] });
    // Reply 1: three files, cut off by the token limit inside the third file's content.
    const batch = JSON.stringify({ type: 'tools', actions: [write('package.json'), write('src/cart.js'), write('test/cart.test.js')] });
    const cut = batch.slice(0, batch.indexOf("require('../src/cart.js')"));
    const replies = [
      { content: cut, finish_reason: 'length' },
      { content: JSON.stringify({ type: 'tools', actions: [write('test/cart.test.js'), write('index.js')] }), finish_reason: 'stop' },
    ];
    let served = 0;
    globalThis.fetch = async () => {
      const reply = replies[served++];
      if (!reply) throw new Error('no more replies');
      return new Response(JSON.stringify({ choices: [{ message: { content: reply.content }, finish_reason: reply.finish_reason }],
        usage: { prompt_tokens: 10, completion_tokens: 4096, total_tokens: 4106 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const config = { baseUrl: 'https://api.deepinfra.com/v1/openai', model: 'deepseek-ai/DeepSeek-V4-Pro', provider: 'deepinfra', routeOwner: 'external', timeoutMs: 5000 };

    // Without allowTruncatedText the client discards the reply (the production failure).
    served = 0;
    await assert.rejects(callLocalModel({ prompt: 'x', maxTokens: 4096 }, config), /local_model_output_truncated/);
    served = 0;
    assert.equal(await callLocalModel({ prompt: 'x', maxTokens: 4096, allowTruncatedText: true }, config), cut);
    served = 0;

    const port = { async generate(input) { return callLocalModel({ prompt: input.prompt, systemPrompt: input.systemPrompt, maxTokens: input.maxTokens, signal: input.signal, allowTruncatedText: input.allowTruncatedText }, config) } };
    const ai = createGovernedBuilderAiPort(port, { deadlineAtMs: Date.now() + 60000 });
    const runner = { async run({ command, files: current }) {
      const dir = mkdtempSync(join(tmpdir(), 'v2-trunc-'));
      try {
        for (const file of current) { mkdirSync(dirname(join(dir, file.path)), { recursive: true }); writeFileSync(join(dir, file.path), file.content) }
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'));
        const result = spawnSync('sh', ['-c', command], { cwd: dir, encoding: 'utf8', timeout: 60000, env });
        return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, timedOut: false };
      } finally { rmSync(dir, { recursive: true, force: true }) }
    } };
    const objective = 'Build MiniFlow.\\nCreate all 4 files:\\n\`\`\`text\\nmini/\\n├── package.json\\n├── index.js\\n├── src/\\n│   └── cart.js\\n└── test/\\n    └── cart.test.js\\n\`\`\`\\nImplement at least **2 meaningful automated tests**.\\n## Mandatory verification\\nExecute all three commands:\\n\`\`\`bash\\nnpm test\\nnode --test test/*.test.js\\nnode index.js\\n\`\`\`';

    // Slice 1: only the truncated reply. Its two complete files are written exactly; the cut file is not written.
    const workspace = new InMemoryBuilderWorkspace();
    const slice1 = await new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, runner), workspace).run({ workspaceId: 'w', objective, maxSteps: 1 });
    assert.equal(slice1.reason, 'builder_v2_step_budget');
    assert.deepEqual(slice1.steps.map(s => [s.tool, s.ok, s.output.path]), [['write_file', true, 'package.json'], ['write_file', true, 'src/cart.js']]);
    assert.equal((await workspace.readFile('w', 'package.json')).content, files['package.json']);
    assert.equal((await workspace.readFile('w', 'src/cart.js')).content, files['src/cart.js']);
    assert.equal(await workspace.readFile('w', 'test/cart.test.js'), null, 'no partial file');

    // Slice 2 resumes from the saved checkpoint, writes the rest, and the host runs the three real commands.
    const slice2 = await new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, runner), workspace).run({ workspaceId: 'w', objective, maxSteps: 4, checkpoint: slice1.checkpoint });
    assert.equal(slice2.ok, true, slice2.reason);
    const runs = slice2.steps.filter(s => s.tool === 'run_tests');
    assert.deepEqual(runs.map(s => [s.output.requestedCommand, s.output.exitCode]), [['npm test', 0], ['node --test test/*.test.js', 0], ['node index.js', 0]]);
    assert.match(runs[2].output.stdout, /Order total: 10/);
    for (const [path, content] of Object.entries(files)) assert.equal((await workspace.readFile('w', path)).content, content, path);
    assert.equal(served, 2);
    console.log('ACCEPTANCE_OK');
  `
  const out = execFileSync(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', source], { encoding: 'utf8', stdio: 'pipe' })
  assert.match(out, /ACCEPTANCE_OK/)
})
