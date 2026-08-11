import { createHash } from 'node:crypto'
import { callCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { loadUserMemories } from '@/lib/ai/tools/userMemory'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { SupabaseExactCacheStore } from '@/lib/cos-core/storage/exactSupabase'
import { createExactCacheKey } from '@/lib/cos-core/layers/exact-cache'

export type COSFirstAnswerResult =
  | { handled: true; reply: string; confidence: number; provenance: COSProvenance }
  | { handled: false; confidence: number; reason: string; provenance: COSProvenance }

export type COSProvenance = {
  responseSource: 'semantic_cache' | 'local_cos_reasoning' | 'external_fallback_required'
  externalAiInvoked: false
  localModelInvoked: boolean
  reasonerLabel: string | null
  internalSystemsConsulted: string[]
  knowledgeFactsUsed: number
  learnedItemsUsed: number
  userMemoriesUsed: number
}

const STOP_WORDS = new Set(['about','after','again','also','because','before','being','could','does','from','have','into','more','most','should','that','their','there','these','they','this','those','through','under','what','when','where','which','while','with','would','your','you','and','the','for','are','how','why'])
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

type CachedCosAnswer = { reply:string; confidence:number; reasonerLabel:string|null }

function threshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

function queryTerms(prompt: string): string[] {
  return [...new Set(prompt.toLowerCase().replace(/[^a-z0-9\s_-]/g, ' ').split(/\s+/).map(p => p.trim()).filter(p => p.length >= 4 && !STOP_WORDS.has(p)))].slice(0, 6)
}
function subjectFromPrompt(prompt: string): string { return queryTerms(prompt).slice(0, 4).join(' ') || 'general reasoning' }
function safeText(value: unknown, max = 1200): string { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) }

async function recordKnowledgeGap(prompt: string, confidence: number, reason: string): Promise<void> {
  const db = cosServiceDb(); if (!db) return
  try {
    const subject = subjectFromPrompt(prompt), question = safeText(prompt, 2000), capability = 'general_reasoning'
    const existing = await db.from('cos_learning_gaps').select('id,repeated_count').eq('task_id','support').eq('subject',subject).eq('question',question).eq('capability',capability).maybeSingle()
    if (existing.data?.id) {
      await db.from('cos_learning_gaps').update({ confidence, escalation_reason: safeText(reason,1000), repeated_count:Number(existing.data.repeated_count||1)+1, status:'pending', last_seen_at:new Date().toISOString(), resolved_at:null }).eq('id',existing.data.id)
    } else {
      await db.from('cos_learning_gaps').insert({ task_id:'support', subject, question, capability, confidence, escalation_reason:safeText(reason,1000), repeated_count:1, status:'pending', last_seen_at:new Date().toISOString() })
    }
  } catch {}
}
async function resolveKnowledgeGap(prompt: string): Promise<void> {
  const db=cosServiceDb(); if(!db)return
  try { await db.from('cos_learning_gaps').update({status:'resolved',resolved_at:new Date().toISOString(),last_seen_at:new Date().toISOString()}).eq('task_id','support').eq('question',safeText(prompt,2000)).eq('capability','general_reasoning').in('status',['pending','learning','failed']) } catch {}
}

