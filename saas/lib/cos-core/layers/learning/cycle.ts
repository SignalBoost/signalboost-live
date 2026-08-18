import { createHash } from 'node:crypto'
import type { ContinuousLearningDecision, ContinuousLearningSourceKind, KnowledgeGap, LearningCandidate } from './index.ts'
import { ContinuousLearningDirector } from './index.ts'
import { minimumConfidenceForKind } from './sourceCatalog.ts'
import { classifyTieredAdmission } from '@/lib/ai/cos/tieredLearningAdmission'

export type LearningSourceDocument = { sourceKind:ContinuousLearningSourceKind; sourceUri:string; sourceTitle?:string; observedAt?:string; subject:string; text:string; license?:string|null; evidence?:string[] }
export interface ContinuousLearningSourceAdapter { readonly kind:ContinuousLearningSourceKind; readonly id?:string; acquire(gap:KnowledgeGap):Promise<LearningSourceDocument[]> }
// acceptedSubjects records WHICH gaps actually produced admitted evidence. Without it a caller can
// only see that the cycle accepted something overall, which is not enough to close the right gaps.
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
  // Length decides too: a two-line "document" IS discovery metadata whatever its license field
  // says. Without this, sources that never set a license (most of them) had their blurbs scored
  // as full evidence — the very hole the license check was meant to close.
  return document.text.replace(/\s+/g,' ').trim().length<fullTextCharacters()*0.4?'metadata':'full'
}
/**
 * A candidate's stored confidence is its HONEST grounding — how well it matches the question and
 * how much real content it holds — for every evidence class alike.
 *
 * The previous version raised metadata-class candidates to the very floor they were about to be
 * tested against (Math.max(raw, kindFloor) + a title boost, capped at 0.82). The intent — keep
 * useful trusted-source metadata — was sound; the mechanism neutralised the floor gate and stamped
 * every surviving blurb ~0.82, so a robotics question retrieved an obstetrics paper, an economics
 * paper and a 2017 heat-transfer tutorial all "0.82-confident". Retrieval, the reasoner's evidence
 * ranking, and the provenance report all consume this number; inflating it lies to all three.
 * The admit-good-metadata intent now lives in metadataAdmissionFloor(), which lowers the BAR for
 * that class instead of raising the NUMBER.
 */
export function metadataConfidenceCeiling():number{return envNumber('COS_METADATA_CONFIDENCE_CEILING',0.7,0,1)}

export function calibratedConfidence(document:LearningSourceDocument,score:RelevanceScore,normalized:string):number{
  const raw=groundedConfidence(score.coverage,substanceOf(normalized))
  // Caps go DOWN, never up: a blurb can be perfectly on topic and still never be more than
  // moderately confident knowledge, because there is almost nothing of it to be confident IN.
  return evidenceClass(document)==='metadata'?Number(Math.min(raw,metadataConfidenceCeiling()).toFixed(2)):raw
}

/**
 * The floor a metadata-class candidate must clear. Deliberately below the full-text floors: a
 * relevant abstract or documentation blurb is worth keeping AS WHAT IT IS — a well-attributed
 * pointer with modest confidence — and its honest grounding score rarely exceeds ~0.7 because
 * substance is low by definition. Env-tunable; raising it toward 0.72 makes learning full-text-only.
 */
export function metadataAdmissionFloor():number{return envNumber('COS_METADATA_ADMISSION_FLOOR',0.6,0,1)}

