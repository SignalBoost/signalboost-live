// saas/lib/ai/cos/calibrationLearningStore.ts
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { buildCalibrationCohorts, calibrateAnswerConfidence, type CalibrationCohortSample } from '@/lib/ai/cos/answerConfidenceCalibration'
import { validateCalibrationOnHoldout, type OutcomeSample } from '@/lib/ai/cos/calibrationHoldoutValidation'
const LIMIT=2000
function evidenceRegime(value:unknown){const v=JSON.stringify(value||{}).toLowerCase();if(v.includes('live')||v.includes('fresh'))return'live_evidence';if(v.includes('learned')||v.includes('corpus'))return'learned_corpus';return'ungrounded_or_unknown'}
export async function readCalibrationLearningReport(limit=LIMIT){const db=cosServiceDb();if(!db)return{ok:false as const,error:'COS service database is not configured.'};const result=await db.from('cos_turn_experience').select('turn_id,predicted_confidence,verified_success,problem_class,reasoner_label,evidence_summary,created_at').not('verified_success','is',null).not('predicted_confidence','is',null).order('created_at',{ascending:false}).limit(Math.max(1,Math.min(LIMIT,Math.floor(limit))));if(result.error)return{ok:false as const,error:result.error.message};const rows=(result.data||[]).flatMap((row:any)=>typeof row.verified_success==='boolean'?[{predicted:Number(row.predicted_confidence),observed:row.verified_success,problemClass:row.problem_class,reasonerLabel:row.reasoner_label,evidenceRegime:evidenceRegime(row.evidence_summary)} as CalibrationCohortSample]:[]);
// Held-out validation (ONBOARD calibration spec): fit on the OLDER outcomes, prove on the NEWER
// ones — overall AND per evidence regime, because zero-grounding reasoning and current-state
// factual claims must not be conflated into one curve. Fail-closed; never a policy change.
const outcomeSamples:OutcomeSample[]=(result.data||[]).flatMap((row:any)=>typeof row.verified_success==='boolean'?[{predicted:Number(row.predicted_confidence),observed:row.verified_success,at:String(row.created_at||'')}]:[]);
const regimeSamples=new Map<string,OutcomeSample[]>();
for(const row of (result.data||[]) as any[]){if(typeof row.verified_success!=='boolean')continue;const regime=evidenceRegime(row.evidence_summary);const list=regimeSamples.get(regime)??[];list.push({predicted:Number(row.predicted_confidence),observed:row.verified_success,at:String(row.created_at||'')});regimeSamples.set(regime,list)}
const holdoutValidation={overall:validateCalibrationOnHoldout(outcomeSamples),byEvidenceRegime:Object.fromEntries([...regimeSamples.entries()].sort(([x],[y])=>x.localeCompare(y)).map(([regime,list])=>[regime,validateCalibrationOnHoldout(list)]))};
const overall=calibrateAnswerConfidence(rows);return{ok:true as const,report:{samples:rows.length,overall,cohorts:buildCalibrationCohorts(rows),holdoutValidation,livePolicyChanged:false,note:'Observational shadow report only. Separate held-out validation and human approval are required before any confidence or escalation policy change.'}}}
