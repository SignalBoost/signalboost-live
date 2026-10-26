// saas/tests/localInferenceSettlementKeepsAnswer.node.test.ts
// Production 2026-10-26: provider cost settlement started failing closed by throwing, and it ran inside the call's
// finally block. A paid answer was then discarded and the call's usage row and telemetry were never written. The call
// keeps its answer and its record; the overspend stays in the ledger, so the next reservation fails closed.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

test('a settlement that fails closed keeps the paid answer and its usage record', () => {
  const source = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    const state=globalThis.__settlement={rows:[],settled:0,reserved:0};
    registerHooks({
      resolve(specifier,context,next){
        const mocks=['localInferenceUsage.ts','cosTurnBudget.ts','modelRuntimeAssignment.ts','execution-context.ts'];
        const mock=mocks.find(name=>specifier.endsWith(name));
        return mock?{url:'mock:'+mock,shortCircuit:true}:next(specifier,context);
      },
      load(url,context,next){
        const modules={
          'mock:localInferenceUsage.ts':'export async function recordLocalInferenceUsage(row){globalThis.__settlement.rows.push(row)}',
          'mock:cosTurnBudget.ts':'export function turnDeadlineRemainingMs(){return null}',
          'mock:modelRuntimeAssignment.ts':'export async function tryAssignedPlatformModelTurn(){return {attempted:false}}',
          'mock:execution-context.ts':'const signal=new AbortController().signal;export function currentHarnessExecutionContext(){return {signal,manifest:{runId:"run-1"},providerCostLedger:{maxCostUsd:0.24,reservedCostUsd:0}}};export function harnessDeadlineRemainingMs(){return null};export function reserveHarnessProviderCostUsd(){globalThis.__settlement.reserved++};export function settleHarnessProviderCostUsd(){globalThis.__settlement.settled++;throw new Error("harness_provider_cost_budget_exceeded")}',
        };
        return modules[url]?{format:'module',source:modules[url],shortCircuit:true}:next(url,context);
      }
    });
    globalThis.fetch=async ()=>new Response(JSON.stringify({
      choices:[{message:{content:'the paid answer'},finish_reason:'stop'}],
      usage:{prompt_tokens:10,completion_tokens:3,total_tokens:13,estimated_cost:0.30},
    }),{status:200,headers:{'content-type':'application/json'}});
    const {callLocalModel}=await import(${JSON.stringify(new URL('../lib/ai/local-inference.ts', import.meta.url).href)});
    const config={baseUrl:'https://api.deepinfra.com/v1/openai',model:'test-model',provider:'deepinfra',routeOwner:'external',timeoutMs:5000};
    const text=await callLocalModel({prompt:'answer',maxEstimatedCostUsd:0.08,usageContext:{feature:'builder'}},config);
    assert.equal(state.reserved,1);
    assert.equal(state.settled,1);
    assert.equal(text,'the paid answer');
    assert.equal(state.rows.length,1);
    assert.equal(state.rows[0].success,true);
    assert.equal(state.rows[0].providerEstimatedCostUsd,0.30);
  `
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', source], { encoding: 'utf8', stdio: 'pipe' }))
})