/** The floor THIS document must clear: the catalogue floor for full evidence, the metadata floor otherwise — never a number invented per document. */
export function admissionFloorFor(document:LearningSourceDocument):number|null{const kindFloor=minimumConfidenceForKind(document.sourceKind);if(evidenceClass(document)==='full')return kindFloor??0.72;return kindFloor===null?metadataAdmissionFloor():Math.min(kindFloor,metadataAdmissionFloor())}
export function sourceAwareRelevant(document:LearningSourceDocument,score:RelevanceScore,terms:{anchors:string[];supporting:string[]},floor=minimumRelevance(),minMatches=minimumTermMatches()):boolean{
  if(score.totalMatched<minMatches)return false
  const haystack=`${document.sourceTitle??''} ${document.text}`.toLowerCase()
  const discriminative=discriminativeDomainAnchors(terms.anchors)
  const discriminativeHits=discriminative.filter(term=>matchesTerm(haystack,term)).length
  const trustedLongForm=['research_paper','scientific_journal','library_material','official_documentation'].includes(document.sourceKind)
  // Long authoritative documents are especially prone to accidental lexical matches because a
  // paper can mention generic words like "database", "performance" and "tenant" somewhere in
  // thousands of words. Require either a discriminative domain term (postgresql, kubernetes, dns,
  // llm, etc.) or several question-specific signals before such a document may enter durable memory.
  if(trustedLongForm&&discriminative.length>0&&discriminativeHits===0&&score.supportingMatched.length<3)return false
  if(score.anchorsMatched.length>0&&score.coverage>=floor)return true
  const title=String(document.sourceTitle??'').toLowerCase(),titleHits=[...terms.anchors,...terms.supporting].filter(term=>matchesTerm(title,term)).length
  if(titleHits>=1&&score.totalMatched>=2)return true
  if(trustedLongForm&&score.totalMatched>=2)return true
  return false
}

export class ContinuousLearningCycle{
  constructor(private readonly director:ContinuousLearningDirector,private readonly adapters:ContinuousLearningSourceAdapter[]){}

  async run(gaps:KnowledgeGap[],spentExternalCostUsd=0):Promise<LearningCycleResult>{
    const prioritized=this.director.prioritizeGaps(gaps)
    const result:LearningCycleResult={gapsConsidered:prioritized.length,documentsAcquired:0,accepted:0,probationary:0,acceptedSubjects:[],rejected:{},sourceErrors:{},externalCostUsd:spentExternalCostUsd}
    const acceptedSubjects=new Set<string>()
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
        try{documents=await adapter.acquire(gap)}catch(error){const key=adapter.id??adapter.kind;result.sourceErrors[key]=(result.sourceErrors[key]??0)+1;console.warn('cosLearning: source acquisition failed',{source:key,gapId:gap.id,error:error instanceof Error?error.message:String(error)});continue}
        result.documentsAcquired+=documents.length
        for(const document of documents){
          if(document.sourceKind!==adapter.kind){this.recordDecision(result,{accepted:false,reason:'source_not_allowed'});continue}
          const source=adapter.id??adapter.kind,score=relevanceOf(document,terms)
          if(!sourceAwareRelevant(document,score,terms,floor,minMatches)){result.rejected.not_relevant=(result.rejected.not_relevant??0)+1;continue}
          const kindFloor=admissionFloorFor(document)
          const admission=classifyTieredAdmission({ rawRelevance: score.coverage, confidence: calibratedConfidence(document,score,document.text.replace(/\s+/g,' ').trim()), sourceFloor: kindFloor ?? 0, gapAligned: gap.id.startsWith('curriculum:') || gap.id.startsWith('track-study:') })
          const candidate=this.toCandidate(document,allTerms,score,admission)
          if(kindFloor!==null&&candidate.confidence<kindFloor){result.rejected.below_source_confidence_floor=(result.rejected.below_source_confidence_floor??0)+1;console.warn('cosLearning: candidate below source confidence floor',{gapId:gap.id,source,sourceKind:document.sourceKind,confidence:candidate.confidence,floor:kindFloor,evidenceClass:evidenceClass(document)});continue}
          try{const decision=await this.director.admit(candidate,result.externalCostUsd);this.recordDecision(result,decision);if(decision.accepted){const learned=String(gap.subject??'').trim();if(learned)acceptedSubjects.add(learned)}}catch(error){result.sourceErrors.storage=(result.sourceErrors.storage??0)+1;console.warn('cosLearning: candidate admission failed',{source,gapId:gap.id,error:error instanceof Error?error.message:String(error)})}
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
