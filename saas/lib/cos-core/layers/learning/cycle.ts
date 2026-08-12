import { createHash } from 'node:crypto'
import type { ContinuousLearningDecision, ContinuousLearningSourceKind, KnowledgeGap, LearningCandidate } from './index'
import { ContinuousLearningDirector } from './index'
import { minimumConfidenceForKind } from './sourceCatalog'

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

export function distinctTerms(text:string):string[]{
  return [...new Set(
    String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}-]+/u)
      .map(term => term.replace(/^-+|-+$/g,'').trim())
      .filter(term => term.length >= 4 && !STOP_WORDS.has(term)),
  )]
}

export function matchesTerm(haystack:string,term:string):boolean{
  if(haystack.includes(term)) return true
  const stem = term.slice(0,Math.max(5,term.length - 3))
  return stem.length >= 5 && stem.length < term.length ? haystack.includes(stem) : false
}

export function gapStudyTerms(gap:KnowledgeGap):{anchors:string[];supporting:string[]}{
  const anchors = distinctTerms(gap.subject).slice(0,8)
  const anchorSet = new Set(anchors)
  return {anchors,supporting:distinctTerms(gap.question).filter(term => !anchorSet.has(term)).slice(0,12)}
}

export type RelevanceScore = {coverage:number; anchorsMatched:string[]; supportingMatched:string[]; totalMatched:number}

export function relevanceOf(document:LearningSourceDocument,terms:{anchors:string[];supporting:string[]}):RelevanceScore{
  const haystack = `${document.sourceTitle ?? ''} ${document.text}`.toLowerCase()
  const anchorsMatched = terms.anchors.filter(term => matchesTerm(haystack,term))
  const supportingMatched = terms.supporting.filter(term => matchesTerm(haystack,term))
  const weight = terms.anchors.length * 2 + terms.supporting.length
  const coverage = weight ? (anchorsMatched.length * 2 + supportingMatched.length) / weight : 0
  return {coverage,anchorsMatched,supportingMatched,totalMatched:anchorsMatched.length + supportingMatched.length}
}

export function relevantExcerpt(normalized:string,terms:string[],max=1200):string{
  if(!normalized) return ''
  if(!terms.length) return normalized.slice(0,max)
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(sentence => sentence.trim().length > 0)
  const scored = sentences
    .map((sentence,index) => {
      const lower = sentence.toLowerCase()
      return {index,sentence,hits:terms.filter(term => matchesTerm(lower,term)).length}
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

function envNumber(name:string,fallback:number,min:number,max:number):number{
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw >= min && raw <= max ? raw : fallback
}

export function minimumRelevance():number{ return envNumber('COS_LEARNING_MIN_RELEVANCE',0.3,0,1) }
export function minimumTermMatches():number{ return Math.round(envNumber('COS_LEARNING_MIN_TERM_MATCHES',2,1,20)) }
export function fullTextCharacters():number{ return Math.round(envNumber('COS_LEARNING_FULL_TEXT_CHARS',1500,200,20000)) }

export function substanceOf(normalized:string):number{
  return Math.min(1,normalized.length / fullTextCharacters())
}

export function groundedConfidence(coverage:number,substance:number):number{
  const grounding = 0.5 * Math.max(0,Math.min(1,coverage)) + 0.5 * Math.max(0,Math.min(1,substance))
  if(grounding <= 0) return 0
  return Number(Math.min(0.9,0.4 + 0.55 * grounding).toFixed(2))
}

export class ContinuousLearningCycle {
  constructor(private readonly director:ContinuousLearningDirector,private readonly adapters:ContinuousLearningSourceAdapter[]){}

  async run(gaps:KnowledgeGap[],spentExternalCostUsd=0):Promise<LearningCycleResult>{
    const prioritized=this.director.prioritizeGaps(gaps)
    const result:LearningCycleResult={gapsConsidered:prioritized.length,documentsAcquired:0,accepted:0,rejected:{},sourceErrors:{},externalCostUsd:spentExternalCostUsd}
    const floor=minimumRelevance(), minMatches=minimumTermMatches()
    for(const gap of prioritized){
      const terms=gapStudyTerms(gap)
      const allTerms=[...terms.anchors,...terms.supporting]
      for(const adapter of this.adapters){
        let documents:LearningSourceDocument[]=[]
        try{documents=await adapter.acquire(gap)}catch(error){const key=adapter.id??adapter.kind;result.sourceErrors[key]=(result.sourceErrors[key]??0)+1;console.warn('cosLearning: source acquisition failed',{source:key,gapId:gap.id,error:error instanceof Error?error.message:String(error)});continue}
        result.documentsAcquired+=documents.length
        for(const document of documents){
          if(document.sourceKind!==adapter.kind){this.recordDecision(result,{accepted:false,reason:'source_not_allowed'});continue}
          const source=adapter.id??adapter.kind
          const score=relevanceOf(document,terms)
          if(!score.anchorsMatched.length||score.totalMatched<minMatches||score.coverage<floor){
            result.rejected.not_relevant=(result.rejected.not_relevant??0)+1
            console.warn('cosLearning: document rejected as off-topic',{gapId:gap.id,source,sourceUri:document.sourceUri,sourceTitle:document.sourceTitle,coverage:Number(score.coverage.toFixed(2)),floor,anchorsMatched:score.anchorsMatched,supportingMatched:score.supportingMatched,requiredAnchors:terms.anchors.length,minimumMatches:minMatches})
            continue
          }
          const candidate=this.toCandidate(document,allTerms,score)
          const kindFloor=minimumConfidenceForKind(document.sourceKind)
          if(kindFloor!==null&&candidate.confidence<kindFloor){
            result.rejected.below_source_confidence_floor=(result.rejected.below_source_confidence_floor??0)+1
            console.warn('cosLearning: candidate below its source-kind confidence floor',{gapId:gap.id,source,sourceKind:document.sourceKind,sourceUri:document.sourceUri,confidence:candidate.confidence,kindFloor,coverage:Number(score.coverage.toFixed(2)),contentCharacters:document.text.replace(/\s+/g,' ').trim().length,note:'discovery metadata rarely reaches a knowledge-grade floor; ingest real content or lower this source deliberately'})
            continue
          }
          try{const decision=await this.director.admit(candidate,result.externalCostUsd);this.recordDecision(result,decision);if(!decision.accepted&&decision.reason==='budget_exhausted')return result}catch(error){result.sourceErrors.storage=(result.sourceErrors.storage??0)+1;console.warn('cosLearning: candidate admission failed',{source,gapId:gap.id,sourceUri:document.sourceUri,error:error instanceof Error?error.message:String(error)})}
        }
      }
    }
    return result
  }

  private toCandidate(document:LearningSourceDocument,terms:string[],score:RelevanceScore):LearningCandidate{
    const normalized=document.text.replace(/\s+/g,' ').trim()
    const evidence=document.evidence?.filter(Boolean)??[]
    const summary=relevantExcerpt(normalized,terms,1200)
    if(!evidence.length&&summary)evidence.push(summary.slice(0,500))
    const confidence=normalized?groundedConfidence(score.coverage,substanceOf(normalized)):0
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
