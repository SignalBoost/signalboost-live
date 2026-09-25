import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBuyerModelProfiles } from '../lib/ai/modelCapabilityRegistry.ts'
import { parseModelTransportBindings } from '../lib/ai/modelTransportConfig.ts'
import { createMemoryModelConfigurationPort } from '../lib/ai/modelConfigurationMemory.ts'
import { createHostInjectedModelTransportAdapter } from '../lib/ai/modelTransportPlugin.ts'
import { runPlatformModelCertification } from '../lib/ai/modelCertification.ts'
import { assertModelAssignmentCertification } from '../lib/ai/modelGovernance.ts'
import { tryAssignedPlatformModelTurn } from '../lib/ai/modelRuntimeAssignment.ts'

function profile(key:string,modelId:string){
  return parseBuyerModelProfiles(JSON.stringify([{
    key,family:'acme_future',modelId,providerModelId:modelId,revisionPolicy:'runtime_owned',
    uses:['cos_reasoner','builder','specialist'],transportProtocols:['custom_http'],
    inference:{chatCompletion:'validated',structuredJson:'validated',toolCalling:'validated'},training:{},
  }]))[0]
}
function binding(key:string){
  return parseModelTransportBindings(JSON.stringify([{
    profileKey:key,protocol:'custom_http',provider:'acme',endpoint:'https://models.acme.invalid/invoke',
    timeoutMs:30000,maxCallCostUsd:0.25,
  }]))[0]
}

test('sale acceptance: unknown buyer models register, certify, switch, execute and rollback without core-model dependency', async()=>{
  const store=createMemoryModelConfigurationPort()
  const actor='buyer-owner'
  const first=profile('acme-reasoner-a-v1','acme/FutureReasoner-A')
  const second=profile('acme-reasoner-b-v1','acme/FutureReasoner-B')

  const regA=await store.register({profile:first,binding:binding(first.key),secretValue:'secret-A',secretName:'apiKey',actorId:actor})
  const regB=await store.register({profile:second,binding:binding(second.key),secretValue:'secret-B',secretName:'apiKey',actorId:actor})
  assert.ok(regA.binding.credentialRef)
  assert.ok(regB.binding.credentialRef)
  assert.equal(await store.vault.resolve(regA.binding.credentialRef!), 'secret-A')
  assert.equal(await store.vault.resolve(regB.binding.credentialRef!), 'secret-B')

  const invocations:string[]=[]
  const adapter=createHostInjectedModelTransportAdapter({
    id:'acme-custom-http-driver',protocol:'custom_http',
    supports:candidate=>candidate.family==='acme_future',
    health:async candidate=>({ok:true,provider:'acme',model:candidate.providerModelId,error:null}),
    invoke:async request=>{
      const registration=await store.getRegistration(request.profile.key)
      assert.ok(registration?.binding.credentialRef)
      const secret=await store.vault.resolve(registration!.binding.credentialRef!)
      assert.equal(secret,request.profile.key===first.key?'secret-A':'secret-B')
      invocations.push(request.profile.key)

      if(request.tools?.length){
        return {text:null,toolCalls:[{id:'cert-tool',name:'certify_echo',arguments:'{"token":"ITMOUNTS_MODEL_CERT_TOOL"}'}],finishReason:'tool_calls',provider:'acme',model:request.profile.providerModelId,inputTokens:8,outputTokens:4,requestId:'tool-req'}
      }
      if(request.jsonObject){
        return {text:'{"ok":true,"marker":"ITMOUNTS_MODEL_CERT_JSON"}',toolCalls:[],finishReason:'stop',provider:'acme',model:request.profile.providerModelId,inputTokens:8,outputTokens:6,requestId:'json-req'}
      }
      const prompt=String(request.messages.at(-1)?.content||'')
      const text=prompt.includes('ITMOUNTS_MODEL_CERT_OK') ? 'ITMOUNTS_MODEL_CERT_OK' : `LIVE:${request.profile.key}`
      return {text,toolCalls:[],finishReason:'stop',provider:'acme',model:request.profile.providerModelId,inputTokens:8,outputTokens:4,requestId:'chat-req'}
    },
  })

  const certA=await runPlatformModelCertification({profileKey:first.key,profiles:[first],adapters:[adapter],id:()=> 'cert-a'})
  const certB=await runPlatformModelCertification({profileKey:second.key,profiles:[second],adapters:[adapter],id:()=> 'cert-b'})
  assert.equal(certA.status,'passed')
  assert.equal(certB.status,'passed')
  assertModelAssignmentCertification({use:'cos_reasoner',profile:first,receipt:certA})
  assertModelAssignmentCertification({use:'cos_reasoner',profile:second,receipt:certB})

  const assignmentA=await store.assign({
    use:'cos_reasoner',profileKey:first.key,certificationEventId:certA.certificationId,
    actorId:actor,expectedCurrentAssignmentId:null,
  })
  const liveA=await tryAssignedPlatformModelTurn(
    {prompt:'ordinary buyer request',usageContext:{feature:'cos_interactive_answer'}},
    'cos_reasoner',{store,adapters:[adapter]},
  )
  assert.equal(liveA.attempted,true)
  assert.equal(liveA.profileKey,first.key)
  assert.equal(liveA.result?.content,`LIVE:${first.key}`)

  const assignmentB=await store.assign({
    use:'cos_reasoner',profileKey:second.key,certificationEventId:certB.certificationId,
    actorId:actor,expectedCurrentAssignmentId:assignmentA.assignmentId,
  })
  const liveB=await tryAssignedPlatformModelTurn(
    {prompt:'ordinary buyer request',usageContext:{feature:'cos_interactive_answer'}},
    'cos_reasoner',{store,adapters:[adapter]},
  )
  assert.equal(liveB.profileKey,second.key)
  assert.equal(liveB.result?.content,`LIVE:${second.key}`)

  const rolled=await store.rollback({
    use:'cos_reasoner',actorId:actor,expectedCurrentAssignmentId:assignmentB.assignmentId,
  })
  assert.equal(rolled.profileKey,first.key)
  const afterRollback=await tryAssignedPlatformModelTurn(
    {prompt:'ordinary buyer request',usageContext:{feature:'cos_interactive_answer'}},
    'cos_reasoner',{store,adapters:[adapter]},
  )
  assert.equal(afterRollback.profileKey,first.key)
  assert.equal(afterRollback.result?.content,`LIVE:${first.key}`)
  assert.ok(invocations.includes(first.key) && invocations.includes(second.key))
})

test('sale acceptance: credential rotation removes the superseded secret and active assignment blocks disable', async()=>{
  const store=createMemoryModelConfigurationPort()
  const actor='buyer-owner'
  const candidate=profile('acme-rotation-v1','acme/FutureRotation')
  const first=await store.register({profile:candidate,binding:binding(candidate.key),secretValue:'old-secret',actorId:actor})
  const oldRef=first.binding.credentialRef!
  const rotated=await store.register({profile:candidate,binding:binding(candidate.key),secretValue:'new-secret',actorId:actor})
  assert.equal(await store.vault.resolve(oldRef),null)
  assert.equal(await store.vault.resolve(rotated.binding.credentialRef!),'new-secret')
  const active=await store.assign({use:'cos_reasoner',profileKey:candidate.key,certificationEventId:'cert-evidence',actorId:actor,expectedCurrentAssignmentId:null})
  assert.ok(active.assignmentId)
  await assert.rejects(()=>store.disable(candidate.key,actor),/platform_model_disable_active_assignment/)
})
