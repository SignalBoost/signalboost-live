// saas/lib/cos-core/layers/learning/publicClients.ts
import type { LearningConnectorSearch, LearningConnectorResult } from './connectors.ts'
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


const DEFAULT_GUTENDEX_BASE_URL='https://gutendex.com'
const DEFAULT_GUTENBERG_MIRROR_BASE_URL='https://www.gutenberg.org/cache/epub'
const DEFAULT_GUTENBERG_OPDS_SEARCH_URL='https://m.gutenberg.org/ebooks/search.opds/'
const DEFAULT_OPEN_LIBRARY_SEARCH_URL='https://openlibrary.org/search.json'

type ProjectGutenbergCandidate={
  id:number
  title:string
  authors:string[]
  discoveryEvidence:string[]
}


const PROJECT_GUTENBERG_BOOTSTRAP:ReadonlyArray<ProjectGutenbergCandidate & {terms:string}>=Object.freeze([
  {id:34221,title:'Electricity and Magnetism',authors:['Elisha Gray'],terms:'electricity magnetism physics engineering science',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:48041,title:'The Study of Elementary Electricity and Magnetism by Experiment',authors:['Thomas M. St. John'],terms:'electricity magnetism experiment physics engineering laboratory',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:33283,title:'Calculus Made Easy',authors:['Silvanus P. Thompson'],terms:'calculus differential integral mathematics analysis',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:38769,title:'A Course of Pure Mathematics',authors:['G. H. Hardy'],terms:'mathematics calculus analysis functions series',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:32625,title:'A Treatise on Probability',authors:['John Maynard Keynes'],terms:'probability statistics uncertainty reasoning mathematics economics',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:15114,title:'An Investigation of the Laws of Thought',authors:['George Boole'],terms:'logic reasoning probability mathematics boolean computing foundations',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:3300,title:'An Inquiry into the Nature and Causes of the Wealth of Nations',authors:['Adam Smith'],terms:'economics markets political economy labor trade finance',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:36525,title:'Notes on Recent Researches in Electricity and Magnetism',authors:['J. J. Thomson'],terms:'electricity magnetism physics research waves currents',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:22062,title:'The Mathematicall Praeface to Elements of Geometrie of Euclid of Megara',authors:['John Dee'],terms:'geometry geometrie mathematics mathematical algebra foundations',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:78112,title:'Astronomy for beginners',authors:['Hereward Carrington'],terms:'astronomy stars planets telescope observation celestial physics',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:14725,title:'Treatise on light',authors:['Christiaan Huygens'],terms:'optics light refraction reflection wave physics',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:78610,title:'Reflections on the motive power of heat',authors:['Sadi Carnot','William Thomson Kelvin'],terms:'thermodynamics heat energy engines physics machines',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:49445,title:'Mechanics: The Science of Machinery',authors:['A. Russell Bond'],terms:'mechanics dynamics physics engineering machines machinery',discoveryEvidence:['discovery:local_bootstrap_catalog']},
  {id:57120,title:'The Economy of Workshop Manipulation',authors:['John Richards'],terms:'engineering mechanics machines machinery workshop manufacturing',discoveryEvidence:['discovery:local_bootstrap_catalog']},
])

function projectGutenbergBootstrapCandidates(query:string,bounded:number):ProjectGutenbergCandidate[]{
  const terms=new Set(compactQuery(query,12).toLowerCase().split(/\s+/).filter(term=>term.length>=4))
  return PROJECT_GUTENBERG_BOOTSTRAP
    .map(item=>{
      const haystack=`${item.title} ${item.terms}`.toLowerCase()
      const score=[...terms].filter(term=>haystack.includes(term)).length
      return{item,score}
    })
    .filter(entry=>entry.score>0)
    .sort((a,b)=>b.score-a.score||a.item.id-b.item.id)
    .slice(0,Math.max(bounded*2,bounded))
    .map(({item})=>({id:item.id,title:item.title,authors:[...item.authors],discoveryEvidence:[...item.discoveryEvidence]}))
}

function projectGutenbergHasPlainText(formats:unknown):boolean{
  if(!formats||typeof formats!=='object')return false
  return Object.keys(formats as Record<string,unknown>).some(key=>key.toLowerCase().startsWith('text/plain'))
}

