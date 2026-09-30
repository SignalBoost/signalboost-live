//
// CHAT PROVIDER TRAIL (2026-09-30, owner: "TRACK THE PIPELINE"). The provenance reply lists every chat-answer
// model call recorded for the answered turn — which provider was tried, in order, how long it took and how it
// ended — so "why did DeepInfra answer instead of RunPod" is answered in the chat, not by running SQL.
//
// Zero imports.

/**
 * Every lane a chat turn can answer through (2026-09-30). The first version read only user_facing_response and
 * showed "no chat-answer model call recorded" for a question the contextual-interpretation lane answered.
 */
export const CHAT_TURN_PURPOSES = Object.freeze([
  'user_facing_response',
  'user_facing_release_repair',
  'contextual_interpretation',
  'completion_rescue',
  'fresh_grounded_task',
  'live_fact_synthesis',
  'travel_plan_grounded',
  'travel_plan_grounded_retry',
  'owner_self_knowledge_fallback',
  'native_language_review',
  'answer_freshness_reflection',
  'public_scope_repair',
  'public_disclosure_redaction',
] as const)

export type ChatInferenceCall = {
  at: string
  provider: string
  feature: string | null
  /** Which answer lane made the call (user_facing_response = the main pool-grounded path). */
  purpose?: string | null
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
    const lane=call.purpose?` [${call.purpose}]`:''
    return `${time} ${call.provider}${lane} ${call.success?'OK':'FAILED'}${took}${tokens}${reason}`
  }).join(' → ')
}

export type TurnStage = { at: string; stage: string; latencyMs: number }

/** Where the answered turn spent its time, longest stage first. */
export function formatTurnStages(stages: TurnStage[] | null | undefined, limit = 8): string {
  if (stages == null) return 'unavailable'
  if (!stages.length) return 'no stage timings recorded for the last answered turn'
  const duration = (ms:number) => ms >= 1000 ? `${(ms/1000).toFixed(1)} s` : `${ms} ms`
  return [...stages].sort((a,b)=>b.latencyMs-a.latencyMs).slice(0,limit).map(stage=>`${stage.stage} ${duration(stage.latencyMs)}`).join(' · ')
}
