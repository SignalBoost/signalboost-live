// saas/lib/ai/cos/reasonerOutput.ts
// Parsing stays dependency-light so malformed local-model output can be tested and recovered safely.

import { captureLearnedCitationIndices } from './evidenceSourceUseTurnContext.ts'

export function extractBalancedJsonObject(text:string):string|null{
  const start=text.indexOf('{')
  if(start===-1)return null
  let depth=0,inString=false,escaped=false
  for(let i=start;i<text.length;i++){
    const ch=text[i]
    if(inString){
      if(escaped)escaped=false
      else if(ch==='\\')escaped=true
      else if(ch==='"')inString=false
      continue
    }
    if(ch==='"'){inString=true;continue}
    if(ch==='{')depth++
    else if(ch==='}'){depth--;if(depth===0)return text.slice(start,i+1)}
  }
  return null
}

export function salvageTruncatedAnswer(raw:string,minimumCharacters=200):string|null{
  const key=raw.indexOf('"answer"')
  if(key===-1)return null
  const colon=raw.indexOf(':',key+8)
  if(colon===-1)return null
  const open=raw.indexOf('"',colon+1)
  if(open===-1)return null
  let out='',escaped=false
  for(let i=open+1;i<raw.length;i++){
    const ch=raw[i]
    if(escaped){out+=ch==='n'?'\n':ch==='t'?'\t':ch;escaped=false;continue}
    if(ch==='\\'){escaped=true;continue}
    if(ch==='"')break
    out+=ch
  }
  const salvaged=out.trim()
  return salvaged.length>=minimumCharacters?salvaged:null
}

function decodeLooseJsonString(value:string):string{
  let out='',escaped=false
  for(let i=0;i<value.length;i++){
    const ch=value[i]
    if(escaped){
      if(ch==='n')out+='\n'
      else if(ch==='t')out+='\t'
      else if(ch==='r')out+='\r'
      else if(ch==='"')out+='"'
      else if(ch==='\\')out+='\\'
      else out+=ch
      escaped=false
      continue
    }
    if(ch==='\\'){escaped=true;continue}
    out+=ch
  }
  if(escaped)out+='\\'
  return out.trim()
}

/**
 * Qwen sometimes returns a complete answer/confidence pair but leaves literal newlines or
 * unescaped quotation marks inside the answer string. Strict JSON parsing rejects the whole
 * object even though the two fields are recoverable. Recover only when a numeric confidence
 * field is present after the answer, so we never invent confidence for an unfinished response.
 */