function normalizedHttpsBase(value:unknown,fallback:string):string{
  const raw=clean(value)||fallback
  try{
    const parsed=new URL(raw)
    if(parsed.protocol!=='https:')return fallback
    parsed.search=''
    parsed.hash=''
    return parsed.toString().replace(/\/$/,'')
  }catch{return fallback}
}

function normalizedProjectGutenbergTextBase(value:unknown):string{
  const raw=clean(value)
  // A stray brace in the environment value is serialized by URL as %7D/%7B and creates a real 404.
  // Fail closed to the known-valid official Project Gutenberg cache instead of preserving malformed input.
  if(/[{}]/.test(raw)||/%7b|%7d/i.test(raw))return DEFAULT_GUTENBERG_MIRROR_BASE_URL
  const normalized=normalizedHttpsBase(raw,DEFAULT_GUTENBERG_MIRROR_BASE_URL)
  try{
    const parsed=new URL(normalized)
    const path=parsed.pathname.replace(/\/+$/,'')
    // PGLAF is a Gutenberg mirror, but its filesystem layout is not /cache/epub/<id>/pg<id>.txt.
    // Treat that historical configuration as invalid so older Production env values self-heal.
    if(parsed.hostname.toLowerCase()==='gutenberg.pglaf.org'&&path==='/cache/epub'){
      return DEFAULT_GUTENBERG_MIRROR_BASE_URL
    }
  }catch{return DEFAULT_GUTENBERG_MIRROR_BASE_URL}
  return normalized
}

function projectGutenbergMirrorTextUrls(id:number,mirrorBaseUrl:string):string[]{
  return [
    `${mirrorBaseUrl}/${id}/pg${id}.txt`,
    `${mirrorBaseUrl}/${id}/pg${id}-0.txt`,
  ]
}

function projectGutenbergBody(raw:string):string{
  const value=String(raw??'').replace(/^\uFEFF/,'')
  const start=/\*\*\*\s*START OF (?:THIS |THE )?PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(value)
  const end=/\*\*\*\s*END OF (?:THIS |THE )?PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(value)
  const from=start?start.index+start[0].length:0
  const to=end&&end.index>from?end.index:value.length
  return clean(value.slice(from,to)).slice(0,60000)
}

function projectGutenbergUsRightsEvidence(raw:string,discoveryEvidence:readonly string[]):string[]|null{
  const value=String(raw??'')
  if(!value)return null

  // Read only the ebook-specific preamble before START. Generic Project Gutenberg license text after
  // the book must never decide rights for the individual work.
  const start=/\*\*\*\s*START OF (?:THIS |THE )?PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(value)
  const preamble=value.slice(0,start?.index??Math.min(value.length,24000)).toLowerCase()
  if(!preamble)return null

  // Exact ebook-specific restriction markers always fail closed, including when catalog metadata says
  // public domain. This keeps the actual payload able to veto stale/incorrect discovery metadata.
  if(/this is a copyrighted project gutenberg ebook|this particular work is one of the few individual works restricted by copyright law|please follow the copyright guidelines in this file|included in the project gutenberg collection with the permission of the copyright holder/i.test(preamble))return null

  if(/almost no restrictions whatsoever|not restricted by copyright in the united states|not protected by u\.s\. copyright law|public domain in the united states/i.test(preamble)){
    return['project_gutenberg_license_header:verified_unrestricted_us','project_gutenberg_rights:verified_public_domain_us']
  }

  // Project Gutenberg OPDS is an official machine-readable catalog and exposes an ebook-specific
  // <rights> field. Production showed that generated plain-text files do not always repeat a positive
  // public-domain sentence in their preamble, even when OPDS explicitly marks the same ebook public
  // domain in the USA. Accept that official rights assertion only when the fetched ebook itself has no
  // restricted-work marker.
  if(discoveryEvidence.includes('project_gutenberg_opds_rights:public_domain_in_usa')){
    return['project_gutenberg_text_preamble:no_restriction_marker','project_gutenberg_rights:verified_public_domain_us']
  }
  return null
}

