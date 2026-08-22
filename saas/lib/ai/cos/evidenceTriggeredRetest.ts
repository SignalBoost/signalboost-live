// Deterministic evidence-arrival trigger for measuring whether newly retained knowledge
// fixes a previously failed answer. It never answers, scores, or calls a model.
import type { RetainedKnowledgeRow } from './knowledgeApplicationScan'
export type { RetainedKnowledgeRow }

export type PendingCandidateRow = { id:string; track:string; sanitizedPrompt:string; occurrenceCount?:number|null; lastSeenAt?:string|null }
export type RetestVerdict = 'promote_for_retest'|'insufficient_overlap'|'evidence_predates_failure'|'source_confidence_too_low'|'track_not_matchable'|'no_new_evidence'
export type RetestCandidate = { candidateId:string; track:string; contentHash:string|null; sourceKind:string|null; sourceTitle:string|null; matchedTerms:string[]; coverage:number; occurrenceCount:number; verdict:RetestVerdict; rationale:string }
export const RETEST_MINIMUM_MATCHED_TERMS=2
export const RETEST_MINIMUM_COVERAGE=.25
export const RETEST_MINIMUM_SOURCE_CONFIDENCE=.6
export const MAX_RETEST_PROMOTIONS_PER_CYCLE=2
const STOP=new Set(['about','after','again','against','also','because','before','being','could','current','does','during','from','have','into','like','made','make','many','more','most','much','must','need','only','other','over','same','should','since','some','such','than','that','their','them','then','there','these','they','this','those','through','under','until','used','using','very','what','when','where','which','while','with','within','would','your','please','help','want','know','tell','explain','question','answer'])
const UNMATCHABLE=new Set(['general','general reasoning','general_reasoning','unclassified'])
function terms(value:string){const seen=new Set<string>();return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(word=>word.length>=4&&!STOP.has(word)&&!/^\d+$/.test(word)&&!seen.has(word)&&(seen.add(word),true))}
function date(value:unknown){const ms=new Date(String(value||'')).getTime();return Number.isFinite(ms)?ms:null}
function text(value:unknown,max:number){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max)}
export function assessRetestCandidate(candidate:PendingCandidateRow,knowledge:RetainedKnowledgeRow[]):RetestCandidate{
 const base={candidateId:candidate.id,track:text(candidate.track,120),contentHash:null as string|null,sourceKind:null as string|null,sourceTitle:null as string|null,matchedTerms:[] as string[],coverage:0,occurrenceCount:Math.max(1,Math.floor(Number(candidate.occurrenceCount??1)))}
 const trackTerms=new Set(terms(candidate.track));const promptTerms=terms(`${candidate.track} ${candidate.sanitizedPrompt}`)
 if(UNMATCHABLE.has(base.track.toLowerCase())||!trackTerms.size)return {...base,verdict:'track_not_matchable',rationale:'track has no distinctive anchor vocabulary'}
 let best:{row:RetainedKnowledgeRow;matched:string[];coverage:number;anchored:boolean}|null=null
 for(const row of knowledge||[]){const haystack=new Set(terms(`${row.subject} ${row.sourceTitle||''} ${row.summary}`));const matched=promptTerms.filter(term=>haystack.has(term));if(!matched.length)continue;const item={row,matched,coverage:matched.length/promptTerms.length,anchored:matched.some(term=>trackTerms.has(term))};if(!best||(item.anchored&&!best.anchored)||(item.anchored===best.anchored&&(item.matched.length>best.matched.length||(item.matched.length===best.matched.length&&item.coverage>best.coverage))))best=item}
 if(!best)return {...base,verdict:'no_new_evidence',rationale:'no newly retained record overlaps the failed prompt'}
 const matched={...base,contentHash:best.row.contentHash,sourceKind:text(best.row.sourceKind,60)||null,sourceTitle:text(best.row.sourceTitle,200)||null,matchedTerms:best.matched.slice(0,12),coverage:Number(best.coverage.toFixed(3))}
 const confidence=Number(best.row.confidence??0);if(!Number.isFinite(confidence)||confidence<RETEST_MINIMUM_SOURCE_CONFIDENCE)return {...matched,verdict:'source_confidence_too_low',rationale:'matching evidence confidence is below the admission floor'}
 const failureAt=date(candidate.lastSeenAt),observed=date(best.row.observedAt)??date(best.row.createdAt);if(failureAt!==null&&observed!==null&&observed<=failureAt)return {...matched,verdict:'evidence_predates_failure',rationale:'matching evidence was available when the answer last failed'}
 if(!best.anchored||best.matched.length<RETEST_MINIMUM_MATCHED_TERMS||best.coverage<RETEST_MINIMUM_COVERAGE)return {...matched,verdict:'insufficient_overlap',rationale:'overlap is incidental or below the bounded retest floor'}
 return {...matched,verdict:'promote_for_retest',rationale:'new high-confidence, track-anchored evidence warrants one governed benchmark retest'}
}
export function scanRetestCandidates(candidates:PendingCandidateRow[],knowledge:RetainedKnowledgeRow[]){return (candidates||[]).filter(c=>c?.id&&c.track&&text(c.sanitizedPrompt,40).length>=12).map(c=>assessRetestCandidate(c,(knowledge||[]).filter(k=>k?.contentHash&&k.summary)))}
export function selectRetestBatch(candidates:RetestCandidate[],max=MAX_RETEST_PROMOTIONS_PER_CYCLE){const seen=new Set<string>();return (candidates||[]).filter(c=>c.verdict==='promote_for_retest').sort((a,b)=>b.coverage-a.coverage||b.matchedTerms.length-a.matchedTerms.length||a.candidateId.localeCompare(b.candidateId)).filter(c=>{const track=c.track.toLowerCase();if(seen.has(track))return false;seen.add(track);return true}).slice(0,Math.max(0,Math.min(MAX_RETEST_PROMOTIONS_PER_CYCLE,Math.floor(max))))}
export function summarizeRetestScan(candidates:RetestCandidate[]){const out:Record<RetestVerdict,number>={promote_for_retest:0,insufficient_overlap:0,evidence_predates_failure:0,source_confidence_too_low:0,track_not_matchable:0,no_new_evidence:0};for(const candidate of candidates||[])if(candidate.verdict in out)out[candidate.verdict]++;return out}
