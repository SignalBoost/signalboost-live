import { createHash } from 'node:crypto'
import type { ContinuousLearningDecision, ContinuousLearningSourceKind, KnowledgeGap, LearningCandidate } from './index.ts'
import { ContinuousLearningDirector } from './index.ts'
import { minimumConfidenceForKind } from './sourceCatalog.ts'
import { classifyTieredAdmission } from '@/lib/ai/cos/tieredLearningAdmission'

export type LearningSourceDocument = { sourceKind:ContinuousLearningSourceKind; sourceUri:string; sourceTitle?:string; observedAt?:string; subject:string; text:string; license?:string|null; evidence?:string[] }
export interface ContinuousLearningSourceAdapter { readonly kind:ContinuousLearningSourceKind; readonly id?:string; acquire(gap:KnowledgeGap):Promise<LearningSourceDocument[]> }
export type LearningCycleResult = { gapsConsidered:number; documentsAcquired:number; accepted:number; probationary:number; acceptedSubjects:string[]; rejected:Record<string,number>; sourceErrors:Record<string,number>; externalCostUsd:number; timeBudgetExhausted?:boolean }

const STOP_WORDS=new Set(['about','above','after','again','against','because','been','before','being','below','between','both','cannot','could','does','doing','down','during','each','from','further','have','having','here','into','itself','more','most','only','other','over','same','should','some','such','than','that','their','them','then','there','these','they','this','those','through','under','until','very','were','what','when','where','which','while','with','would','your'])
const GENERIC_DOMAIN_ANCHORS=new Set(['api','apis','architecture','business','database','engineering','enterprise','intelligence','multi','operations','performance','saas','security','site','software','strategy','systems','tenant'])
export function distinctTerms(text:string):string[]{return[...new Set(String(text??'').toLowerCase().split(/[^\p{L}\p{N}-]+/u).map(term=>term.replace(/^-+|-+$/g,'').trim()).filter(term=>term.length>=4&&!STOP_WORDS.has(term)))]}
export function matchesTerm(haystack:string,term:string):boolean{if(haystack.includes(term))return true;const stem=term.slice(0,Math.max(5,term.length-3));return stem.length>=5&&stem.length<term.length?haystack.includes(stem):false}
export function gapStudyTerms(gap:KnowledgeGap):{anchors:string[];supporting:string[]}{const anchors=distinctTerms(gap.subject).slice(0,8),anchorSet=new Set(anchors);return{anchors,supporting:distinctTerms(gap.question).filter(term=>!anchorSet.has(term)).slice(0,12)}}
export function discriminativeDomainAnchors(anchors:string[]):string[]{return anchors.filter(term=>!GENERIC_DOMAIN_ANCHORS.has(term))}
export type RelevanceScore={coverage:number;anchorsMatched:string[];supportingMatched:string[];totalMatched:number}
export function relevanceOf(document:LearningSourceDocument,terms:{anchors:string[];supporting:string[]}):RelevanceScore{const haystack=`${document.sourceTitle??''} ${document.text}`.toLowerCase(),anchorsMatched=terms.anchors.filter(term=>matchesTerm(haystack,term)),supportingMatched=terms.supporting.filter(term=>matchesTerm(haystack,term)),weight=terms.anchors.length*2+terms.supporting.length,coverage=weight?(anchorsMatched.length*2+supportingMatched.length)/weight:0;return{coverage,anchorsMatched,supportingMatched,totalMatched:anchorsMatched.length+supportingMatched.length}}
export function relevantExcerpt(normalized:string,terms:string[],max=1200):string{if(!normalized)return'';if(!terms.length)return normalized.slice(0,max);const sentences=normalized.split(/(?<=[.!?])\s+/).filter(Boolean),scored=sentences.map((sentence,index)=>({index,sentence,hits:terms.filter(term=>matchesTerm(sentence.toLowerCase(),term)).length})).filter(x=>x.hits>0).sort((a,b)=>b.hits-a.hits||a.index-b.index);if(!scored.length)return normalized.slice(0,max);let budget=max;const chosen=[] as typeof scored;for(const entry of scored){if(budget<=0)break;chosen.push(entry);budget-=entry.sentence.length+1}return chosen.sort((a,b)=>a.index-b.index).map(x=>x.sentence).join(' ').slice(0,max)}
function envNumber(name:string,fallback:number,min:number,max:number):number{const raw=Number(process.env[name]);return Number.isFinite(raw)&&raw>=min&&raw<=max?raw:fallback}
export function minimumRelevance():number{return envNumber('COS_LEARNING_MIN_RELEVANCE',0.12,0,1)}
export function minimumTermMatches():number{return Math.round(envNumber('COS_LEARNING_MIN_TERM_MATCHES',1,1,20))}
export function fullTextCharacters():number{return Math.round(envNumber('COS_LEARNING_FULL_TEXT_CHARS',900,200,20000))}
export function substanceOf(normalized:string):number{return Math.min(1,normalized.length/fullTextCharacters())}
export function groundedConfidence(coverage:number,substance:number):number{const grounding=.55*Math.max(0,Math.min(1,coverage))+.45*Math.max(0,Math.min(1,substance));if(grounding<=0)return 0;return Number(Math.min(.92,.48+.58*grounding).toFixed(2))}
function evidenceClass(document:LearningSourceDocument):'metadata'|'full'{
  const license=String(document.license??'').toLowerCase()
  if(license.includes('metadata')||license.includes('discovery'))return'metadata'
  return document.text.replace(/\s+/g,' ').trim().length<fullTextCharacters()*0.4?'metadata':'full'
}
export function metadataConfidenceCeiling():number{return envNumber('COS_METADATA_CONFIDENCE_CEILING',0.7,0,1)}
export function calibratedConfidence(document:LearningSourceDocument,score:RelevanceScore,normalized:string):number{const raw=groundedConfidence(score.coverage,substanceOf(normalized));return evidenceClass(document)==='metadata'?Number(Math.min(raw,metadataConfidenceCeiling()).toFixed(2)):raw}
export function metadataAdmissionFloor():number{return envNumber('COS_METADATA_ADMISSION_FLOOR',0.6,0,1)}
export function candidate0Confidence(document:LearningSourceDocument,score:RelevanceScore):number{const normalized=document.text.replace(/\s+/g,' ').trim();return normalized?calibratedConfidence(document,score,normalized):0}
export function admissionFloorFor(document:LearningSourceDocument):number|null{const kindFloor=minimumConfidenceForKind(document.sourceKind);if(evidenceClass(document)==='full')return kindFloor??0.72;return kindFloor===null?metadataAdmissionFloor():Math.min(kindFloor,metadataAdmissionFloor())}
export function sourceAwareRelevant(document:LearningSourceDocument,score:RelevanceScore,terms:{anchors:string[];supporting:string[]},floor=minimumRelevance(),minMatches=minimumTermMatches()):boolean{
  if(score.totalMatched<minMatches)return false
  const haystack=`${document.sourceTitle??''} ${document.text}`.toLowerCase()
  const discriminative=discriminativeDomainAnchors(terms.anchors)
  const discriminativeHits=discriminative.filter(term=>matchesTerm(haystack,term)).length
  const trustedLongForm=['research_paper','scientific_journal','library_material','official_documentation'].includes(document.sourceKind)
  if(trustedLongForm&&discriminative.length>0&&discriminativeHits===0&&score.supportingMatched.length<3)return false
  if(score.anchorsMatched.length>0&&score.coverage>=floor)return true
  const title=String(document.sourceTitle??'').toLowerCase(),titleHits=[...terms.anchors,...terms.supporting].filter(term=>matchesTerm(title,term)).length
  if(titleHits>=1&&score.totalMatched>=2)return true
  if(trustedLongForm&&score.totalMatched>=2)return true
  return false
}