function numericProjectGutenbergIds(value:unknown):number[]{
  const values=Array.isArray(value)?value:[value]
  return values.map(item=>Number(String(item??'').trim())).filter(id=>Number.isInteger(id)&&id>0)
}

function projectGutenbergQueryVariants(query:string):string[]{
  const full=compactQuery(query,8)
  const stop=new Set(['and','the','for','with','from','into','scientific','science','mathematics','mathematical','physics','engineering','method','observation'])
  const terms=full.toLowerCase().split(/\s+/).map(term=>term.replace(/[^a-z0-9-]/g,'')).filter(term=>term.length>=4&&!stop.has(term))
  const variants=[full]
  if(terms.length>=2)variants.push(terms.slice(0,2).join(' '))
  variants.push(...terms)
  return [...new Set(variants.map(value=>value.trim()).filter(Boolean))].slice(0,5)
}

async function projectGutenbergCandidatesFromGutendex(query:string,bounded:number,baseUrl:string,fetcher:FetchLike):Promise<ProjectGutenbergCandidate[]>{
  try{
    const json=await getJson(`${baseUrl}/books/?search=${encodeURIComponent(compactQuery(query,8))}&copyright=false`,fetcher)
    return(json?.results??[])
      .filter((item:any)=>item?.copyright===false&&projectGutenbergHasPlainText(item?.formats))
      .slice(0,Math.max(bounded*4,bounded))
      .map((item:any):ProjectGutenbergCandidate=>({
        id:Number(item.id),
        title:clean(item.title),
        authors:Array.isArray(item.authors)?item.authors.map((author:any)=>clean(author?.name)).filter(Boolean).slice(0,5):[],
        discoveryEvidence:['discovery:gutendex','gutendex_copyright:false'],
      }))
      .filter((item:ProjectGutenbergCandidate)=>Number.isInteger(item.id)&&item.id>0)
  }catch(error){
    console.warn('[project-gutenberg] Gutendex discovery unavailable; falling back to Open Library Project Gutenberg identifiers',error instanceof Error?error.message:String(error))
    return[]
  }
}


function xmlTag(entry:string,tag:string):string{
  const match=new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i').exec(entry)
  return match?clean(match[1]):''
}

async function projectGutenbergCandidatesFromOpds(query:string,bounded:number,fetcher:FetchLike):Promise<ProjectGutenbergCandidate[]>{
  const target=Math.max(bounded*4,bounded)
  const seen=new Set<number>()
  const results:ProjectGutenbergCandidate[]=[]
  for(const variant of projectGutenbergQueryVariants(query)){
    try{
      const xml=await getText(`${DEFAULT_GUTENBERG_OPDS_SEARCH_URL}?query=${encodeURIComponent(variant)}`,fetcher)
      const entries=xml.match(/<entry\b[\s\S]*?<\/entry>/gi)??[]
      for(const entry of entries){
        const title=xmlTag(entry,'title')
        if(!title||/^no records found\.?$/i.test(title))continue
        const idText=xmlTag(entry,'id')
        const hrefs=[idText,...[...entry.matchAll(/href=["']([^"']+)["']/gi)].map(match=>match[1])]
        const id=hrefs.map(value=>/\/ebooks\/(\d+)/i.exec(value)?.[1]).map(Number).find(value=>Number.isInteger(value)&&value>0)
        if(!id||seen.has(id))continue
        seen.add(id)
        const authors=[...entry.matchAll(/<author\b[\s\S]*?<name(?:\s[^>]*)?>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)]
          .map(match=>clean(match[1])).filter(Boolean).slice(0,5)
        // Real Project Gutenberg OPDS uses a namespaced dcterms:rights element. The original
        // Production repair tested only an unprefixed <rights> fixture, so live public-domain entries
        // were still false-negatives. Match by XML local-name while preserving the same strict value gate.
        const rightsMatch=/<(?:[a-z0-9_.-]+:)?rights(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_.-]+:)?rights>/i.exec(entry)
        const rights=rightsMatch?clean(rightsMatch[1]):''
        const opdsPublicDomain=/^public domain in the (?:usa|u\.s\.|united states)\.?$/i.test(rights.trim())
        results.push({
          id,title,authors,
          discoveryEvidence:[
            'discovery:project_gutenberg_opds',
            `discovery_query:${variant}`,
            ...(opdsPublicDomain?['project_gutenberg_opds_rights:public_domain_in_usa']:[]),
          ],
        })
        if(results.length>=target)return results
      }
      if(results.length>=bounded)return results
    }catch(error){
      console.warn('[project-gutenberg] OPDS discovery variant unavailable',{variant,error:error instanceof Error?error.message:String(error)})
    }
  }
  return results
}

