import type { LearningConnectorSearch, LearningConnectorResult } from './connectors'

const TRANSIENT_STATUS=new Set([408,425,429,500,502,503,504])
function delay(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
async function getJson(url:string):Promise<any>{let lastError:unknown;for(let attempt=0;attempt<3;attempt++){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const response=await fetch(url,{headers:{accept:'application/json','user-agent':'SignalBoost-COS/1.0 (https://signalboostapp.com)'},signal:controller.signal});if(!response.ok){const error=new Error(`COS learning source failed: ${response.status}`);if(!TRANSIENT_STATUS.has(response.status))throw error;lastError=error}else{return await response.json()}}catch(error){lastError=error;if(attempt>=2)throw error}finally{clearTimeout(timer)}await delay(250*(attempt+1))}throw lastError instanceof Error?lastError:new Error('COS learning source failed')}
async function getText(url:string):Promise<string>{let lastError:unknown;for(let attempt=0;attempt<3;attempt++){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(url,{headers:{accept:'application/xml,text/xml;q=0.9,text/plain;q=0.8','user-agent':'SignalBoost-COS/1.0 (https://signalboostapp.com)'},signal:controller.signal});if(!response.ok){const error=new Error(`COS learning source failed: ${response.status}`);if(!TRANSIENT_STATUS.has(response.status))throw error;lastError=error}else{return await response.text()}}catch(error){lastError=error;if(attempt>=2)throw error}finally{clearTimeout(timer)}await delay(300*(attempt+1))}throw lastError instanceof Error?lastError:new Error('COS learning source failed')}
function decodeEntities(value:string):string{return value.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#x([0-9a-f]+);/gi,(_,hex)=>String.fromCodePoint(parseInt(hex,16))).replace(/&#(\d+);/g,(_,dec)=>String.fromCodePoint(parseInt(dec,10)))}
function clean(value:unknown):string{return decodeEntities(String(value??'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim()}
function cleanXmlArticle(xml:string):string{return clean(xml.replace(/<ref-list\b[\s\S]*?<\/ref-list>/gi,' ').replace(/<table-wrap\b[\s\S]*?<\/table-wrap>/gi,' ').replace(/<fig\b[\s\S]*?<\/fig>/gi,' ')).slice(0,60000)}
function compactQuery(query:string,maxTerms=10):string{return clean(query).split(/\s+/).filter(Boolean).slice(0,maxTerms).join(' ')}

/** Crossref: use bibliographic search instead of a long natural-language query and avoid select,
 * which can fail as Crossref evolves its permitted field list. */
export const crossrefScientificSearch:LearningConnectorSearch=async(query,limit)=>{const q=compactQuery(query);const json=await getJson(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=${Math.min(limit,10)}`);return(json?.message?.items??[]).map((item:any):LearningConnectorResult=>({uri:item.URL||(item.DOI?`https://doi.org/${item.DOI}`:''),title:clean(item.title?.[0]),text:clean(item.abstract||`${item.title?.[0]??''}. Publisher: ${item.publisher??''}. Subject: ${(item.subject??[]).slice(0,6).join(', ')}.`),license:'metadata/abstract as supplied by Crossref'})).filter((x:LearningConnectorResult)=>x.uri&&x.text)}

/** OpenAlex: compact search terms reduce 400s from oversized curriculum questions. */
export const openAlexScientificSearch:LearningConnectorSearch=async(query,limit)=>{const q=compactQuery(query,8);const json=await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${Math.min(limit,10)}&mailto=hello%40signalboostapp.com`);return(json?.results??[]).map((item:any):LearningConnectorResult=>({uri:item.doi||item.id,title:clean(item.title),text:clean(`${item.title??''}. ${item.primary_topic?.display_name??''}. ${(item.keywords??[]).slice(0,6).map((k:any)=>k.display_name).join(', ')}. Cited by ${item.cited_by_count??0}.`),license:item.open_access?.is_oa?'open-access metadata':'metadata only'})).filter((x:LearningConnectorResult)=>x.uri&&x.text)}

export const openLibrarySearch:LearningConnectorSearch=async(query,limit)=>{const json=await getJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(compactQuery(query,8))}&limit=${Math.min(limit,10)}`);return(json?.docs??[]).map((item:any):LearningConnectorResult=>({uri:item.key?`https://openlibrary.org${item.key}`:'',title:clean(item.title),text:clean(`${item.title??''}. ${item.author_name?.join(', ')??''}. First published ${item.first_publish_year??'unknown'}. Subjects: ${item.subject?.slice(0,8).join(', ')??''}.`),license:'Open Library metadata'})).filter((x:LearningConnectorResult)=>x.uri&&x.text)}

/**
 * Europe PMC exposes Open Access full text through /{PMCID}/fullTextXML. Search with resultType=core
 * so PMCID/open-access state and abstracts are available, then fetch the full XML only for the small
 * result set that is actually being considered. COS never stores the raw paper: the learning cycle
 * retains a bounded relevant excerpt/facts plus provenance, which preserves the source policy while
 * letting confidence be based on substantive evidence instead of bibliographic stubs.
 */
export const europePmcScientificSearch:LearningConnectorSearch=async(query,limit)=>{
  const bounded=Math.min(Math.max(limit,1),10)
  const json=await getJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(compactQuery(query,8))}&pageSize=${bounded}&resultType=core&format=json`)
  const rows=(json?.resultList?.result??[]).slice(0,bounded)
  return await Promise.all(rows.map(async(item:any):Promise<LearningConnectorResult>=>{
    const pmcid=clean(item.pmcid)
    const title=clean(item.title)
    const uri=pmcid?`https://europepmc.org/article/PMC/${pmcid.replace(/^PMC/i,'')}`:item.doi?`https://doi.org/${item.doi}`:''
    const abstract=clean(item.abstractText||item.abstract||'')
    const metadata=clean(`${title}. ${abstract} ${item.authorString??''}. ${item.journalTitle??''} ${item.pubYear??''}.`)
    if(pmcid&&String(item.isOpenAccess??'').toUpperCase()==='Y'){
      try{
        const xml=await getText(`https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(pmcid)}/fullTextXML`)
        const full=cleanXmlArticle(xml)
        if(full.length>=900)return{uri,title,text:full,license:'Europe PMC Open Access full text read for grounded learning; COS retains only facts, summary, and provenance'}
      }catch{/* fall back to abstract/metadata without aborting the source */}
    }
    return{uri,title,text:metadata,license:abstract.length>=300?'Europe PMC abstract metadata':'metadata only'}
  })).then(results=>results.filter((x:LearningConnectorResult)=>Boolean(x.uri&&x.text)))
}
