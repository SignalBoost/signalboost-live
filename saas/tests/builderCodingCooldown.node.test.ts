import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

function exercise(scenario: string) {
  const source = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    const state = globalThis.__codingCancellation = { primaryCalls:0, fallbackCalls:0, assignedCalls:0, cooldown:true, primary:{text:null,attempted:true,reason:"timeout:probe"}, configs:[], inputs:[], abort:null };
    const modules = {
      '@/lib/ai/local-inference': 'export function localInferenceConfigFromEnv(){return {}}; export async function callLocalModel(input,config){const s=globalThis.__codingCancellation;s.fallbackCalls++;s.configs.push(config);s.inputs.push(input);return "fallback"}',
      '@/lib/ai/providerRouter': 'export function callProviderModel(){throw Error("unexpected paid fallback")}',
      '@/lib/cos/textGateway': 'export function callCosText(){throw Error("unexpected gateway")}',
      '@/lib/ai/cos/platformIdentityContext': 'export function requireBuilderCodingModel(){return "configured-coder"}',
      '@/lib/ai/cos/cosUniversityGraduateRuntime': 'export async function activeGraduateRuntimesForRole(){return []}',
      '@/lib/ai/cos/reasoningEvaluationContext': 'export function currentReasoningEvaluationContext(){return null}',
      '@/lib/ai/cos/runpodPrimaryInference': 'export async function tryRunpodPrimaryInference(){const s=globalThis.__codingCancellation;s.primaryCalls++;return s.primary}',
      '@/lib/ai/cos/runpodInferenceLease': 'export async function chatHasRunpodPriority(){return false}; export async function markChatRunpodDemand(){}',
      '@/lib/ai/localInferenceUsage': 'export const BUILDER_RUNPOD_HEALTH_WINDOW_MS=120000; export async function builderRunpodRecentlyTimingOut(){return globalThis.__codingCancellation.cooldown}',
      '@/lib/visuals/freshGeneration': 'export function freshVisualPrompt(x){return x}',
      '@/lib/ai/modelRuntimeAssignment': 'export async function tryAssignedPlatformModelTurn(){const s=globalThis.__codingCancellation;s.assignedCalls++;s.abort?.abort(new Error("owner_cancelled"));return {attempted:false}}',
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
    ${scenario}
  `
  execFileSync(process.execPath, ['--input-type=module', '-e', source], {encoding:'utf8', env:{...process.env,BUILDER_GRADUATE_MODE:'off'}})
}

test('shared cooldown prevents generic RunPod re-entry on every Builder port', () => exercise(`
  const controller=new AbortController();
  for(let i=0;i<3;i++) assert.equal(await createBuilderCodingAiPort().generate({prompt:'repair',signal:controller.signal,maxTokens:1234,allowTruncatedText:true}),'fallback');
  assert.equal(state.primaryCalls,0);assert.equal(state.assignedCalls,3);assert.equal(state.fallbackCalls,3);
  for(const config of state.configs){assert.equal(config.fallbackFromOwned,true,'cooldown must prevent generic reasoner routing');assert.equal(config.model,'configured-coder');}
  for(const input of state.inputs){assert.equal(input.signal,controller.signal);assert.equal(input.maxEstimatedCostUsd,0.01);assert.equal(input.maxTokens,1234);assert.equal(input.allowTruncatedText,true);}
`))

test('healthy coding primary still precedes fallback', () => exercise(`
  state.cooldown=false;state.primary={text:'owned',attempted:true};
  assert.equal(await createBuilderCodingAiPort().generate({prompt:'repair'}),'owned');
  assert.equal(state.primaryCalls,1);assert.equal(state.assignedCalls,0);assert.equal(state.fallbackCalls,0);
`))

test('failed coding probe retains fallback provenance', () => exercise(`
  state.cooldown=false;
  assert.equal(await createBuilderCodingAiPort().generate({prompt:'repair'}),'fallback');
  assert.equal(state.primaryCalls,1);assert.equal(state.configs[0].fallbackFromOwned,true);
`))

test('busy primary queues without buying configured fallback', () => exercise(`
  state.cooldown=false;state.primary={text:null,attempted:true,reason:'runpod_primary_busy'};
  await assert.rejects(createBuilderCodingAiPort().generate({prompt:'repair'}),/builder_runpod_primary_busy/);
  assert.equal(state.assignedCalls,1);assert.equal(state.fallbackCalls,0);
`))

test('cancellation during cooldown assignment remains terminal', () => exercise(`
  state.abort=new AbortController();
  await assert.rejects(createBuilderCodingAiPort().generate({prompt:'repair',signal:state.abort.signal}),/owner_cancelled/);
  assert.equal(state.primaryCalls,0);assert.equal(state.fallbackCalls,0);
`))