async function retrieveInternalContext(prompt:string,userId?:string|null){
  const systems=['semantic/exact cache preflight']; const facts:string[]=[], learned:string[]=[], memories:string[]=[]; const terms=queryTerms(prompt); const db=cosServiceDb()
  if(db&&terms.length){
    systems.push('Enterprise Memory / Knowledge Graph','Continuous Learning Corpus')
    const factFilters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`predicate.ilike.%${t}%`,`object.ilike.%${t}%`]).join(',')
    const learnedFilters=terms.flatMap(t=>[`subject.ilike.%${t}%`,`summary.ilike.%${t}%`]).join(',')
    const [fr,lr]=await Promise.allSettled([
      db.from('cos_knowledge_facts').select('subject,predicate,object,confidence,source,updated_at').or(factFilters).order('confidence',{ascending:false}).limit(16),
      db.from('cos_continuous_learning').select('subject,summary,facts,confidence,source_kind,source_uri,observed_at').or(learnedFilters).order('confidence',{ascending:false}).limit(12),
    ])
    if(fr.status==='fulfilled'&&!fr.value.error) for(const r of fr.value.data??[]) facts.push(`${safeText(r.subject,180)} — ${safeText(r.predicate,120)} — ${safeText(r.object,600)} [confidence ${Number(r.confidence||0).toFixed(2)}; source ${safeText(r.source,180)}]`)
    if(lr.status==='fulfilled'&&!lr.value.error) for(const r of lr.value.data??[]){ const ef=Array.isArray(r.facts)?r.facts.slice(0,4).map((f:unknown)=>safeText(f,300)).join('; '):''; learned.push(`${safeText(r.subject,180)}: ${safeText(r.summary,800)}${ef?` Facts: ${ef}`:''} [confidence ${Number(r.confidence||0).toFixed(2)}; ${safeText(r.source_kind,80)} ${safeText(r.source_uri,280)}]`) }
  }
  if(userId){ systems.push('User Enterprise Memory'); const loaded=await loadUserMemories(userId).catch(()=>[]); for(const item of loaded.slice(-20)) memories.push(`[${item.kind}] ${safeText(item.content,500)}`) }
  return {systems:[...new Set(systems)],facts,learned,memories}
}
function parseLocalResult(raw:string){ const cleaned=raw.trim().replace(/^```json\s*/i,'').replace(/```$/i,'').trim(); try{const p=JSON.parse(cleaned) as {answer?:unknown;confidence?:unknown}; const answer=typeof p.answer==='string'?p.answer.trim():''; const confidence=Number(p.confidence); return answer&&Number.isFinite(confidence)?{answer,confidence:Math.max(0,Math.min(1,confidence))}:null}catch{return null} }

function contextFingerprint(context:{facts:string[];learned:string[];memories:string[]}):string{
  return createHash('sha256').update(JSON.stringify({facts:context.facts,learned:context.learned,memories:context.memories})).digest('hex')
}

async function readCachedAnswer(key:string):Promise<CachedCosAnswer|null>{
  const db=cosServiceDb(); if(!db)return null
  try { return (await new SupabaseExactCacheStore(db).get<CachedCosAnswer>(key))?.value ?? null } catch { return null }
}
async function writeCachedAnswer(key:string,value:CachedCosAnswer):Promise<void>{
  const db=cosServiceDb(); if(!db)return
  try { const now=Date.now(); await new SupabaseExactCacheStore(db).set(key,{value,createdAt:now,expiresAt:now+CACHE_TTL_MS}) } catch {}
}