export function recoverLooseAnswerAndConfidence(raw:string):{answer:string;confidence:number}|null{
  const answerKey=/["']answer["']\s*:/i.exec(raw)
  if(!answerKey)return null
  const afterKey=(answerKey.index??0)+answerKey[0].length
  let open=afterKey
  while(open<raw.length&&/\s/.test(raw[open]))open++
  const quote=raw[open]
  if(quote!=='"'&&quote!=="'")return null
  const confidencePattern=/[,}]\s*["']confidence["']\s*:\s*(-?(?:\d+(?:\.\d+)?|\.\d+))/ig
  confidencePattern.lastIndex=open+1
  let match:RegExpExecArray|null,last:RegExpExecArray|null=null
  while((match=confidencePattern.exec(raw)))last=match
  if(!last||last.index<=open+1)return null
  let end=last.index
  while(end>open+1&&/\s/.test(raw[end-1]))end--
  if(end>open+1&&raw[end-1]===quote)end--
  const answer=decodeLooseJsonString(raw.slice(open+1,end))
  const confidence=Number(last[1])
  if(answer.length<20||!Number.isFinite(confidence))return null
  return{answer,confidence:Math.max(0,Math.min(1,confidence))}
}

const STRONG_APPROVE_RECOMMENDATION = /\b(?:approval\s+recommendation|recommendation)\s+(?:is|:)\s+(?:to\s+)?(?:\*\*)?approve\b/i
const STRONG_REJECT_RECOMMENDATION = /\b(?:approval\s+recommendation|recommendation)\s+(?:is|:)\s+(?:to\s+)?(?:\*\*)?(?:reject|not\s+approve)\b/i
const NEGATIVE_APPROVAL_CONCLUSION = /\b(?:conclusion|final\s+recommendation)\b[\s\S]{0,260}\b(?:should|must)\s+(?:\*\*)?not\s+(?:\*\*)?approve\b|\b(?:conclusion|final\s+recommendation)\b[\s\S]{0,260}\b(?:should|must)\s+reject\b/i
const POSITIVE_APPROVAL_CONCLUSION = /\b(?:conclusion|final\s+recommendation)\b[\s\S]{0,260}\b(?:should|must)\s+(?:\*\*)?approve\b/i

/**
 * A recommendation cannot begin by explicitly recommending approval and end by explicitly
 * recommending rejection (or the reverse). This narrow gate intentionally ignores conditional
 * branches such as "approve if X; reject if Y" and catches only conflicting top-level recommendations.
 */
export function recommendationIntegrityConflict(answer:string):boolean{
  const text=String(answer??'')
  return (STRONG_APPROVE_RECOMMENDATION.test(text)&&NEGATIVE_APPROVAL_CONCLUSION.test(text))
    ||(STRONG_REJECT_RECOMMENDATION.test(text)&&POSITIVE_APPROVAL_CONCLUSION.test(text))
}

const DISCLAIMS_POPULATION_INFERENCE = /\b(?:do\s+not|don't|must\s+not)\b[\s\S]{0,220}\b(?:label|characterize|infer|assume)\b[\s\S]{0,220}\b(?:gap|population|users?|cohort|dormant|exploratory|top[- ]of[- ]funnel|bottom[- ]of[- ]funnel)\b/i
const ASSERTS_GAP_COHORT = /\b(?:gap|difference)\b[\s\S]{0,180}\b(?:represents?|consists?\s+of|is\s+made\s+up\s+of)\b[\s\S]{0,180}\b(?:active[- ]but[- ]not[- ]billable|active\s+but\s+not\s+(?:yet\s+)?billable|free[- ]tier|trial\s+users?|non[- ]core\s+users?)\b/i
const DISCLAIMS_SUBSET_CONVERSION = /\b(?:do\s+not|don't|must\s+not)\b[\s\S]{0,220}\bconversion\s+rate\b[\s\S]{0,220}\b(?:unless|without|subset)\b/i
const ASSERTS_CONVERSION_RATE = /\b(?:conversion\s+rate\s+(?:is|of)|\d+(?:\.\d+)?%\s+conversion\s+rate)\b/i
const UNRESOLVED_METRIC_AUTHORITY = /\b(?:no\s+single\s+governance\s+source|governance\s+authority\s+(?:is|remains)\s+unresolved|authority\s+must\s+be\s+resolved|until\s+(?:the\s+)?(?:company\s+)?(?:designates?|resolves?)\s+[^.]{0,80}\bauthority)\b/i
const ASSIGNS_UNESTABLISHED_AUTHORITY = /\b(?:Board|CFO|Finance|Product|Investor\s+Relations)\b[\s\S]{0,120}\b(?:designate|decide|determine|set|own|official|canonical|authority)\b/i
const DISCLAIMS_BUSINESS_MODEL_INFERENCE = /\b(?:do\s+not|don't|must\s+not)\b[\s\S]{0,220}\b(?:infer|assume|claim)\b[\s\S]{0,120}\bbusiness\s+model\b/i
const ASSERTS_BUSINESS_MODEL_FROM_GAP = /\b(?:gap|discrepancy|difference)\b[\s\S]{0,180}\b(?:feature\s+of|reflects?|shows?|demonstrates?)\b[\s\S]{0,140}\b(?:freemium|usage[- ]based|business\s+model)\b/i

/**
 * Metric reconciliation answers often contain their own safety qualifiers. If the same answer then
 * violates those qualifiers, it is internally inconsistent regardless of the hidden prompt context.
 * Such an answer must not clear the normal COS confidence threshold.
 */
export function metricReconciliationIntegrityConflict(answer:string):boolean{
  const text=String(answer??'')
  return (DISCLAIMS_POPULATION_INFERENCE.test(text)&&ASSERTS_GAP_COHORT.test(text))
    ||(DISCLAIMS_SUBSET_CONVERSION.test(text)&&ASSERTS_CONVERSION_RATE.test(text))
    ||(UNRESOLVED_METRIC_AUTHORITY.test(text)&&ASSIGNS_UNESTABLISHED_AUTHORITY.test(text))
    ||(DISCLAIMS_BUSINESS_MODEL_INFERENCE.test(text)&&ASSERTS_BUSINESS_MODEL_FROM_GAP.test(text))
}

export type LocalResult={answer:string;confidence:number;truncated?:boolean;recovered?:boolean;integrityConflict?:boolean}

function applyIntegrityCap<T extends {answer:string;confidence:number}>(result:T):T&{integrityConflict?:boolean}{
  if(!recommendationIntegrityConflict(result.answer)&&!metricReconciliationIntegrityConflict(result.answer))return result
  return{...result,confidence:Math.min(result.confidence,.2),integrityConflict:true}
}

export function parseLocalResult(raw:string):LocalResult|null{
  const stripFences=(t:string)=>t.trim().replace(/^```json\s*/i,'').replace(/```\s*$/i,'').trim()
  const tryParse=(t:string)=>{
    try{
      const p=JSON.parse(t) as {answer?:unknown;confidence?:unknown}
      const answer=typeof p.answer==='string'?p.answer.trim():''
      const confidence=Number(p.confidence)
      return answer&&Number.isFinite(confidence)?applyIntegrityCap({answer,confidence:Math.max(0,Math.min(1,confidence))}):null
    }catch{return null}
  }
  const cleaned=stripFences(raw)
  const direct=tryParse(cleaned)
  if(direct)return direct
  const extracted=extractBalancedJsonObject(cleaned)
  if(extracted){const recovered=tryParse(extracted);if(recovered)return recovered}
  const loose=recoverLooseAnswerAndConfidence(cleaned)
  if(loose)return applyIntegrityCap({...loose,recovered:true})
  const salvaged=salvageTruncatedAnswer(cleaned)
  // No confidence was emitted, so a genuinely truncated answer still cannot enter the confident path.
  if(salvaged)return{answer:salvaged,confidence:0,truncated:true}
  return null
}

export type EvidenceLabelPrefix='KG'|'CL'|'EM'|'SK'

/** Return unique cited numeric labels in first-citation order. */
export function citedLabelIndices(answer:string,prefix:EvidenceLabelPrefix):number[]{
  const text=String(answer??'')
  const seen=new Set<number>()
  const indices:number[]=[]
  for(const match of text.matchAll(new RegExp(`\\[${prefix}(\\d{1,2})\\]`,'g'))){
    const index=Number(match[1])
    if(!Number.isInteger(index)||index<1||seen.has(index))continue
    seen.add(index)
    indices.push(index)
  }
  return indices
}

/**
 * Map cited 1-based labels back to the exact values supplied in that reasoning turn.
 * Out-of-range/hallucinated labels are ignored rather than being credited to another item.
 */
export function citedIndexedValues<T>(answer:string,prefix:EvidenceLabelPrefix,values:readonly T[]):T[]{
  return citedLabelIndices(answer,prefix)
    .map(index=>values[index-1])
    .filter((value):value is T=>value!==undefined)
}

/**
 * Which retrieved items the answer actually leans on. Retrieval counts say what was HANDED to the
 * reasoner; only a citation in the answer text shows an item informed a claim. Procedural skills
 * are tracked separately because using a validated HOW-to-reason skill is not factual grounding
 * and therefore must not raise the knowledge-evidence confidence ceiling.
 *
 * The CL index list is also captured request-locally for source-kind utilization telemetry. This is
 * a side effect only for measurement; it never changes parsing, confidence, or answer acceptance.
 */
export function citedEvidence(answer:string):{kg:number;cl:number;em:number;sk:number}{
  const clIndices=citedLabelIndices(answer,'CL')
  captureLearnedCitationIndices(clIndices)
  return {
    kg:citedLabelIndices(answer,'KG').length,
    cl:clIndices.length,
    em:citedLabelIndices(answer,'EM').length,
    sk:citedLabelIndices(answer,'SK').length,
  }
}
