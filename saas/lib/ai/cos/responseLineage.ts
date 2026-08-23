function numeric(value:unknown):number|null{
  const parsed=Number(value)
  return Number.isFinite(parsed)?parsed:null
}

/**
 * Rank only machine-recorded answer lineage, never prose claims.
 * Higher scores mean stronger evidence that this provenance describes the generator which actually
 * supplied the returned answer. A same-response write may replace an earlier record only when its
 * lineage strength is at least as high.
 */
export function responseLineageStrength(provenance:any):number{
  if(!provenance||typeof provenance!=='object')return 0
  const external=Boolean(provenance.external_ai?.invoked)
  const cached=Boolean(provenance.answer_origin?.from_cache)
  const deterministic=Boolean(provenance.deterministic_utility?.used||provenance.authoritative_source?.used)
  const local=Boolean(provenance.local_reasoning?.invoked)
  const confidence=numeric(provenance.local_reasoning?.confidence)
  const threshold=numeric(provenance.local_reasoning?.threshold)??0.72
  const acceptedLocal=local&&confidence!==null&&confidence>=threshold
  let score=0
  if(external)score=500
  else if(cached)score=450
  else if(deterministic)score=400
  else if(acceptedLocal)score=300
  else if(local)score=100
  if(confidence!==null)score+=Math.max(0,Math.min(1,confidence))*10
  if(provenance.answer_origin?.model||provenance.external_ai?.model||provenance.local_reasoning?.model)score+=1
  return score
}

/** Never persist a source label that contradicts its own execution telemetry. */
export function recordedSourceForProvenance(requestedSource:string|undefined|null,provenance:any):string|null{
  const source=String(requestedSource??'').trim()
  if(source==='external_fallback'&&!provenance?.external_ai?.invoked){
    if(provenance?.answer_origin?.from_cache)return'cos-semantic-cache'
    if(provenance?.deterministic_utility?.used||provenance?.authoritative_source?.used)return'cos-deterministic'
    if(provenance?.local_reasoning?.invoked)return'cos-local-retry'
    return'cos-response-lineage-unknown'
  }
  return source||null
}
