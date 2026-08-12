// saas/lib/ai/cos/reasonerOutput.ts
//
// Parsing the reasoner's reply, kept free of every platform dependency so it can be unit-tested on
// its own — the module it used to live in imports Supabase, which made the parse path effectively
// untestable and let a whole class of failure through unexamined.
//
// The reasoner is asked to wrap its entire answer inside one JSON string. That is convenient until
// it stops writing mid-string, at which point strict parsing throws away a complete, useful,
// three-quarters-finished answer and the user is told only that something was "unparseable".

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

/**
 * Recover the answer from a JSON object that was cut off mid-string.
 *
 * The reasoner is asked to wrap its whole answer inside one JSON string, which means a single
 * truncation — hitting the token ceiling three quarters of the way through a good answer —
 * discards ALL of it and the user gets nothing. That is a worse outcome than an incomplete answer
 * clearly labelled as incomplete, so the text written before the cut is salvaged.
 *
 * Salvage is deliberately conservative: it fires only when a truncated `"answer"` string is present
 * and long enough to be useful, and the caller must treat the result as unfinished rather than
 * passing it off as a whole answer.
 */
export function salvageTruncatedAnswer(raw:string,minimumCharacters=200):string|null{
  const key=raw.indexOf('"answer"')
  if(key===-1)return null
  const colon=raw.indexOf(':',key+8)
  if(colon===-1)return null
  const open=raw.indexOf('"',colon+1)
  if(open===-1)return null
  let out='',escaped=false,closed=false
  for(let i=open+1;i<raw.length;i++){
    const ch=raw[i]
    if(escaped){out+=ch==='n'?'\n':ch==='t'?'\t':ch;escaped=false;continue}
    if(ch==='\\'){escaped=true;continue}
    if(ch==='"'){closed=true;break}
    out+=ch
  }
  // A properly closed string is not a truncation — the normal parser owns that case.
  if(closed)return null
  const salvaged=out.trim()
  return salvaged.length>=minimumCharacters?salvaged:null
}

export type LocalResult={answer:string;confidence:number;truncated?:boolean}

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
  if(extracted){
    const recovered=tryParse(extracted)
    if(recovered)return recovered
  }
  const salvaged=salvageTruncatedAnswer(cleaned)
  // No confidence was ever emitted — the model never reached that field — so none is invented here.
  // The floor value keeps an unfinished answer out of the confident path on its own merits.
  if(salvaged)return{answer:salvaged,confidence:0,truncated:true}
  return null
}
