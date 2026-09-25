import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBuyerModelProfiles } from '../lib/ai/modelCapabilityRegistry.ts'
import { createHostInjectedModelTransportAdapter, runModelTransportPluginConformance } from '../lib/ai/modelTransportPlugin.ts'

function buyerProfile(protocol:'native_sdk'|'local_runtime'|'custom_http'='custom_http'){
  return parseBuyerModelProfiles(JSON.stringify([{
    key:`buyer-plugin-${protocol}-v1`, family:'future_family', modelId:`future/${protocol}`,
    providerModelId:`future-${protocol}`, revisionPolicy:'runtime_owned',
    uses:['cos_reasoner'], transportProtocols:[protocol],
    inference:{ chatCompletion:'validated', structuredJson:'validated', toolCalling:'validated' }, training:{},
  }]))[0]
}

test('host-injected custom transport passes the canonical conformance suite', async()=>{
  const profile=buyerProfile('custom_http')
  const adapter=createHostInjectedModelTransportAdapter({
    id:'buyer-custom-driver', protocol:'custom_http',
    supports:candidate=>candidate.key===profile.key,
    health:async candidate=>({ok:true,provider:'buyer',model:candidate.providerModelId,error:null}),
    invoke:async request=>{
      if(request.tools?.length) return {text:null,toolCalls:[{id:'call-1',name:'itmounts_plugin_echo',arguments:'{"token":"ok"}'}],finishReason:'tool_calls',provider:'buyer',model:request.profile.providerModelId,inputTokens:3,outputTokens:2,requestId:'req-tool'}
      if(request.jsonObject) return {text:'{"ok":true}',toolCalls:[],finishReason:'stop',provider:'buyer',model:request.profile.providerModelId,inputTokens:3,outputTokens:2,requestId:'req-json'}
      return {text:'ITMOUNTS_PLUGIN_OK',toolCalls:[],finishReason:'stop',provider:'buyer',model:request.profile.providerModelId,inputTokens:3,outputTokens:2,requestId:'req-chat'}
    },
  })
  const checks=await runModelTransportPluginConformance({profile,adapter})
  assert.deepEqual(checks.map(item=>[item.id,item.status]),[
    ['supports','passed'],['health','passed'],['chat','passed'],['json','passed'],['tool','passed'],
  ])
})

test('plugin adapter refuses response model substitution', async()=>{
  const profile=buyerProfile('native_sdk')
  const adapter=createHostInjectedModelTransportAdapter({
    id:'native-driver',protocol:'native_sdk',supports:()=>true,
    health:async()=>({ok:true,provider:'native',model:profile.providerModelId,error:null}),
    invoke:async()=>({text:'x',toolCalls:[],finishReason:'stop',provider:'native',model:'different/model',inputTokens:null,outputTokens:null,requestId:null}),
  })
  await assert.rejects(()=>adapter.chat({profile,messages:[{role:'user',content:'x'}]}),/platform_model_plugin_response_model_mismatch/)
})

test('plugin SDK accepts only host-injected protocols', ()=>{
  assert.throws(()=>createHostInjectedModelTransportAdapter({
    id:'wrong',protocol:'openai_compatible' as any,supports:()=>true,
    health:async()=>({ok:true,provider:'x',model:'x',error:null}),
    invoke:async()=>({text:'x',toolCalls:[],finishReason:'stop',provider:'x',model:'x',inputTokens:null,outputTokens:null,requestId:null}),
  }),/platform_model_plugin_protocol_invalid/)
})
