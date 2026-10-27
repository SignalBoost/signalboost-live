// saas/tests/cosAnswerWindowReserve.node.test.ts
//
// THE ANSWER ALWAYS KEEPS ITS TIME. Production 2026-10-27, 11,600-character acceptance brief on the public
// Concierge: routing in front of COS spent 107 s of the 150 s turn, the task-intent judge inside COS spent 18 s more
// (two providers, both timed out), and the call that writes the answer was started with 0.5 s left and failed closed.
// Helpers may now spend only what the answer does not need, whatever the request looks like.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  runWithTurnDeadline, turnDeadlineRemainingMs, helperDeadlineRemainingMs, markUserAnswerStarted, USER_ANSWER_WINDOW_MS,
} from '../lib/ai/cos/cosTurnBudget.ts'
import { answerWindowHelper, USER_ANSWER_TIMEOUT_MS } from '../lib/ai/local-inference.ts'

test('the reserved answer window is the answer timeout, one number', () => {
  assert.equal(USER_ANSWER_WINDOW_MS, 120_000)
  assert.equal(USER_ANSWER_TIMEOUT_MS, USER_ANSWER_WINDOW_MS)
})

test('outside a turn, or in a turn with no reserve, helpers see the plain remaining time', async () => {
  assert.equal(helperDeadlineRemainingMs(), null)
  const now = Date.now()
  await runWithTurnDeadline(now + 10_000, async () => {
    const helper = helperDeadlineRemainingMs(now)
    assert.equal(helper, turnDeadlineRemainingMs(now))
    assert.equal(helper, 10_000)
  })
})

test('before the answer starts, helpers get only the surplus; after it starts, the plain remaining time', async () => {
  const now = Date.now()
  await runWithTurnDeadline(now + 150_000, async () => {
    assert.equal(turnDeadlineRemainingMs(now), 150_000)
    assert.equal(helperDeadlineRemainingMs(now), 30_000)
    // 107 s of routing in front of COS: no helper may run any more, the answer still has its whole window.
    assert.equal(helperDeadlineRemainingMs(now + 107_000), 0)
    assert.equal(turnDeadlineRemainingMs(now + 107_000), 43_000)
    // A nested scope (cos-primary inside cos-browser) shares the same reserve and the same answer record.
    await runWithTurnDeadline(now + 200_000, async () => {
      assert.equal(helperDeadlineRemainingMs(now + 107_000), 0)
      markUserAnswerStarted()
    })
    assert.equal(helperDeadlineRemainingMs(now + 107_000), 43_000, 'release repairs after the answer use the remaining time')
  }, { answerReserveMs: USER_ANSWER_WINDOW_MS })
})

test('a nested scope cannot open its own reserve or reset the answer record', async () => {
  const now = Date.now()
  await runWithTurnDeadline(now + 150_000, async () => {
    await runWithTurnDeadline(now + 150_000, async () => {
      assert.equal(helperDeadlineRemainingMs(now), 150_000, 'the outermost scope decides: it reserved nothing')
    }, { answerReserveMs: USER_ANSWER_WINDOW_MS })
  })
})

test('helpers are the routing classifiers, the planner and the two judges; answers and the agent loop are not', () => {
  const helper = (feature: string, purpose?: string) => answerWindowHelper({ prompt: 'x', usageContext: { feature, purpose } } as never)
  assert.equal(helper('cos_routing_classifier', 'visual_intent'), true)
  assert.equal(helper('cos_routing_classifier', 'public_identity'), true)
  assert.equal(helper('cos_interactive_answer', 'agent_native_tool_choice'), true)
  assert.equal(helper('cos_interactive_answer', 'agent_answer_or_capability_plan_compat'), true)
  assert.equal(helper('cos_interactive_answer', 'semantic_task_intent'), true)
  assert.equal(helper('cos_interactive_answer', 'public_self_disclosure'), true)
  assert.equal(helper('cos_interactive_answer', 'user_facing_response'), false)
  assert.equal(helper('cos_interactive_answer', 'completion_rescue'), false)
  assert.equal(helper('cos_interactive_answer', 'public_disclosure_redaction'), false)
  assert.equal(helper('cos_interactive_answer', 'agent_tool_loop'), false)
  assert.equal(helper('cos_fresh_grounded_task'), false)
  assert.equal(helper('builder_graduate'), false)
})

