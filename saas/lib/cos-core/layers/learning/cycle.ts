// saas/lib/cos-core/layers/learning/cycle.ts
import { createHash } from 'node:crypto'
import type { ContinuousLearningDecision, ContinuousLearningSourceKind, KnowledgeGap, LearningCandidate } from './index'
import { ContinuousLearningDirector } from './index'

export type LearningSourceDocument = { sourceKind:ContinuousLearningSourceKind; sourceUri:string; sourceTitle?:string; observedAt?:string; subject:string; text:string; license?:string|null; evidence?:string[] }
export interface ContinuousLearningSourceAdapter { readonly kind:ContinuousLearningSourceKind; readonly id?:string; acquire(gap:KnowledgeGap):Promise<LearningSourceDocument[]> }
export type LearningCycleResult = { gapsConsidered:number; documentsAcquired:number; accepted:number; rejected:Record<string,number>; sourceErrors:Record<string,number>; externalCostUsd:number }

/**
 * Words that carry no topical signal. Kept deliberately small: this list only has to stop a
 * document matching a gap on connective tissue ("should", "which", "between").
 */
const STOP_WORDS = new Set([
  'about','above','after','again','against','because','been','before','being','below','between','both','cannot','could',
  'does','doing','down','during','each','from','further','have','having','here','into','itself','more','most',
  'only','other','over','same','should','some','such','than','that','their','them','then','there','these','they','this',
  'those','through','under','until','very','were','what','when','where','which','while','with','would','your',
])

/** Distinct, lower-cased, meaningful terms. Short words and stop-words carry no topical signal. */
export function distinctTerms(text:string):string[]{
  return [...new Set(
    String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}-]+/u)
      .map(term => term.replace(/^-+|-+$/g,'').trim())
      .filter(term => term.length >= 4 && !STOP_WORDS.has(term)),
  )]
}

/**
 * The terms a document must actually address to count as study material for this gap. Subject
 * and question both contribute: the subject fixes the domain, the question fixes what within
 * that domain is being asked.
 */
export function gapStudyTerms(gap:KnowledgeGap):string[]{
  return distinctTerms(`${gap.subject} ${gap.question}`).slice(0,16)
}

/**
 * Fraction of the gap's terms the document actually contains. Crude by design — it is a topical
 * relevance signal, never a correctness signal, and it is measured rather than assumed.
 */
export function relevanceOf(document:LearningSourceDocument,terms:string[]):{coverage:number;matched:string[]}{
  if(!terms.length) return {coverage:0,matched:[]}
  // Only the title and the CONTENT count. document.subject is assigned by the adapter from the
  // gap itself, so including it would let every document match the gap's own subject terms for
  // free — which is precisely how a labour-economics paper scored as PostgreSQL study material.
  const haystack = `${document.sourceTitle ?? ''} ${document.text}`.toLowerCase()
  const matched = terms.filter(term => haystack.includes(term))
  return {coverage:matched.length / terms.length,matched}
}

/**
 * The passages that actually mention the gap's terms, in document order — not the opening 1,200
 * characters. Without this, what gets stored as "knowledge" is whatever boilerplate a page happens
 * to start with: channel promos, publisher banners, cookie notices.
 */
export function relevantExcerpt(normalized:string,terms:string[],max=1200):string{
  if(!normalized) return ''
  if(!terms.length) return normalized.slice(0,max)
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(sentence => sentence.trim().length > 0)
  const scored = sentences
    .map((sentence,index) => {
      const lower = sentence.toLowerCase()
      return {index,sentence,hits:terms.filter(term => lower.includes(term)).length}
    })
    .filter(entry => entry.hits > 0)
    .sort((a,b) => b.hits - a.hits || a.index - b.index)
  if(!scored.length) return normalized.slice(0,max)
  const chosen:Array<{index:number;sentence:string;hits:number}> = []
  let budget = max
  for(const entry of scored){
    if(budget <= 0) break
    chosen.push(entry)
    budget -= entry.sentence.length + 1
  }
  return chosen.sort((a,b) => a.index - b.index).map(entry => entry.sentence).join(' ').slice(0,max)
}

/**
 * Minimum share of a gap's terms a document must cover before it is admitted as study material.
 * NOT tuned against production data — it is a starting floor, exposed as an env var precisely so
 * it can be moved once the rejection counts have been read.
 */