export async function tryCOSFirstAnswer(input:{prompt:string;userId?:string|null;language?:string;privileged?:boolean}):Promise<COSFirstAnswerResult>{
  // Internal COS knowledge is always consulted before deciding whether a reasoner or external fallback is required.
  const context=await retrieveInternalContext(input.prompt,input.userId)
  const base={ externalAiInvoked:false as const, localModelInvoked:false, reasonerLabel:null as string|null, internalSystemsConsulted:context.systems, knowledgeFactsUsed:context.facts.length, learnedItemsUsed:context.learned.length, userMemoriesUsed:context.memories.length }
  const cacheKey=createExactCacheKey({taskId:'cos-first-answer',prompt:input.prompt,contextFingerprint:contextFingerprint(context),policyVersion:`threshold:${threshold().toFixed(2)}`,knowledgeVersion:null})
  const cached=await readCachedAnswer(cacheKey)
  if(cached&&cached.reply&&cached.confidence>=threshold()){
    return {handled:true,reply:cached.reply,confidence:cached.confidence,provenance:{responseSource:'semantic_cache',...base,reasonerLabel:cached.reasonerLabel}}
  }

  if(process.env.COS_LOCAL_FIRST_ENABLED==='false'){
    const reason='COS-first answering is disabled by COS_LOCAL_FIRST_ENABLED.'; void recordKnowledgeGap(input.prompt,0,reason)
    return {handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...base}}
  }
  const resolved=resolveCosReasoner()
  if(!resolved.config){
    const reason='reason' in resolved?resolved.reason:'Independent COS reasoner is not configured.'; void recordKnowledgeGap(input.prompt,0,reason)
    return {handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...base}}
  }

  const evidenceCount=context.facts.length+context.learned.length
  const internalContext=[context.facts.length?`KNOWLEDGE GRAPH FACTS:\n${context.facts.join('\n')}`:'',context.learned.length?`CONTINUOUS LEARNING CORPUS:\n${context.learned.join('\n')}`:'',context.memories.length?`USER ENTERPRISE MEMORY:\n${context.memories.join('\n')}`:''].filter(Boolean).join('\n\n')
  const reasoned=await callCosReasoner({temperature:.15,maxTokens:3000,systemPrompt:`You are COS, SignalBoost's independent PRIMARY reasoning layer. Reason from the user's question, your open/self-hosted model knowledge, and supplied internal evidence. Distinguish evidence from inference. Never invent sources. If evidence is insufficient, lower confidence. Reply in ${input.language||'English'}. Return ONLY strict JSON: {"answer":"complete answer","confidence":0.0}.`,prompt:`${internalContext||'No matching durable internal evidence was retrieved for this question.'}\n\nUSER QUESTION:\n${input.prompt}`}).catch(()=>null)
  const provenance={...base,localModelInvoked:true,reasonerLabel:reasoned?.reasoner.label??resolved.config.label}
  if(!reasoned?.text){const reason='Independent COS inference did not return an answer.';void recordKnowledgeGap(input.prompt,0,reason);return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...provenance}}}
  const parsed=parseLocalResult(reasoned.text); if(!parsed){const reason='Independent COS inference returned an unparseable result.';void recordKnowledgeGap(input.prompt,0,reason);return{handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...provenance}}}
  const ceiling=evidenceCount>=5?.96:evidenceCount>=2?.90:evidenceCount===1?.84:.78; const confidence=Math.min(parsed.confidence,ceiling)
  if(confidence<threshold()){const reason=`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}.`;void recordKnowledgeGap(input.prompt,confidence,reason);return{handled:false,confidence,reason,provenance:{responseSource:'external_fallback_required',...provenance}}}
  void writeCachedAnswer(cacheKey,{reply:parsed.answer,confidence,reasonerLabel:provenance.reasonerLabel})
  void resolveKnowledgeGap(input.prompt); return{handled:true,reply:parsed.answer,confidence,provenance:{responseSource:'local_cos_reasoning',...provenance}}
}

export function formatCosWorkflowStatement(result:COSFirstAnswerResult,language='en'):string{
  const p=result.provenance,evidence=`${p.knowledgeFactsUsed} knowledge facts, ${p.learnedItemsUsed} learned items, ${p.userMemoriesUsed} memories`
  const source=p.responseSource==='semantic_cache'?'semantic cache':p.reasonerLabel
  if(language==='pt') return result.handled?`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}) → respondeu via ${source} com confiança ${result.confidence.toFixed(2)}. Nenhuma IA externa foi chamada.`:`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}) → não atingiu confiança suficiente → IA externa é apenas o último recurso.`
  if(language==='es') return result.handled?`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}) → respondió vía ${source} con confianza ${result.confidence.toFixed(2)}. No se llamó IA externa.`:`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}) → no alcanzó confianza suficiente → la IA externa es solo el último recurso.`
  return result.handled?`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}) → answered via ${source} at confidence ${result.confidence.toFixed(2)}. No external AI was called.`:`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}) → did not reach sufficient confidence → external AI is the last resort.`
}
