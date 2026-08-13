// saas/lib/ai/cos/reasonerOutput.ts
// Parsing stays dependency-free so malformed local-model output can be tested and recovered safely.

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

export type LocalResult={answer:string;confidence:number;truncated?:boolean;recovered?:boolean}

export function parseLocalResult(raw:string):LocalResult|null{
  const stripFences=(t:string)=>t.trim().replace(/^```json\s*/i,'').replace(/```\s*$/i,'').trim()
  const tryParse=(t:string)=>{
    try{
      const p=JSON.parse(t) as {answer?:unknown;confidence?:unknown}
      const answer=typeof p.answer==='string'?p.answer.trim():''
      const confidence=Number(p.confidence)
      return answer&&Number.isFinite(confidence)?{answer,confidence:Math.max(0,Math.min(1,confidence))}:null
    }catch{return null}
  }
  const cleaned=stripFences(raw)
  const direct=tryParse(cleaned)
  if(direct)return direct
  const extracted=extractBalancedJsonObject(cleaned)
  if(extracted){const recovered=tryParse(extracted);if(recovered)return recovered}
  const loose=recoverLooseAnswerAndConfidence(cleaned)
  if(loose)return{...loose,recovered:true}
  const salvaged=salvageTruncatedAnswer(cleaned)
  // No confidence was emitted, so a genuinely truncated answer still cannot enter the confident path.
  if(salvaged)return{answer:salvaged,confidence:0,truncated:true}
  return null
}

/**
 * Which retrieved items the answer actually leans on. Retrieval counts say what was HANDED to the
 * reasoner; only a citation in the answer text shows an item informed a claim. Procedural skills
 * are tracked separately because using a validated HOW-to-reason skill is not factual grounding
 * and therefore must not raise the knowledge-evidence confidence ceiling.
 */
export function citedEvidence(answer:string):{kg:number;cl:number;em:number;sk:number}{
  const text=String(answer??'')
  const count=(prefix:string)=>new Set([...text.matchAll(new RegExp(`\\[${prefix}(\\d{1,2})\\]`,'g'))].map(m=>m[1])).size
  return {kg:count('KG'),cl:count('CL'),em:count('EM'),sk:count('SK')}
}
