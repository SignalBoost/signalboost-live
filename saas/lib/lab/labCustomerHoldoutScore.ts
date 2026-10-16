// Pure deterministic scoring on customer-supplied held-out expected answers and outputs.
// No model inference, independence assurance, external calls or paid work.
export type HoldoutScore = Readonly<{total:number;baseCorrect:number;trainedCorrect:number;baseAccuracy:number;trainedAccuracy:number;delta:number}>
export function scoreCustomerHoldout(raw: string): HoldoutScore {
 const lines=raw.split(/\r?\n/).filter(x=>x.trim())
 if(!lines.length || lines.length>128) throw new Error('holdout_count_invalid')
 let base=0,trained=0
 const seen=new Set<string>()
 for(const line of lines){
  let x:unknown
  try{x=JSON.parse(line)}catch{throw new Error('holdout_json_invalid')}
  if(!x || typeof x!=='object' || Array.isArray(x)) throw new Error('holdout_row_invalid')
  const row=x as Record<string,unknown>
  if(!['prompt','expected','base','trained'].every(k=>typeof row[k]==='string' && (row[k] as string).trim().length>0 && (row[k] as string).length<=20000))throw new Error('holdout_row_invalid')
  const prompt=(row.prompt as string).trim().replace(/\s+/g,' ').toLowerCase()
  if(seen.has(prompt))throw new Error('holdout_prompt_duplicate')
  seen.add(prompt)
  // Exact-match only: no semantic or quality judgment is asserted.
  const norm=(v:unknown)=>String(v).trim().replace(/\s+/g,' ').toLowerCase()
  const expected=norm(row.expected)
  if(norm(row.base)===expected)base++
  if(norm(row.trained)===expected)trained++
 }
 return Object.freeze({total:lines.length,baseCorrect:base,trainedCorrect:trained,baseAccuracy:base/lines.length,trainedAccuracy:trained/lines.length,delta:(trained-base)/lines.length})
}