function learningErrorMessage(error:unknown):string{
  if(error instanceof Error)return error.message
  if(error&&typeof error==='object'){
    const value=error as Record<string,unknown>
    const parts=['message','code','details','hint'].map(key=>value[key]?`${key}=${String(value[key])}`:'').filter(Boolean)
    if(parts.length)return parts.join('; ').slice(0,800)
    try{return JSON.stringify(error).slice(0,800)}catch{}
  }
  return String(error)
}

export class ContinuousLearningCycle{
  constructor(private readonly director:ContinuousLearningDirector,private readonly adapters:ContinuousLearningSourceAdapter[]){}

  async run(gaps:KnowledgeGap[],spentExternalCostUsd=0):Promise<LearningCycleResult>{
    const prioritized=this.director.prioritizeGaps(gaps)
    const result:LearningCycleResult={gapsConsidered:prioritized.length,documentsAcquired:0,accepted:0,probationary:0,acceptedSubjects:[],rejected:{},sourceErrors:{},externalCostUsd:spentExternalCostUsd}
    const acceptedSubjects=new Set<string>()
    const attemptedContentHashes=new Set<string>()
    const floor=minimumRelevance(),minMatches=minimumTermMatches()
    const startedAt=Date.now()
    const cycleBudgetMs=Math.round(envNumber('COS_LEARNING_CYCLE_BUDGET_MS',240000,30000,290000))
    const concurrency=Math.round(envNumber('COS_LEARNING_SOURCE_CONCURRENCY',6,1,12))

    const tasks:Array<{gap:KnowledgeGap;adapter:ContinuousLearningSourceAdapter}> = []
    for(const gap of prioritized) for(const adapter of this.adapters) tasks.push({gap,adapter})
    let cursor=0

    const worker=async()=>{
      while(true){
        if(Date.now()-startedAt>=cycleBudgetMs){result.timeBudgetExhausted=true;return}
        const index=cursor++
        if(index>=tasks.length)return
        const {gap,adapter}=tasks[index]
        const terms=gapStudyTerms(gap),allTerms=[...terms.anchors,...terms.supporting]
        let documents:LearningSourceDocument[]=[]
        try{documents=await adapter.acquire(gap)}catch(error){const key=adapter.id??adapter.kind;result.sourceErrors[key]=(result.sourceErrors[key]??0)+1;console.warn('cosLearning: source acquisition failed',{source:key,gapId:gap.id,error:learningErrorMessage(error)});continue}
        result.documentsAcquired+=documents.length
        for(const document of documents){
          if(document.sourceKind!==adapter.kind){this.recordDecision(result,{accepted:false,reason:'source_not_allowed'});continue}
          const source=adapter.id??adapter.kind,score=relevanceOf(document,terms)
          if(!sourceAwareRelevant(document,score,terms,floor,minMatches)){result.rejected.not_relevant=(result.rejected.not_relevant??0)+1;continue}
          const kindFloor=admissionFloorFor(document)
          const admission=classifyTieredAdmission({ rawRelevance: score.coverage, confidence: candidate0Confidence(document,score), sourceFloor: kindFloor ?? 0, gapAligned: gap.id.startsWith('curriculum:') })
          const candidate={...this.toCandidate(document,allTerms,score),admission}
          if(kindFloor!==null&&candidate.confidence<kindFloor&&admission.tier!=='probationary'){
            result.rejected.below_source_confidence_floor=(result.rejected.below_source_confidence_floor??0)+1
            continue
          }
          // Several gaps can independently retrieve the same document. Without a cycle-local hash
          // guard, concurrent workers can both pass store.hasContent() and then race the primary-key
          // insert. That production race appeared as dozens of opaque "storage" errors even though
          // the winning copy was retained. Reserve the hash before the first awaited admission.
          if(attemptedContentHashes.has(candidate.contentHash)){
            result.rejected.duplicate=(result.rejected.duplicate??0)+1
            continue
          }
          attemptedContentHashes.add(candidate.contentHash)
          try{
            const decision=await this.director.admit(candidate,result.externalCostUsd)
            this.recordDecision(result,decision)
            if(decision.accepted){const learned=String(gap.subject??'').trim();if(learned)acceptedSubjects.add(learned)}
          }catch(error){
            // A real failed write is retryable if another gap discovers the same content later.
            attemptedContentHashes.delete(candidate.contentHash)
            result.sourceErrors.storage=(result.sourceErrors.storage??0)+1
            console.warn('cosLearning: candidate admission failed',{source,gapId:gap.id,error:learningErrorMessage(error)})
          }
        }
      }
    }

    await Promise.all(Array.from({length:Math.min(concurrency,tasks.length||1)},()=>worker()))
    result.acceptedSubjects=[...acceptedSubjects]
    return result
  }

  private toCandidate(document:LearningSourceDocument,terms:string[],score:RelevanceScore,admission?:import('@/lib/ai/cos/tieredLearningAdmission').TieredAdmission):LearningCandidate{const normalized=document.text.replace(/\s+/g,' ').trim(),evidence=document.evidence?.filter(Boolean)??[],summary=relevantExcerpt(normalized,terms,1200);if(!evidence.length&&summary)evidence.push(summary.slice(0,500));const confidence=normalized?calibratedConfidence(document,score,normalized):0;return{contentHash:createHash('sha256').update(`${document.sourceUri}\n${normalized}`).digest('hex'),sourceKind:document.sourceKind,sourceUri:document.sourceUri,sourceTitle:document.sourceTitle,observedAt:document.observedAt??new Date().toISOString(),subject:document.subject,summary,facts:summary?[{predicate:'source_excerpt',object:summary,confidence}]:[],confidence,license:document.license,evidence,admission}}
  private recordDecision(result:LearningCycleResult,decision:ContinuousLearningDecision){if(decision.accepted){result.accepted+=1;return}if('deferred' in decision&&decision.deferred){result.probationary+=1;return}result.rejected[decision.reason]=(result.rejected[decision.reason]??0)+1}
}