async function projectGutenbergCandidatesFromOpenLibrary(query:string,bounded:number,fetcher:FetchLike):Promise<ProjectGutenbergCandidate[]>{
  const fields='key,title,author_name,id_project_gutenberg'
  const target=Math.max(bounded*4,bounded)
  const seen=new Set<number>()
  const results:ProjectGutenbergCandidate[]=[]
  for(const variant of projectGutenbergQueryVariants(query)){
    const json=await getJson(`${DEFAULT_OPEN_LIBRARY_SEARCH_URL}?q=${encodeURIComponent(variant)}&fields=${encodeURIComponent(fields)}&limit=${Math.min(Math.max(bounded*10,20),50)}`,fetcher)
    for(const item of json?.docs??[]){
      for(const id of numericProjectGutenbergIds(item?.id_project_gutenberg)){
        if(seen.has(id))continue
        seen.add(id)
        results.push({
          id,
          title:clean(item?.title),
          authors:Array.isArray(item?.author_name)?item.author_name.map((author:any)=>clean(author)).filter(Boolean).slice(0,5):[],
          discoveryEvidence:['discovery:open_library_project_gutenberg_id',`discovery_query:${variant}`],
        })
        if(results.length>=target)return results
      }
    }
    if(results.length>=bounded)return results
  }
  return results
}


/**
 * Project Gutenberg U.S.-unrestricted full text through automation-safe discovery and mirror paths.
 *
 * Gutendex remains the preferred discovery source, but its public API can reject cloud/serverless
 * traffic. When that happens, Open Library's Project Gutenberg identifiers provide bounded discovery
 * without granting any rights. Rights are decided only after the actual ebook text is fetched: the
 * Project Gutenberg license/header must explicitly say the work is unrestricted in the United States,
 * and restricted/permission-only markers fail closed. This is stricter than trusting catalog metadata.
 *
 * Canonical identity stays on https://www.gutenberg.org/ebooks/<ID>. Bounded generated plain text is
 * fetched from Project Gutenberg's official https://www.gutenberg.org/cache/epub cache by default.
 * COS_PROJECT_GUTENBERG_MIRROR_BASE_URL may still point to a controlled HTTPS mirror whose layout is
 * compatible with /<ID>/pg<ID>.txt; the historical PGLAF /cache/epub base is rejected because that
 * mirror does not expose the official cache layout.
 */
