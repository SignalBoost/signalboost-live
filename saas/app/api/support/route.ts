// Durable multi-turn provenance wrapper for the production support route.
import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { tryDeterministicUtility } from '@/lib/ai/cos/deterministicUtilities'
import { authoritativeProvenance,formatAuthoritativeProvenance,isProvenanceIntrospection } from '@/lib/ai/cos/cosOrchestration'
import { persistTurn } from '@/lib/ai/tools/conversationHistory'
import { attachRecordedTurnProvenance,latestRecordedTurnProvenance,recordedTurnProvenanceByContent,recordLatestUserTurnProvenance,latestUserTurnProvenance,type RecordedTurnProvenance } from '@/lib/ai/cos/supportTurnProvenance'
import { POST as legacyPOST } from './routeCoreLegacy'

export { guardConfabulatedAction } from './routeCoreLegacy'
export const maxDuration = 300

type SupportMessage = { role?: 'user' | 'assistant' | 'system'; content?: string }
function conversationIdFrom(body:any):string|null{const value=String(body?.context?.conversationId||'');return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:null}
function latestUserMessage(body:any):string{const messages=(Array.isArray(body?.messages)?body.messages:[]) as SupportMessage[];for(let i=messages.length-1;i>=0;i--){const m=messages[i];if(m?.role==='user'&&typeof m.content==='string'&&m.content.trim())return m.content.trim()}return''}
function previousAssistantMessage(body:any):string{const messages=(Array.isArray(body?.messages)?body.messages:[]) as SupportMessage[];for(let i=messages.length-1;i>=0;i--){const m=messages[i];if(m?.role==='assistant'&&typeof m.content==='string'&&m.content.trim())return m.content.trim()}return''}
function languageCodeFrom(body:any):string{const v=String(body?.context?.language||'en').toLowerCase();return['en','es','pt','pl','ru'].includes(v)?v:'en'}
function noPriorProvenanceReply(languageCode:string):string{if(languageCode==='es')return'No tengo un registro de procedencia real para la respuesta inmediatamente anterior de esta conversación. No voy a reconstruirlo ni inventarlo después de los hechos.';if(languageCode==='pt')return'Não tenho um registro de proveniência real para a resposta imediatamente anterior desta conversa. Não vou reconstruí-lo nem inventá-lo depois do fato.';if(languageCode==='pl')return'Nie mam prawdziwego zapisu proweniencji bezpośrednio poprzedniej odpowiedzi w tej rozmowie. Nie będę go odtwarzać ani wymyślać po fakcie.';if(languageCode==='ru')return'У меня нет реальной записи происхождения непосредственно предыдущего ответа в этом разговоре. Я не буду восстанавливать или придумывать её постфактум.';return"I don't have a real provenance record for the immediately preceding answer in this conversation. I won't reconstruct or fabricate it after the fact."}
function deterministicProvenance(body:any,prompt:string):RecordedTurnProvenance|null{const languageCode=languageCodeFrom(body);const result=tryDeterministicUtility({prompt,timezone:body?.context?.timezone||body?.context?.timeZone,locale:languageCode==='pt'?'pt-BR':languageCode==='es'?'es':languageCode==='pl'?'pl':languageCode==='ru'?'ru':'en-US',confidenceThreshold:Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD||'0.72')});return result?.executionProvenance??null}
function provenanceFromResponse(body:any,prompt:string,payload:any,isPrivileged:boolean):RecordedTurnProvenance|null{if(payload?.execution_provenance&&typeof payload.execution_provenance==='object'&&!Array.isArray(payload.execution_provenance))return payload.execution_provenance as RecordedTurnProvenance;const source=String(payload?.source||'');if(source.startsWith('deterministic-current-'))return deterministicProvenance(body,prompt);if(source==='anthropic-chief'||source==='anthropic-concierge')return authoritativeProvenance(null,{invoked:true,provider:'anthropic',model:isPrivileged?'claude-sonnet-4-6':'claude-haiku-4-5'}) as RecordedTurnProvenance;if(source==='deterministic-concierge')return authoritativeProvenance(null,{invoked:false}) as RecordedTurnProvenance;return null}
async function persistResponseTurn(params:{conversationId:string;userId:string;userMessage:string;assistantReply:string;provenance:RecordedTurnProvenance|null;source:string}){const{conversationId,userId,userMessage,assistantReply,provenance,source}=params;if(!provenance)return;if(source==='anthropic-chief'||source==='anthropic-concierge'){const attached=await attachRecordedTurnProvenance(conversationId,userId,assistantReply,provenance);if(attached)return}await persistTurn({conversationId,userId,userMessage,assistantReply,provenance})}
async function persistProvenanceReply(params:{conversationId:string|null;userId:string;userMessage:string;assistantReply:string;provenance:RecordedTurnProvenance|null}){const{conversationId,userId,userMessage,assistantReply,provenance}=params;if(!conversationId||!assistantReply)return;try{await persistTurn({conversationId,userId,userMessage,assistantReply,...(provenance?{provenance}:{})})}catch(error){console.error('support provenance reply persistence failed (non-blocking)',error)}}

export async function POST(req:NextRequest){
  let body:any=null;try{body=await req.clone().json()}catch{return legacyPOST(req)}
  const prompt=latestUserMessage(body),precedingAssistant=previousAssistantMessage(body),conversationId=conversationIdFrom(body),languageCode=languageCodeFrom(body)
  let userId:string|null=null,isPrivileged=false;try{const access=await getAccess();userId=access.userId;isPrivileged=Boolean(access.isAdmin||access.isOwner)}catch{}

  if(prompt&&isProvenanceIntrospection(prompt)&&userId){
    const recorded=(conversationId?await latestRecordedTurnProvenance(conversationId,userId):null)
      ??(precedingAssistant?await recordedTurnProvenanceByContent(userId,precedingAssistant):null)
      ??(precedingAssistant?await latestUserTurnProvenance(userId,precedingAssistant):null)
      ??(!precedingAssistant?await latestUserTurnProvenance(userId):null)
    const reply=recorded?formatAuthoritativeProvenance(recorded as any,languageCode):noPriorProvenanceReply(languageCode)
    await persistProvenanceReply({conversationId,userId,userMessage:prompt,assistantReply:reply,provenance:recorded})
    if(!recorded)return NextResponse.json({reply,source:'cos-no-provenance-record',external_ai_invoked:false})
    return NextResponse.json({reply,source:'cos-authoritative-provenance',execution_provenance:recorded,external_ai_invoked:false})
  }

  const response=await legacyPOST(req)
  if(!response.ok||!prompt||!userId)return response
  try{
    const payload=await response.clone().json();const reply=typeof payload?.reply==='string'?payload.reply.trim():'';if(!reply)return response
    const source=String(payload?.source||''),provenance=provenanceFromResponse(body,prompt,payload,isPrivileged)
    if(provenance){
      await recordLatestUserTurnProvenance(userId,reply,provenance,source)
      if(conversationId)await persistResponseTurn({conversationId,userId,userMessage:prompt,assistantReply:reply,provenance,source})
    }
  }catch(error){console.error('support provenance persistence failed (non-blocking)',error)}
  return response
}
