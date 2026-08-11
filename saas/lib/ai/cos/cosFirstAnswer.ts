import { callCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { runTargetedGapResearch } from '@/lib/ai/cos/targetedResearch'
import { loadUserMemories } from '@/lib/ai/tools/userMemory'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export type COSFirstAnswerResult =
  | { handled: true; reply: string; confidence: number; provenance: COSProvenance }
  | { handled: false; confidence: number; reason: string; provenance: COSProvenance }

export type COSProvenance = {
  responseSource: 'local_cos_reasoning' | 'external_fallback_required'
  externalAiInvoked: false
  localModelInvoked: boolean
  reasonerLabel: string | null
  internalSystemsConsulted: string[]
  knowledgeFactsUsed: number
  learnedItemsUsed: number
  userMemoriesUsed: number
  researchAttempted: boolean
  researchAccepted: number
  knowledgeNewlyRetained: boolean
}

const STOP_WORDS = new Set(['about','after','again','also','because','before','being','could','does','from','have','into','more','most','should','that','their','there','these','they','this','those','through','under','what','when','where','which','while','with','would','your','you','and','the','for','are','how','why'])

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

async function reasonFromContext(input:{prompt:string;language?:string},context:Awaited<ReturnType<typeof retrieveInternalContext>>,reasonerLabel:string){
  const evidenceCount=context.facts.length+context.learned.length
  const internalContext=[context.facts.length?`KNOWLEDGE GRAPH FACTS:\n${context.facts.join('\n')}`:'',context.learned.length?`CONTINUOUS LEARNING CORPUS:\n${context.learned.join('\n')}`:'',context.memories.length?`USER ENTERPRISE MEMORY:\n${context.memories.join('\n')}`:''].filter(Boolean).join('\n\n')
  const reasoned=await callCosReasoner({temperature:.15,maxTokens:3000,systemPrompt:`You are COS, SignalBoost's provider-independent PRIMARY reasoning layer. Reason from the user's question, your model knowledge, and supplied internal evidence. Distinguish evidence from inference. Never invent sources. If evidence is insufficient, lower confidence. Reply in ${input.language||'English'}. Return ONLY strict JSON: {"answer":"complete answer","confidence":0.0}.`,prompt:`${internalContext||'No matching durable internal evidence was retrieved for this question.'}\n\nUSER QUESTION:\n${input.prompt}`}).catch(()=>null)
  if(!reasoned?.text) return { parsed:null, label:reasoned?.reasoner.label??reasonerLabel, confidence:0 }
  const parsed=parseLocalResult(reasoned.text)
  if(!parsed) return { parsed:null, label:reasoned.reasoner.label??reasonerLabel, confidence:0 }
  const ceiling=evidenceCount>=5?.96:evidenceCount>=2?.90:evidenceCount===1?.84:.78
  return { parsed, label:reasoned.reasoner.label??reasonerLabel, confidence:Math.min(parsed.confidence,ceiling) }
}

export async function tryCOSFirstAnswer(input:{prompt:string;userId?:string|null;language?:string;privileged?:boolean}):Promise<COSFirstAnswerResult>{
  let context=await retrieveInternalContext(input.prompt,input.userId)
  const base={ externalAiInvoked:false as const, localModelInvoked:false, reasonerLabel:null as string|null, internalSystemsConsulted:context.systems, knowledgeFactsUsed:context.facts.length, learnedItemsUsed:context.learned.length, userMemoriesUsed:context.memories.length, researchAttempted:false, researchAccepted:0, knowledgeNewlyRetained:false }

  if(process.env.COS_LOCAL_FIRST_ENABLED==='false'){
    const reason='COS-first answering is disabled by COS_LOCAL_FIRST_ENABLED.'; void recordKnowledgeGap(input.prompt,0,reason)
    return {handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...base}}
  }
  const resolved=resolveCosReasoner()
  if(!resolved.config){
    const reason='reason' in resolved?resolved.reason:'COS reasoner is not configured.'; void recordKnowledgeGap(input.prompt,0,reason)
    return {handled:false,confidence:0,reason,provenance:{responseSource:'external_fallback_required',...base}}
  }

  let first=await reasonFromContext(input,context,resolved.config.label)
  let provenance={...base,localModelInvoked:true,reasonerLabel:first.label}
  if(first.parsed&&first.confidence>=threshold()){
    void resolveKnowledgeGap(input.prompt)
    return{handled:true,reply:first.parsed.answer,confidence:first.confidence,provenance:{responseSource:'local_cos_reasoning',...provenance}}
  }

  // Before any cloud-model fallback, attempt zero-LLM targeted research against approved
  // sources. Accepted material is persisted by the continuous-learning store and immediately
  // re-read from the same corpus/fact tables used by this answer path.
  const research=await runTargetedGapResearch({prompt:input.prompt,subject:subjectFromPrompt(input.prompt)}).catch(()=>null)
  if(research?.attempted){
    context=await retrieveInternalContext(input.prompt,input.userId)
    const second=await reasonFromContext(input,context,resolved.config.label)
    provenance={...provenance,reasonerLabel:second.label,internalSystemsConsulted:[...new Set([...context.systems,'Targeted approved-source research'])],knowledgeFactsUsed:context.facts.length,learnedItemsUsed:context.learned.length,userMemoriesUsed:context.memories.length,researchAttempted:true,researchAccepted:research.accepted,knowledgeNewlyRetained:research.accepted>0}
    if(second.parsed&&second.confidence>=threshold()){
      void resolveKnowledgeGap(input.prompt)
      return{handled:true,reply:second.parsed.answer,confidence:second.confidence,provenance:{responseSource:'local_cos_reasoning',...provenance}}
    }
    first=second
  }

  const confidence=first.confidence||0
  const reason=first.parsed?`COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)} after internal retrieval${provenance.researchAttempted?' and targeted research':''}.`:'COS inference did not return a usable answer after internal retrieval.'
  void recordKnowledgeGap(input.prompt,confidence,reason)
  return{handled:false,confidence,reason,provenance:{responseSource:'external_fallback_required',...provenance}}
}

export function formatCosWorkflowStatement(result:COSFirstAnswerResult,language='en'):string{
  const p=result.provenance,evidence=`${p.knowledgeFactsUsed} knowledge facts, ${p.learnedItemsUsed} learned items, ${p.userMemoriesUsed} memories`
  const research=p.researchAttempted?`, research accepted ${p.researchAccepted}`:''
  if(language==='pt') return result.handled?`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}${research}) → respondeu com ${p.reasonerLabel} e confiança ${result.confidence.toFixed(2)}. Nenhuma IA externa foi chamada.`:`Fluxo: COS consultou primeiro seu conhecimento, corpus e memória (${evidence}${research}) → não atingiu confiança suficiente → IA externa é apenas o último recurso.`
  if(language==='es') return result.handled?`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}${research}) → respondió con ${p.reasonerLabel} y confianza ${result.confidence.toFixed(2)}. No se llamó IA externa.`:`Flujo: COS consultó primero su conocimiento, corpus y memoria (${evidence}${research}) → no alcanzó confianza suficiente → la IA externa es solo el último recurso.`
  return result.handled?`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}${research}) → answered with ${p.reasonerLabel} at confidence ${result.confidence.toFixed(2)}. No external AI was called.`:`Workflow: COS searched its knowledge, learning corpus and memory first (${evidence}${research}) → did not reach sufficient confidence → external AI is the last resort.`
}