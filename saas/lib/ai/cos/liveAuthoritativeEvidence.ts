import { getExternalInfo, type SearchResult } from '@/lib/ai/tools/getExternalInfo'

export type LiveAuthorityTier = 'primary' | 'institutional' | 'secondary'
export type LiveAuthoritativeSource = SearchResult & {
  id: string
  host: string
  authorityTier: LiveAuthorityTier
  authorityScore: number
}

export type LiveAuthoritativeEvidenceResult = {
  attempted: boolean
  sufficient: boolean
  query: string
  retrievedAt: string
  sources: LiveAuthoritativeSource[]
  reason: string
}

const STOPWORDS = new Set(['the','a','an','and','or','of','to','in','on','for','with','from','is','are','was','were','who','what','when','where','which','how','does','did','has','have','current','currently','today','now','latest','right','present','please','tell','about','this','that','these','those'])

function tokens(value:string):string[]{return[...new Set(String(value||'').toLowerCase().match(/[a-z0-9][a-z0-9+.#-]{2,}/g)||[])].filter(token=>!STOPWORDS.has(token)).slice(0,14)}
function hostFromUrl(value:string):string{try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function isGovernment(host:string):boolean{return host.endsWith('.gov')||host.includes('.gov.')||host==='gov.uk'||host.endsWith('.gov.uk')||host.endsWith('.gouv.fr')||host.endsWith('.gov.pl')||host.endsWith('.gov.br')||host.endsWith('.europa.eu')}
function isMilitary(host:string):boolean{return host.endsWith('.mil')||host.includes('.mil.')}
function overlap(query:string,text:string):number{const q=tokens(query),haystack=String(text||'').toLowerCase();return q.filter(token=>haystack.includes(token)).length}

export function liveAuthorityScore(question:string,result:SearchResult):number{
  const host=hostFromUrl(result.url)
  if(!host)return 0
  let score=0
  if(isGovernment(host))score+=120
  if(isMilitary(host))score+=115
  if(host.endsWith('.edu')||host.includes('.edu.'))score+=45
  score+=Math.min(60,overlap(question,host.replace(/[.-]/g,' '))*30)
  score+=Math.min(30,overlap(question,result.title)*10)
  if(/\b(?:official|documentation|docs|reference|release notes|standard|specification|administration|leadership)\b/i.test(result.title))score+=25
  if(/^(?:docs|developer|developers|support|help|learn)\./.test(host))score+=25
  if(String(result.url||'').startsWith('https://'))score+=2
  return score
}

export function liveAuthorityTier(question:string,result:SearchResult):LiveAuthorityTier{
  const host=hostFromUrl(result.url),score=liveAuthorityScore(question,result)
  if(isGovernment(host)||isMilitary(host)||score>=75)return'primary'
  if(score>=35)return'institutional'
  return'secondary'
}

export function liveEvidenceSearchQuery(question:string,now=new Date()):string{
  return `${String(question||'').trim()} official authoritative source current as of ${now.toISOString().slice(0,10)}`.slice(0,400)
}

export function prepareLiveAuthoritativeEvidence(question:string,results:SearchResult[],limit=8):LiveAuthoritativeSource[]{
  const seen=new Set<string>()
  return results.map((result,index)=>{
    let url:string
    try{const parsed=new URL(String(result.url||'').trim());if(!['http:','https:'].includes(parsed.protocol))return null;parsed.hash='';url=parsed.toString()}catch{return null}
    const key=url.toLowerCase().replace(/\/$/,'')
    if(seen.has(key))return null
    seen.add(key)
    const normalized:SearchResult={title:String(result.title||'').trim().slice(0,200),url,snippet:String(result.snippet||'').trim().slice(0,600)}
    return{...normalized,index,host:hostFromUrl(url),authorityScore:liveAuthorityScore(question,normalized),authorityTier:liveAuthorityTier(question,normalized)}
  }).filter(Boolean).sort((a:any,b:any)=>b.authorityScore-a.authorityScore||a.index-b.index).slice(0,Math.max(1,Math.min(limit,12))).map((entry:any,index)=>({title:entry.title,url:entry.url,snippet:entry.snippet,host:entry.host,authorityScore:entry.authorityScore,authorityTier:entry.authorityTier,id:`LIVE${index+1}`}))
}

export function liveAuthoritativeEvidenceIsSufficient(sources:LiveAuthoritativeSource[]):boolean{
  if(!sources.length)return false
  if(sources.some(source=>source.authorityTier==='primary'))return true
  const institutionalHosts=new Set(sources.filter(source=>source.authorityTier==='institutional').map(source=>source.host).filter(Boolean))
  if(institutionalHosts.size>=2)return true
  const allHosts=new Set(sources.map(source=>source.host).filter(Boolean))
  return allHosts.size>=3
}

export async function researchLiveAuthoritativeEvidence(question:string,now=new Date()):Promise<LiveAuthoritativeEvidenceResult>{
  const query=liveEvidenceSearchQuery(question,now),retrievedAt=now.toISOString()
  const result=await getExternalInfo(query,10)
  if(!result.ok)return{attempted:true,sufficient:false,query,retrievedAt,sources:[],reason:result.error||'live_search_failed'}
  const sources=prepareLiveAuthoritativeEvidence(question,result.results,8)
  const sufficient=liveAuthoritativeEvidenceIsSufficient(sources)
  return{attempted:true,sufficient,query,retrievedAt,sources,reason:sufficient?'authoritative_live_evidence_available':sources.length?'live_results_not_authoritative_enough':'no_live_results'}
}
