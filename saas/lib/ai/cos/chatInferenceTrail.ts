//
// CHAT PROVIDER TRAIL (2026-09-30, owner: "TRACK THE PIPELINE"). The provenance reply lists every chat-answer
// model call recorded for the answered turn — which provider was tried, in order, how long it took and how it
// ended — so "why did DeepInfra answer instead of RunPod" is answered in the chat, not by running SQL.
//
// Zero imports.

export type ChatInferenceCall = {
  at: string
  provider: string
  feature: string | null
  success: boolean
  latencyMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  finishReason: string | null
}

/** One line per provider call, e.g. "02:07:04 runpod FAILED 8 ms — error:… → 02:07:22 deepinfra OK 17.7 s, 12059 in / 323 out". */
export function formatChatInferenceTrail(calls: ChatInferenceCall[] | null | undefined): string {
  if(calls==null)return 'unavailable'
  if(!calls.length)return 'no chat-answer model call recorded for the last answered turn'
  return calls.map(call=>{
    const time=call.at.slice(11,19)||call.at
    const took=call.latencyMs==null?'':call.latencyMs>=1000?` ${(call.latencyMs/1000).toFixed(1)} s`:` ${call.latencyMs} ms`
    const tokens=call.success&&(call.promptTokens!=null||call.completionTokens!=null)?`, ${call.promptTokens??'?'} in / ${call.completionTokens??'?'} out`:''
    const reason=call.success?(call.finishReason&&call.finishReason!=='stop'?` (${call.finishReason})`:''):` — ${call.finishReason||'no reason recorded'}`
    return `${time} ${call.provider} ${call.success?'OK':'FAILED'}${took}${tokens}${reason}`
  }).join(' → ')
}
