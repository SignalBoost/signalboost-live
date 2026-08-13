export type GroundingSystem = 'kg' | 'cl' | 'em'

export type GroundingEvidence = {
  system: GroundingSystem
  label: string
  text: string
  relevance: number
}

const STOP_WORDS = new Set(['about','after','again','also','because','before','being','could','does','from','have','into','more','most','should','that','their','there','these','they','this','those','through','under','what','when','where','which','while','with','would','your','you','and','the','for','are','how','why'])

function terms(text:string):string[]{
  return [...new Set(String(text??'').toLowerCase().replace(/[^a-z0-9\s_-]/g,' ').split(/\s+/).filter(t=>t.length>=4&&!STOP_WORDS.has(t)))]
}

export function relevanceScore(query:string,evidence:string):number{
  const q=terms(query), e=new Set(terms(evidence))
  if(!q.length)return 0
  const hits=q.filter(t=>e.has(t)).length
  return hits/q.length
}

export function selectGroundingEvidence(query:string,input:{kg:string[];cl:string[];em:string[]},max=5):GroundingEvidence[]{
  const all:GroundingEvidence[]=[]
  const add=(system:GroundingSystem,rows:string[])=>rows.forEach((text,index)=>{
    const label=system==='kg'?`KG${index+1}`:system==='cl'?`CL${index+1}`:`EM${index+1}`
    const relevance=relevanceScore(query,text)
    if(relevance>0)all.push({system,label,text,relevance})
  })
  add('kg',input.kg);add('cl',input.cl);add('em',input.em)
  all.sort((a,b)=>b.relevance-a.relevance||a.system.localeCompare(b.system)||a.label.localeCompare(b.label))

  // Preserve diversity without forcing irrelevant evidence: first take each represented system's best item.
  const selected:GroundingEvidence[]=[]
  for(const system of ['kg','cl','em'] as GroundingSystem[]){
    const best=all.find(item=>item.system===system)
    if(best&&selected.length<max)selected.push(best)
  }
  for(const item of all){
    if(selected.length>=max)break
    if(!selected.some(chosen=>chosen.label===item.label))selected.push(item)
  }
  return selected.sort((a,b)=>b.relevance-a.relevance||a.label.localeCompare(b.label))
}

export function groundingPromptBlock(items:GroundingEvidence[]):string{
  if(!items.length)return ''
  return ['SELECTED INTERNAL EVIDENCE — use only when it materially supports a claim; cite the label inline:',...items.map(item=>item.text)].join('\n')
}

export function groundingConfidenceCap(args:{retrieved:number;selected:number;cited:number}):number{
  if(args.selected===0)return 1
  if(args.cited>0)return 1
  // Retrieval produced relevant evidence but the answer ignored all of it. Do not let a free-floating answer
  // present itself as highly grounded; 0.70 keeps it below the default 0.72 COS escalation threshold.
  return 0.70
}
