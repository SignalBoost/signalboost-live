// saas/lib/cos-core/layers/learning/publicClients.ts
import type { LearningConnectorSearch, LearningConnectorResult } from './connectors'
import { abstractFromInvertedIndex, abstractFromJats, openAlexAbstractIsSubstantive } from './openAlexAbstract.ts'

type FetchLike=typeof fetch
const TRANSIENT_STATUS=new Set([408,425,429,500,502,503,504])
function delay(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
async function getJson(url:string,fetcher:FetchLike=fetch):Promise<any>{let lastError:unknown;for(let attempt=0;attempt<3;attempt++){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const response=await fetcher(url,{headers:{accept:'application/json','user-agent':'SignalBoost-COS/1.0 (https://signalboostapp.com)'},signal:controller.signal});if(!response.ok){const error=new Error(`COS learning source failed: ${response.status}`);if(!TRANSIENT_STATUS.has(response.status))throw error;lastError=error}else{return await response.json()}}catch(error){lastError=error;if(attempt>=2)throw error}finally{clearTimeout(timer)}await delay(250*(attempt+1))}throw lastError instanceof Error?lastError:new Error('COS learning source failed')}
async function getText(url:string,fetcher:FetchLike=fetch):Promise<string>{let lastError:unknown;for(let attempt=0;attempt<3;attempt++){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetcher(url,{headers:{accept:'application/xml,text/xml;q=0.9,text/plain;q=0.8','user-agent':'SignalBoost-COS/1.0 (https://signalboostapp.com)'},signal:controller.signal});if(!response.ok){const error=new Error(`COS learning source failed: ${response.status}`);if(!TRANSIENT_STATUS.has(response.status))throw error;lastError=error}else{return await response.text()}}catch(error){lastError=error;if(attempt>=2)throw error}finally{clearTimeout(timer)}await delay(300*(attempt+1))}throw lastError instanceof Error?lastError:new Error('COS learning source failed')}
function decodeEntities(value:string):string{return value.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#x([0-9a-f]+);/gi,(_,hex)=>String.fromCodePoint(parseInt(hex,16))).replace(/&#(\d+);/g,(_,dec)=>String.fromCodePoint(parseInt(dec,10)))}
function clean(value:unknown):string{return decodeEntities(String(value??'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim()}
function cleanXmlArticle(xml:string):string{return clean(xml.replace(/<ref-list\b[\s\S]*?<\/ref-list>/gi,' ').replace(/<table-wrap\b[\s\S]*?<\/table-wrap>/gi,' ').replace(/<fig\b[\s\S]*?<\/fig>/gi,' ')).slice(0,60000)}
function compactQuery(query:string,maxTerms=10):string{return clean(query).split(/\s+/).filter(Boolean).slice(0,maxTerms).join(' ')}

/**
 * Crossref: bibliographic search instead of a long natural-language query, and no select, which can
 * fail as Crossref evolves its permitted field list. The abstract, when the publisher deposited one,
 * arrives as JATS XML; it was passed through with its tags intact and labelled "metadata" regardless,
 * which forced every Crossref result into the metadata evidence class and capped its confidence at the
 * metadata ceiling even when a full abstract was present. The label now states what came back.
 */
export const crossrefScientificSearch:LearningConnectorSearch=async(query,limit)=>{const q=compactQuery(query);const json=await getJson(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=${Math.min(limit,10)}`);return(json?.message?.items??[]).map((item:any):LearningConnectorResult=>{const title=clean(item.title?.[0]),abstract=clean(abstractFromJats(item.abstract)),substantive=openAlexAbstractIsSubstantive(abstract);return{uri:item.URL||(item.DOI?`https://doi.org/${item.DOI}`:''),title,text:clean(abstract?`${title}. ${abstract}`:`${title}. Publisher: ${item.publisher??''}. Subject: ${(item.subject??[]).slice(0,6).join(', ')}.`),license:substantive?'abstract as deposited with Crossref by the publisher; COS retains only facts, summary, and provenance':'metadata/abstract as supplied by Crossref'}}).filter((x:LearningConnectorResult)=>x.uri&&x.text)}

/**
 * OpenAlex: compact search terms reduce 400s from oversized curriculum questions. The response
 * already carries the abstract as an inverted index, so it is reconstructed here rather than
 * discarded — the previous text was title, topic, keywords and a citation count, which reads as a
 * bibliographic stub and fails the confidence floor no matter how relevant the work is. No extra
 * request, no new source, and the licence label still states what the evidence actually is.
 */
export const openAlexScientificSearch:LearningConnectorSearch=async(query,limit)=>{
  const q=compactQuery(query,8)
  const json=await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${Math.min(limit,10)}&mailto=hello%40signalboostapp.com`)
  return(json?.results??[]).map((item:any):LearningConnectorResult=>{
    const title=clean(item.title)
    const abstract=clean(abstractFromInvertedIndex(item.abstract_inverted_index))
    const descriptor=clean(`${item.primary_topic?.display_name??''}. ${(item.keywords??[]).slice(0,6).map((k:any)=>k.display_name).join(', ')}. Cited by ${item.cited_by_count??0}.`)
    const substantive=openAlexAbstractIsSubstantive(abstract)
    return{
      uri:item.doi||item.id,
      title,
      text:clean(abstract?`${title}. ${abstract} ${descriptor}`:`${title}. ${descriptor}`),
      license:substantive
        ?'OpenAlex CC0 abstract read for grounded learning; COS retains only facts, summary, and provenance'
        :(item.open_access?.is_oa?'open-access metadata':'metadata only'),
    }
  }).filter((x:LearningConnectorResult)=>x.uri&&x.text)
}

export const openLibrarySearch:LearningConnectorSearch=async(query,limit)=>{const json=await getJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(compactQuery(query,8))}&limit=${Math.min(limit,10)}`);return(json?.docs??[]).map((item:any):LearningConnectorResult=>({uri:item.key?`https://openlibrary.org${item.key}`:'',title:clean(item.title),text:clean(`${item.title??''}. ${item.author_name?.join(', ')??''}. First published ${item.first_publish_year??'unknown'}. Subjects: ${item.subject?.slice(0,8).join(', ')??''}.`),license:'Open Library metadata'})).filter((x:LearningConnectorResult)=>x.uri&&x.text)}


function projectGutenbergPlainTextUrl(formats:unknown):string{
  if(!formats||typeof formats!=='object')return''
  const map=formats as Record<string,unknown>
  const candidate=[
    map['text/plain; charset=utf-8'],
    map['text/plain; charset=us-ascii'],
    map['text/plain'],
  ].find(value=>typeof value==='string'&&value.trim()) as string|undefined
  if(!candidate)return''
  try{
    const parsed=new URL(candidate)
    const host=parsed.hostname.toLowerCase()
    if(parsed.protocol!=='https:'||!(host==='gutenberg.org'||host.endsWith('.gutenberg.org')))return''
    return parsed.toString()
  }catch{return''}
}

function projectGutenbergBody(raw:string):string{
  const value=String(raw??'').replace(/^\uFEFF/,'')
  const start=/\*\*\*\s*START OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(value)
  const end=/\*\*\*\s*END OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(value)
  const from=start?start.index+start[0].length:0
  const to=end&&end.index>from?end.index:value.length
  return clean(value.slice(from,to)).slice(0,60000)
}

/**
 * Project Gutenberg public-domain full text.
 *
 * Gutendex is discovery only. A row is admitted here only when its catalog record explicitly says
 * copyright=false AND it supplies an HTTPS text/plain URL on a Project Gutenberg host. The text
 * itself is then fetched from Project Gutenberg, not from an arbitrary URL returned by discovery.
 * This is the first book source whose retained rows may truthfully carry the exact "public domain"
 * rights label used by the conservative mass-distillation packager.
 */
export function createProjectGutenbergPublicDomainSearch(fetcher:FetchLike=fetch):LearningConnectorSearch{return async(query,limit)=>{
  const bounded=Math.min(Math.max(limit,1),5)
  const json=await getJson(`https://gutendex.com/books/?search=${encodeURIComponent(compactQuery(query,8))}`,fetcher)
  const rows=(json?.results??[]).filter((item:any)=>item?.copyright===false).slice(0,Math.max(bounded*3,bounded))
  const results:LearningConnectorResult[]=[]
  for(const item of rows){
    if(results.length>=bounded)break
    const id=Number(item?.id)
    if(!Number.isInteger(id)||id<=0)continue
    const textUrl=projectGutenbergPlainTextUrl(item?.formats)
    if(!textUrl)continue
    try{
      const body=projectGutenbergBody(await getText(textUrl,fetcher))
      if(body.length<900)continue
      const title=clean(item?.title)
      const authors=Array.isArray(item?.authors)?item.authors.map((author:any)=>clean(author?.name)).filter(Boolean).slice(0,5):[]
      results.push({
        uri:`https://www.gutenberg.org/ebooks/${id}`,
        title,
        text:clean(`${title}. ${authors.join(', ')}. ${body}`).slice(0,60000),
        license:'public domain',
        evidence:[
          `project_gutenberg_ebook_id:${id}`,
          'gutendex_copyright:false',
          `project_gutenberg_text:${textUrl}`,
        ],
      })
    }catch{/* one unavailable book must not abort the bounded source */}
  }
  return results
}}
export const projectGutenbergPublicDomainSearch=createProjectGutenbergPublicDomainSearch()

/**
 * Europe PMC exposes Open Access full text through /{PMCID}/fullTextXML. Search with resultType=core
 * so PMCID/open-access state and abstracts are available, then fetch the full XML only for the small
 * result set that is actually being considered. COS never stores the raw paper: the learning cycle
 * retains a bounded relevant excerpt/facts plus provenance, which preserves the source policy while
 * letting confidence be based on substantive evidence instead of bibliographic stubs.
 */
export function createEuropePmcScientificSearch(fetcher:FetchLike=fetch):LearningConnectorSearch{return async(query,limit)=>{
  const bounded=Math.min(Math.max(limit,1),10)
  const json=await getJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(compactQuery(query,8))}&pageSize=${bounded}&resultType=core&format=json`,fetcher)
  const rows=(json?.resultList?.result??[]).slice(0,bounded)
  const results=await Promise.all(rows.map(async(item:any):Promise<LearningConnectorResult>=>{
    const pmcid=clean(item.pmcid)
    const title=clean(item.title)
    const uri=pmcid?`https://europepmc.org/article/PMC/${pmcid.replace(/^PMC/i,'')}`:item.doi?`https://doi.org/${item.doi}`:''
    const abstract=clean(item.abstractText||item.abstract||'')
    const metadata=clean(`${title}. ${abstract} ${item.authorString??''}. ${item.journalTitle??''} ${item.pubYear??''}.`)
    if(pmcid&&String(item.isOpenAccess??'').toUpperCase()==='Y'){
      try{
        const xml=await getText(`https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(pmcid)}/fullTextXML`,fetcher)
        const full=cleanXmlArticle(xml)
        if(full.length>=900)return{uri,title,text:full,license:'Europe PMC Open Access full text read for grounded learning; COS retains only facts, summary, and provenance'}
      }catch{/* fall back to abstract/metadata without aborting the source */}
    }
    return{uri,title,text:metadata,license:abstract.length>=300?'Europe PMC abstract metadata':'metadata only'}
  }))
  return results.filter((x:LearningConnectorResult)=>Boolean(x.uri&&x.text))
}}
export const europePmcScientificSearch=createEuropePmcScientificSearch()
