import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collectTeacherModels, isNonTextModelName } from '../lib/lab/labTeacherModels.ts'
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8')
const api=read('../app/api/lab/teacher-models/route.ts')
const ui=read('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx')
const sql=read('../supabase/migrations/20261012030000_lab_model_directory_credential.sql')

test('model choices originate in live provider APIs and not static curated lists',()=>{
  assert.match(api,/huggingface: \{ url: 'https:\/\/router\.huggingface\.co\/v1\/models'/)
  // No platform price list: every model the key can use is offered.
  assert.doesNotMatch(api,/priced_teacher_models|teacher_rate_cards|priced/)
  for(const name of ['huggingface','openai','anthropic','gemini','xai','deepseek','qwen','mistral','groq','openrouter','together','fireworks','deepinfra'])assert.match(api,new RegExp(name+': \\{ url:'))
  assert.match(api,/await fetch\(spec\.url/)
  assert.match(api,/cache: 'no-store'/)
  assert.match(api,/redirect: 'error'/)
  assert.match(api,/source: 'live'/)
})
test('customer model discovery is credential-bound and never exposes keys',()=>{
  assert.match(api,/customerSession\(\)/)
  assert.match(api,/itmounts_lab_customer_open_model_directory_credential/)
  assert.match(api,/openCustomerCredential/)
  assert.match(api,/data\.providerKind !== provider/)
  assert.doesNotMatch(api,/process\.env\.[A-Z_]*API_KEY/)
  assert.match(sql,/customer_member_role\(uid, p_organization_id\)/)
  assert.match(sql,/revoked_at is null/)
  assert.match(sql,/revoke all on function public\.itmounts_lab_customer_open_model_directory_credential\(uuid,uuid\) from public, anon, service_role/)
})
test('teacher dropdown uses credential and current workspace for live data',()=>{
  assert.match(ui,/teacher-models\?provider=/)
  assert.match(ui,/credentialId=\$\{encodeURIComponent\(teacherId\)\}/)
  assert.match(ui,/organizationId=\$\{encodeURIComponent\(organizationId\)\}/)
  assert.match(ui,/setTeacherModelsError\(true\)/)
  assert.match(ui,/teacherModels\.map\(model => <option key=\{model\.id\} value=\{model\.id\}>\{model\.id\}<\/option>\)/)
  assert.doesNotMatch(ui,/model\.priced/)
  assert.match(ui,/LAB UI v2026\.10\.12\.10/)
})

test('teacher list hides embedding, speech, image, moderation and completions-only models (OpenAI list)',()=>{
  const openai={data:['gpt-4o','gpt-4.1-mini','o4-mini','text-embedding-3-small','text-embedding-ada-002','whisper-1','tts-1-hd','gpt-4o-mini-tts',
    'gpt-4o-transcribe','dall-e-3','gpt-image-1','omni-moderation-latest','davinci-002','babbage-002','gpt-4o-realtime-preview','gpt-4o-audio-preview','sora-2'].map(id=>({id,object:'model'}))}
  assert.deepEqual(collectTeacherModels(openai,'openai'),['gpt-4.1-mini','gpt-4o','o4-mini'])
})
test('provider-declared model kinds decide first (Together, Mistral, OpenRouter, Gemini)',()=>{
  const together=[{id:'meta-llama/Llama-3.3-70B-Instruct-Turbo',type:'chat'},{id:'Qwen/Qwen2.5-Coder-32B-Instruct',type:'code'},
    {id:'togethercomputer/m2-bert-80M-8k-retrieval',type:'embedding'},{id:'Salesforce/Llama-Rank-V1',type:'rerank'},
    {id:'cartesia/sonic',type:'audio'},{id:'black-forest-labs/FLUX.1-schnell',type:'image'}]
  assert.deepEqual(collectTeacherModels(together,'together'),['meta-llama/Llama-3.3-70B-Instruct-Turbo','Qwen/Qwen2.5-Coder-32B-Instruct'])
  const mistral={data:[{id:'mistral-large-latest',capabilities:{completion_chat:true}},{id:'mistral-ocr-latest',capabilities:{completion_chat:false}},{id:'mistral-embed',capabilities:{completion_chat:false}}]}
  assert.deepEqual(collectTeacherModels(mistral,'mistral'),['mistral-large-latest'])
  const openrouter={data:[{id:'anthropic/claude-sonnet-4',architecture:{output_modalities:['text']}},{id:'some/paint-model',architecture:{output_modalities:['image']}}]}
  assert.deepEqual(collectTeacherModels(openrouter,'openrouter'),['anthropic/claude-sonnet-4'])
  const gemini={models:[{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent','countTokens']},{name:'models/text-embedding-004',supportedGenerationMethods:['embedContent']}]}
  assert.deepEqual(collectTeacherModels(gemini,'gemini'),['gemini-2.5-flash'])
})
test('name check does not hide ordinary chat models',()=>{
  for(const id of ['claude-opus-4-1','deepseek-chat','deepseek-reasoner','grok-4','qwen-max','llama-3.3-70b-versatile','meta-llama/Llama-3.2-11B-Vision-Instruct',
    'accounts/fireworks/models/llama-v3p1-70b-instruct','mistralai/Mixtral-8x7B-Instruct-v0.1','gemini-2.5-pro'])assert.equal(isNonTextModelName(id),false,id)
  for(const id of ['nomic-ai/nomic-embed-text-v1.5','BAAI/bge-large-en-v1.5','meta-llama/Llama-Guard-4-12B','stabilityai/stable-diffusion-xl-base-1.0','whisper-large-v3'])assert.equal(isNonTextModelName(id),true,id)
})
test('route uses the shared teacher filter',()=>{
  assert.match(api,/collectTeacherModels\(await response\.json\(\), provider\)/)
  assert.doesNotMatch(api,/function collectModels/)
})