export function createProjectGutenbergPublicDomainSearch(
  fetcher:FetchLike=fetch,
  options:{gutendexBaseUrl?:string;mirrorBaseUrl?:string}={},
):LearningConnectorSearch{return async(query,limit)=>{
  const bounded=Math.min(Math.max(limit,1),5)
  const gutendexBaseUrl=normalizedHttpsBase(options.gutendexBaseUrl,DEFAULT_GUTENDEX_BASE_URL)
  const mirrorBaseUrl=normalizedProjectGutenbergTextBase(options.mirrorBaseUrl)
  const results:LearningConnectorResult[]=[]
  const seenIds=new Set<number>()
  let candidatesConsidered=0
  const discoveryRoutes:ReadonlyArray<Readonly<{
    route:string
    load:()=>Promise<ProjectGutenbergCandidate[]>
  }>>=[
    {route:'opds',load:()=>projectGutenbergCandidatesFromOpds(query,bounded,fetcher)},
    {route:'open_library',load:()=>projectGutenbergCandidatesFromOpenLibrary(query,bounded,fetcher).catch(error=>{
      console.warn('[project-gutenberg] Open Library discovery fallback unavailable',error instanceof Error?error.message:String(error))
      return[]
    })},
    {route:'gutendex',load:()=>projectGutenbergCandidatesFromGutendex(query,bounded,gutendexBaseUrl,fetcher)},
    {route:'bootstrap',load:async()=>projectGutenbergBootstrapCandidates(query,bounded)},
  ]

  // Discovery success is not acquisition success. A catalog route can return real ebooks that are
  // unavailable on the mirror or fail the ebook-specific rights check. Keep cascading through the
  // bounded discovery routes until an admissible full-text result is actually obtained.
  for(const discovery of discoveryRoutes){
    if(results.length>=bounded)break
    const rows=await discovery.load()
    const freshRows=rows.filter(item=>{
      const id=Number(item.id)
      if(!Number.isInteger(id)||id<=0||seenIds.has(id))return false
      seenIds.add(id)
      return true
    })
    console.info('[project-gutenberg] discovery',{
      route:discovery.route,
      query:compactQuery(query,8),
      candidates:freshRows.length,
      acceptedSoFar:results.length,
    })
    for(const item of freshRows){
      if(results.length>=bounded)break
      candidatesConsidered++
      const id=Number(item.id)
      let raw=''
      let textUrl=''
      let lastFetchError=''
      for(const candidateUrl of projectGutenbergMirrorTextUrls(id,mirrorBaseUrl)){
        try{
          raw=await getText(candidateUrl,fetcher)
          textUrl=candidateUrl
          if(raw)break
        }catch(error){lastFetchError=error instanceof Error?error.message:String(error)}
      }
      if(!raw){
        console.warn('[project-gutenberg] mirror text unavailable',{id,route:discovery.route,mirrorBaseUrl,error:lastFetchError||'empty'})
        continue
      }
      const rightsEvidence=projectGutenbergUsRightsEvidence(raw,item.discoveryEvidence)
      if(!rightsEvidence){
        console.warn('[project-gutenberg] ebook rights evidence not eligible',{id,route:discovery.route})
        continue
      }
      const body=projectGutenbergBody(raw)
      if(body.length<900){
        console.warn('[project-gutenberg] ebook text too short after wrapper removal',{id,route:discovery.route,length:body.length})
        continue
      }
      results.push({
        uri:`https://www.gutenberg.org/ebooks/${id}`,
        title:item.title,
        text:clean(`${item.title}. ${item.authors.join(', ')}. ${body}`).slice(0,60000),
        license:'public domain',
        evidence:[
          `project_gutenberg_ebook_id:${id}`,
          ...item.discoveryEvidence,
          `acquisition_route:${discovery.route}`,
          ...rightsEvidence,
          'rights_scope:public_domain_in_usa',
          `project_gutenberg_mirror_text:${textUrl}`,
        ],
      })
    }
  }
  console.info('[project-gutenberg] acquisition',{query:compactQuery(query,8),candidatesConsidered,acceptedResults:results.length,mirrorBaseUrl})
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
function trainingSafeEuropePmcLicense(value:unknown):string|null{
  const raw=clean(value)
  const normalized=raw.toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()
  if(!normalized)return null
  if(normalized==='public domain'||normalized==='public domain mark')return'public domain'
  if(normalized==='cc0'||normalized==='cc0 1.0'||normalized==='creative commons cc0'||normalized==='creative commons zero')return raw.toLowerCase().startsWith('cc0')?`cc0 ${raw.slice(3).trim()}`.trim():'cc0'
  return null
}

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
        if(full.length>=900){
          const trainingLicense=trainingSafeEuropePmcLicense(item.license)
          return{
            uri,
            title,
            text:full,
            license:trainingLicense||'Europe PMC Open Access full text read for grounded learning; COS retains only facts, summary, and provenance',
            evidence:[
              `europe_pmc_open_access:${String(item.isOpenAccess??'').toUpperCase()==='Y'}`,
              ...(clean(item.license)?[`europe_pmc_license:${clean(item.license)}`]:[]),
              ...(trainingLicense?['training_rights:explicit_cc0_or_public_domain']:[]),
            ],
          }
        }
      }catch{/* fall back to abstract/metadata without aborting the source */}
    }
    return{uri,title,text:metadata,license:abstract.length>=300?'Europe PMC abstract metadata':'metadata only'}
  }))
  return results.filter((x:LearningConnectorResult)=>Boolean(x.uri&&x.text))
}}
export const europePmcScientificSearch=createEuropePmcScientificSearch()