test('both browser ingresses reserve the answer window out of their 150 s model deadline', () => {
  for (const path of ['app/api/cos-browser/route.ts', 'app/api/cos-provenance-browser/route.ts']) {
    const route = readFileSync(new URL('../' + path, import.meta.url), 'utf8')
    const opened = route.match(/runWithTurnDeadline\(\n[\s\S]*?\n\s*\)/g) || []
    assert.ok(opened.length >= 1, path)
    for (const call of opened) assert.match(call, /\{ answerReserveMs: USER_ANSWER_WINDOW_MS \},?\n\s*\)$/, path + ': ' + call)
  }
})

test('a helper with no surplus is refused before any transport or RunPod work; the answer call is not', () => {
  const source = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    const state=globalThis.__reserve={fetches:0,rows:[],remaining:40000,helper:0,answerStarted:false};
    registerHooks({
      resolve(specifier,context,next){
        const mocks=['localInferenceUsage.ts','cosTurnBudget.ts','modelRuntimeAssignment.ts','execution-context.ts'];
        const mock=mocks.find(name=>specifier.endsWith(name));
        return mock?{url:'mock:'+mock,shortCircuit:true}:next(specifier,context);
      },
      load(url,context,next){
        const modules={
          'mock:localInferenceUsage.ts':'export async function recordLocalInferenceUsage(row){globalThis.__reserve.rows.push(row)}',
          'mock:cosTurnBudget.ts':'export function turnDeadlineRemainingMs(){return globalThis.__reserve.remaining};export function helperDeadlineRemainingMs(){return globalThis.__reserve.helper};export function markUserAnswerStarted(){globalThis.__reserve.answerStarted=true};export const USER_ANSWER_WINDOW_MS=120000',
          'mock:modelRuntimeAssignment.ts':'export async function tryAssignedPlatformModelTurn(){return {attempted:false,result:null}}',
          'mock:execution-context.ts':'export function currentHarnessExecutionContext(){return null};export function harnessDeadlineRemainingMs(){return null};export function reserveHarnessProviderCostUsd(){};export function releaseHarnessProviderCostUsd(){};export function settleHarnessProviderCostUsd(){}',
        };
        return modules[url]?{format:'module',source:modules[url],shortCircuit:true}:next(url,context);
      }
    });
    globalThis.fetch=async ()=>{state.fetches++;return new Response(JSON.stringify({choices:[{message:{content:'{"answer":"ok","confidence":0.9}'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200,headers:{'content-type':'application/json'}})};
    process.env.RUNPOD_PRIMARY_ENABLED='false';
    const {callLocalModel}=await import(${JSON.stringify(new URL('../lib/ai/local-inference.ts', import.meta.url).href)});
    const config={baseUrl:'https://test.invalid/v1',model:'test-model',provider:'deepinfra',routeOwner:'itmounts',timeoutMs:5000};
    await assert.rejects(
      callLocalModel({prompt:'classify',usageContext:{feature:'cos_interactive_answer',purpose:'semantic_task_intent'}},config),
      /inference_answer_window_reserved/,
    );
    assert.equal(state.fetches,0,'a refused helper never reaches the provider');
    const answer=await callLocalModel({prompt:'answer',writesUserAnswer:true,usageContext:{feature:'cos_interactive_answer',purpose:'user_facing_response'}},config);
    assert.equal(answer,'{"answer":"ok","confidence":0.9}');
    assert.equal(state.fetches,1);
    assert.equal(state.answerStarted,true);
    state.helper=5000;
    const judged=await callLocalModel({prompt:'classify',usageContext:{feature:'cos_interactive_answer',purpose:'semantic_task_intent'}},config);
    assert.equal(judged,'{"answer":"ok","confidence":0.9}','with surplus the helper runs');
    assert.equal(state.fetches,2);
    console.log('ok');
  `
  const out = execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } })
  assert.match(out, /ok/)
})
