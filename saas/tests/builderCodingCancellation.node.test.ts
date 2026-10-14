import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

test('cancelling a coder graduate prevents remaining graduates and paid fallback', () => {
  const source = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    const state = globalThis.__codingCancellation = { graduateCalls: 0, fallbackCalls: 0 };
    const modules = {
      '@/lib/ai/local-inference': 'export function localInferenceConfigFromEnv(){globalThis.__codingCancellation.fallbackCalls++;return {}}; export async function callLocalModel(input){globalThis.__codingCancellation.graduateCalls++;return new Promise((_,reject)=>input.signal.addEventListener("abort",()=>reject(input.signal.reason),{once:true}))}',
      '@/lib/ai/providerRouter': 'export function callProviderModel(){throw Error("unexpected paid fallback")}',
      '@/lib/cos/textGateway': 'export function callCosText(){throw Error("unexpected gateway")}',
      '@/lib/ai/cos/platformIdentityContext': 'export function requireBuilderCodingModel(){throw Error("unexpected fallback model")}',
      '@/lib/ai/cos/cosUniversityGraduateRuntime': 'export async function activeGraduateRuntimesForRole(){return [{inference:{}},{inference:{}}]}',
      '@/lib/ai/cos/reasoningEvaluationContext': 'export function currentReasoningEvaluationContext(){return null}',
      '@/lib/ai/cos/runpodPrimaryInference': 'export function tryRunpodPrimaryInference(){throw Error("unexpected primary")}',
      '@/lib/ai/cos/runpodInferenceLease': 'export async function chatHasRunpodPriority(){return false}; export async function markChatRunpodDemand(){}',
      '@/lib/visuals/freshGeneration': 'export function freshVisualPrompt(x){return x}',
      '@/lib/ai/modelRuntimeAssignment': 'export function tryAssignedPlatformModelTurn(){throw Error("unexpected assigned fallback")}',
    };
    registerHooks({
      resolve(specifier, context, next) {
        if (modules[specifier]) return {url:'mock:'+specifier,shortCircuit:true};
        if (specifier.endsWith('deepInfraSpendPolicy.ts')) return {url:'mock:spend',shortCircuit:true};
        if (specifier.endsWith('execution-context.ts')) return {url:'mock:harness',shortCircuit:true};
        return next(specifier, context);
      },
      load(url,context,next){
        if(url==='mock:spend')return {format:'module',source:'export function deepInfraMaxCallUsd(){return 0.01}',shortCircuit:true};
        if(url==='mock:harness')return {format:'module',source:'export function currentHarnessExecutionContext(){return null}',shortCircuit:true};
        if(url.startsWith('mock:'))return {format:'module',source:modules[url.slice(5)],shortCircuit:true};
        return next(url,context);
      }
    });
    const { createBuilderCodingAiPort } = await import(${JSON.stringify(new URL('../lib/cos/aiPort.ts', import.meta.url).href)});
    const controller = new AbortController();
    const work = createBuilderCodingAiPort().generate({prompt:'repair',signal:controller.signal});
    await new Promise(resolve=>setImmediate(resolve));
    controller.abort(new Error('owner_cancelled'));
    await assert.rejects(work,/owner_cancelled/);
    assert.equal(state.graduateCalls,1);
    assert.equal(state.fallbackCalls,0);
    await assert.rejects(createBuilderCodingAiPort().generate({prompt:'repair',signal:controller.signal}),/owner_cancelled/);
    assert.equal(state.graduateCalls,1);
  `
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', env: { ...process.env, BUILDER_GRADUATE_MODE: 'serve' } }))
})