export function minimumRelevance():number{
  const raw = Number(process.env.COS_LEARNING_MIN_RELEVANCE)
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.45
}

/**
 * Confidence derived from measured term coverage, capped well below certainty: keyword overlap is
 * evidence that a document is ON TOPIC, never evidence that it is CORRECT. A constant here (it used
 * to be 0.8) makes the director's confidence gate a no-op, because every non-empty document then
 * clears the threshold by construction.
 */
export function confidenceFromRelevance(coverage:number):number{
  if(!Number.isFinite(coverage) || coverage <= 0) return 0
  return Number(Math.min(0.85,0.55 + 0.45 * Math.min(1,coverage)).toFixed(2))
}

export class ContinuousLearningCycle {
  constructor(private readonly director:ContinuousLearningDirector,private readonly adapters:ContinuousLearningSourceAdapter[]){}

  async run(gaps:KnowledgeGap[],spentExternalCostUsd=0):Promise<LearningCycleResult>{
    const prioritized=this.director.prioritizeGaps(gaps)
    const result:LearningCycleResult={gapsConsidered:prioritized.length,documentsAcquired:0,accepted:0,rejected:{},sourceErrors:{},externalCostUsd:spentExternalCostUsd}
    const floor=minimumRelevance()
    for(const gap of prioritized){
      const terms=gapStudyTerms(gap)
      for(const adapter of this.adapters){
        let documents:LearningSourceDocument[]=[]
        try{documents=await adapter.acquire(gap)}catch(error){const key=adapter.id??adapter.kind;result.sourceErrors[key]=(result.sourceErrors[key]??0)+1;console.warn('cosLearning: source acquisition failed',{source:key,gapId:gap.id,error:error instanceof Error?error.message:String(error)});continue}
        result.documentsAcquired+=documents.length
        for(const document of documents){
          if(document.sourceKind!==adapter.kind){this.recordDecision(result,{accepted:false,reason:'source_not_allowed'});continue}
          const {coverage,matched}=relevanceOf(document,terms)
          if(coverage<floor){
            result.rejected.not_relevant=(result.rejected.not_relevant??0)+1
            console.warn('cosLearning: document rejected as off-topic',{gapId:gap.id,source:adapter.id??adapter.kind,sourceUri:document.sourceUri,sourceTitle:document.sourceTitle,coverage:Number(coverage.toFixed(2)),floor,matchedTerms:matched,requiredTerms:terms.length})
            continue
          }
          try{const decision=await this.director.admit(this.toCandidate(document,terms,coverage),result.externalCostUsd);this.recordDecision(result,decision);if(!decision.accepted&&decision.reason==='budget_exhausted')return result}catch(error){result.sourceErrors.storage=(result.sourceErrors.storage??0)+1;console.warn('cosLearning: candidate admission failed',{source:adapter.id??adapter.kind,gapId:gap.id,sourceUri:document.sourceUri,error:error instanceof Error?error.message:String(error)})}
        }
      }
    }
    return result
  }

  private toCandidate(document:LearningSourceDocument,terms:string[],coverage:number):LearningCandidate{
    const normalized=document.text.replace(/\s+/g,' ').trim()
    const evidence=document.evidence?.filter(Boolean)??[]
    const summary=relevantExcerpt(normalized,terms,1200)
    if(!evidence.length&&summary)evidence.push(summary.slice(0,500))
    const confidence=normalized?confidenceFromRelevance(coverage):0
    // One excerpt-shaped fact, honestly labelled. Real subject/predicate/object triples require the
    // reasoner to read the document; until that step exists this must not pretend to be one.
    return {
      contentHash:createHash('sha256').update(`${document.sourceUri}\n${normalized}`).digest('hex'),
      sourceKind:document.sourceKind,
      sourceUri:document.sourceUri,
      sourceTitle:document.sourceTitle,
      observedAt:document.observedAt??new Date().toISOString(),
      subject:document.subject,
      summary,
      facts:summary?[{predicate:'source_excerpt',object:summary,confidence}]:[],
      confidence,
      license:document.license,
      evidence,
    }
  }

  private recordDecision(result:LearningCycleResult,decision:ContinuousLearningDecision){if(decision.accepted){result.accepted+=1;return}result.rejected[decision.reason]=(result.rejected[decision.reason]??0)+1}
}
