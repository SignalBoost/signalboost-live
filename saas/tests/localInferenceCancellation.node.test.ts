import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

test('local inference cancellation aborts fetch; expired work emits no phantom provider calls', () => {
  const source = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    const state=globalThis.__localCancellation={fetches:0,rows:[],remaining:null};
    registerHooks({
      resolve(specifier,context,next){
        const mocks=['localInferenceUsage.ts','cosTurnBudget.ts','modelRuntimeAssignment.ts','execution-context.ts'];
        const mock=mocks.find(name=>specifier.endsWith(name));
        return mock?{url:'mock:'+mock,shortCircuit:true}:next(specifier,context);
      },
      load(url,context,next){
        const modules={
          'mock:localInferenceUsage.ts':'export async function recordLocalInferenceUsage(row){globalThis.__localCancellation.rows.push(row)}',
          'mock:cosTurnBudget.ts':'export function turnDeadlineRemainingMs(){return globalThis.__localCancellation.remaining}',
          'mock:modelRuntimeAssignment.ts':'export async function tryAssignedPlatformModelTurn(){throw Error("unexpected assigned fallback")}',
          'mock:execution-context.ts':'export function currentHarnessExecutionContext(){return null};export function harnessDeadlineRemainingMs(){return null};export function reserveHarnessProviderCostUsd(){throw Error("unexpected reservation")}',
        };
        return modules[url]?{format:'module',source:modules[url],shortCircuit:true}:next(url,context);
      }
    });
    let seen;
    globalThis.fetch=async (_url,init)=>{
      state.fetches++;seen=init.signal;
      return new Promise((_,reject)=>seen.addEventListener('abort',()=>reject(seen.reason),{once:true}));
    };
    const {callLocalModel}=await import(${JSON.stringify(new URL('../lib/ai/local-inference.ts', import.meta.url).href)});
    const config={baseUrl:'https://test.invalid/v1',model:'test-model',provider:'runpod',routeOwner:'itmounts',timeoutMs:1000};
    const controller=new AbortController();
    const input={prompt:'repair',signal:controller.signal,usageContext:{feature:'builder_graduate'}};
    const work=callLocalModel(input,config);
    await new Promise(resolve=>setImmediate(resolve));
    controller.abort(new Error('owner_cancelled'));
    await assert.rejects(work,/owner_cancelled/);
    assert.equal(seen.aborted,true);
    assert.equal(state.fetches,1);
    assert.equal(state.rows.length,1);
    assert.equal(state.rows[0].finishReason,'aborted:inference_owner_cancelled');
    await assert.rejects(callLocalModel(input,config),/owner_cancelled/);
    state.remaining=0;
    await assert.rejects(callLocalModel({prompt:'repair'},config),/inference_deadline_expired/);
    assert.equal(state.fetches,1);
    assert.equal(state.rows.length,1);
  `
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', stdio: 'pipe' }))
})
