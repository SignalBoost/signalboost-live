// saas/lib/cos-core/layers/learning/liveSources.ts
import type { ContinuousLearningSourceAdapter } from './cycle.ts'
import { DEFAULT_LEARNING_SOURCE_CAPS, learningSourceCap } from './learningSourceCaps.ts'
import { libraryLearningConnector,newsLearningConnector,officialDocsLearningConnector,referenceLearningConnector,scientificLearningConnector,SearchLearningConnector,youtubeLearningConnector } from './connectors.ts'
import { createWikipediaSearch } from './referenceClients.ts'
import { crossrefScientificSearch,europePmcScientificSearch,openAlexScientificSearch,openLibrarySearch } from './publicClients.ts'
import { createGdeltNewsSearch,createYouTubeMetadataSearch,createYouTubeTranscriptSearch } from './mediaClients.ts'
import { BUILTIN_OFFICIAL_TECH_FEEDS,createFeedSearch,parseFeedList } from './feedClients.ts'
import { createWebTrainingResearchSearch,webTrainingMinimumCredibility } from './webTrainingDataLayer.ts'

export type LiveLearningEnvironment={ [key:string]:string|undefined;COS_LIVE_SOURCES_ENABLED?:string;COS_TECH_RSS_FEEDS?:string;COS_OFFICIAL_DOC_FEEDS?:string;COS_WEB_TRAINING_ENABLED?:string;COS_WEB_TRAINING_USE_BRAVE?:string;COS_WEB_TRAINING_MIN_CREDIBILITY?:string;BRAVE_SEARCH_API_KEY?:string;YOUTUBE_API_KEY?:string;YOUTUBE_TRANSCRIPT_API_URL?:string;YOUTUBE_TRANSCRIPT_API_TOKEN?:string;YOUTUBE_TRANSCRIPT_LANGUAGES?:string;COS_LEARNING_SOURCE_FAILURE_LIMIT?:string;COS_LEARNING_SOURCE_MIN_INTERVAL_MS?:string;LOCAL_AI_BASE_URL?:string;LOCAL_AI_API_KEY?:string }
// THIS IS WHY THE CORPUS BARELY GREW. Every live adapter was wrapped so that it returns NOTHING for
// a 'daily-mining-' gap — live sources only ever served real queued knowledge gaps. Combined with an
// empty gap queue (33 of 33 resolved on 2026-08-21), that meant the daily cycle acquired nothing at
// all, and COS stayed frozen at its training cutoff: it told users that George Foreman and Hulk
// Hogan were alive, months after both had died.
//
// The gate itself is sound for EXPENSIVE or NARROW sources — running Crossref, OpenAlex, and Europe
// PMC against every daily-mining subject burns quota and returns academic papers for questions that
// are not academic. YouTube is different: it is rate-limited, serialised, and circuit-broken below,
// but it must run on the daily pass when configured so its technical learning does not stop whenever
// the explicit gap queue is empty.
function externalGapOnly(adapter:ContinuousLearningSourceAdapter):ContinuousLearningSourceAdapter{return{kind:adapter.kind,id:adapter.id,async acquire(gap){if(gap.id.startsWith('daily-mining-'))return[];return adapter.acquire(gap)}}}
/** Sources that must also run on the daily pass: current facts, current news, and configured video learning. */
const DAILY_CURRENCY_SOURCES=new Set(['reference','gdelt','official_docs','tech_feeds','youtube_metadata','youtube_transcript','youtube_transcript_runpod'])
export function runsOnDailyLearningPass(adapterId:string|undefined,kind?:string):boolean{return DAILY_CURRENCY_SOURCES.has(adapterId??kind??'')}
function gapScopeFor(adapter:ContinuousLearningSourceAdapter):ContinuousLearningSourceAdapter{return runsOnDailyLearningPass(adapter.id,adapter.kind)?adapter:externalGapOnly(adapter)}
function failureLimit(env:LiveLearningEnvironment):number{const value=Number(env.COS_LEARNING_SOURCE_FAILURE_LIMIT||'3');return Number.isFinite(value)?Math.max(1,Math.min(10,Math.round(value))):3}
function delay(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
function sourceIntervalMs(adapter:ContinuousLearningSourceAdapter,env:LiveLearningEnvironment):number{
  const configured=Number(env.COS_LEARNING_SOURCE_MIN_INTERVAL_MS)
  if(String(env.COS_LEARNING_SOURCE_MIN_INTERVAL_MS??'').trim()&&Number.isFinite(configured))return Math.max(0,Math.min(5000,Math.round(configured)))
  const id=adapter.id??adapter.kind
  if(id.startsWith('youtube_')||id==='gdelt'||id==='credible_web')return 750
  if(id==='crossref')return 250
  return 0
}

/**
 * Keep each provider to one in-flight request stream. The learning cycle deliberately runs several
 * different sources concurrently, but allowing six workers to hit the SAME public API at once was
 * producing large 429 bursts before the old circuit breaker could observe enough failures to open.
 * Queued calls re-check the breaker after earlier calls complete, so once a source reaches the
 * bounded failure limit no already-queued work continues hammering it.
 */
export function guardLearningSourceAdapter(adapter:ContinuousLearningSourceAdapter,limit:number,minIntervalMs=0):ContinuousLearningSourceAdapter{
  let failures=0,open=false,lastStartedAt=0
  let tail:Promise<void>=Promise.resolve()
  const run=async(gap:Parameters<ContinuousLearningSourceAdapter['acquire']>[0])=>{
    if(open)return[]
    const wait=Math.max(0,minIntervalMs-(Date.now()-lastStartedAt))
    if(wait)await delay(wait)
    if(open)return[]
    lastStartedAt=Date.now()
    try{
      const documents=await adapter.acquire(gap)
      failures=0
      return documents
    }catch(error){
      failures+=1
      if(failures>=limit){open=true;console.warn('cosLearning: source circuit opened',{source:adapter.id??adapter.kind,failures,limit})}
      throw error
    }
  }
  return{kind:adapter.kind,id:adapter.id,acquire(gap){const current=tail.then(()=>run(gap),()=>run(gap));tail=current.then(()=>undefined,()=>undefined);return current}}
}
function transcriptLanguages(value?:string):string[]{const parsed=String(value||'en').split(',').map(item=>item.trim()).filter(Boolean);return parsed.length?parsed.slice(0,8):['en']}

/**
 * The RunPod transcript service runs privately beside the local reasoner and is exposed through
 * the same authenticated 11434 gateway at /transcript. Explicit transcript variables always win.
 * If they are absent, derive only from the exact HTTPS RunPod 11434 proxy already trusted for local
 * inference. This avoids a second public port and prevents collisions with RunPod/Jupyter services.
 */
export function resolveYouTubeTranscriptRuntime(env:LiveLearningEnvironment):{url:string;token?:string;derived:boolean}{
  const explicitUrl=String(env.YOUTUBE_TRANSCRIPT_API_URL||'').trim()
  const explicitToken=String(env.YOUTUBE_TRANSCRIPT_API_TOKEN||'').trim()
  if(explicitUrl)return{url:explicitUrl,token:explicitToken||String(env.LOCAL_AI_API_KEY||'').trim()||undefined,derived:false}

  const base=String(env.LOCAL_AI_BASE_URL||'').trim()
  if(!base)return{url:'',token:undefined,derived:false}
  try{
    const parsed=new URL(base)
    if(parsed.protocol!=='https:'||!/^([a-z0-9-]+)-11434\.proxy\.runpod\.net$/i.test(parsed.hostname))return{url:'',token:undefined,derived:false}
    parsed.port=''
    parsed.pathname='/transcript'
    parsed.search=''
    parsed.hash=''
    return{url:parsed.toString(),token:explicitToken||String(env.LOCAL_AI_API_KEY||'').trim()||undefined,derived:true}
  }catch{return{url:'',token:undefined,derived:false}}
}

/**
 * External learning sources are available by default whenever the autonomous-learning
 * cycle calls this factory. COS_LIVE_SOURCES_ENABLED=false remains an explicit emergency
 * kill switch, but a missing variable no longer silently disables every public source.
 *
 * The credible_web adapter is the Web Data Layer training lane. It performs provider-free public
 * discovery by default, reads only sources that pass a structural credibility threshold, records
 * source-quality provenance, and then hands the material to the normal learning admission gates.
 * Paid Brave discovery is opt-in only via COS_WEB_TRAINING_USE_BRAVE=true.
 */
export function createLiveLearningAdapters(env:LiveLearningEnvironment=process.env):ContinuousLearningSourceAdapter[]{
  if(env.COS_LIVE_SOURCES_ENABLED==='false')return[]
  const configuredTechFeeds=parseFeedList(env.COS_TECH_RSS_FEEDS);const configuredOfficialFeeds=parseFeedList(env.COS_OFFICIAL_DOC_FEEDS);const officialFeeds=[...BUILTIN_OFFICIAL_TECH_FEEDS,...configuredOfficialFeeds]
  // Per-adapter result caps. Measured over six production hours: official_docs alone produced 377
  // not-relevant rejections and open_library 58, while crossref, openalex and europe_pmc retrieved
  // six documents each — the sources that can return substantive, query-targeted text were the
  // smallest part of the pool while the feeds filled their quota every tick regardless of the query.
  // Rebalancing the caps changes only which candidates are offered; every admission gate is untouched.
  // europe_pmc stays lower than its peers because each of its results may trigger a full-text XML
  // fetch, so its cost per result is several times the others'.
  const cap={ crossref:learningSourceCap(env.COS_LEARNING_CAP_CROSSREF,DEFAULT_LEARNING_SOURCE_CAPS.crossref), openalex:learningSourceCap(env.COS_LEARNING_CAP_OPENALEX,DEFAULT_LEARNING_SOURCE_CAPS.openalex), europePmc:learningSourceCap(env.COS_LEARNING_CAP_EUROPE_PMC,DEFAULT_LEARNING_SOURCE_CAPS.europe_pmc), openLibrary:learningSourceCap(env.COS_LEARNING_CAP_OPEN_LIBRARY,DEFAULT_LEARNING_SOURCE_CAPS.open_library), gdelt:learningSourceCap(env.COS_LEARNING_CAP_GDELT,DEFAULT_LEARNING_SOURCE_CAPS.gdelt), officialDocs:learningSourceCap(env.COS_LEARNING_CAP_OFFICIAL_DOCS,DEFAULT_LEARNING_SOURCE_CAPS.official_docs), reference:learningSourceCap(env.COS_LEARNING_CAP_REFERENCE,DEFAULT_LEARNING_SOURCE_CAPS.reference) }
  const adapters:ContinuousLearningSourceAdapter[]=[scientificLearningConnector(crossrefScientificSearch,cap.crossref,'crossref'),scientificLearningConnector(openAlexScientificSearch,cap.openalex,'openalex'),scientificLearningConnector(europePmcScientificSearch,cap.europePmc,'europe_pmc'),libraryLearningConnector(openLibrarySearch,cap.openLibrary,'open_library'),newsLearningConnector(createGdeltNewsSearch(),cap.gdelt,'gdelt'),officialDocsLearningConnector(createFeedSearch(officialFeeds,fetch,{fullText:true}),cap.officialDocs,'official_docs'),referenceLearningConnector(createWikipediaSearch(),cap.reference,'reference')]

  if(env.COS_WEB_TRAINING_ENABLED!=='false'){
    adapters.push(new SearchLearningConnector('approved_public_web',createWebTrainingResearchSearch({
      minCredibility:webTrainingMinimumCredibility(env.COS_WEB_TRAINING_MIN_CREDIBILITY),
      braveApiKey:String(env.BRAVE_SEARCH_API_KEY||'').trim()||undefined,
      useBrave:env.COS_WEB_TRAINING_USE_BRAVE==='true',
    }),3,'credible_web'))
  }
  if(configuredTechFeeds.length)adapters.push(newsLearningConnector(createFeedSearch(configuredTechFeeds),3,'tech_feeds'))
  if(env.YOUTUBE_API_KEY){
    const transcript=resolveYouTubeTranscriptRuntime(env)
    if(transcript.url){
      adapters.push(youtubeLearningConnector(createYouTubeTranscriptSearch(env.YOUTUBE_API_KEY,{transcriptApiUrl:transcript.url,transcriptApiToken:transcript.token,languages:transcriptLanguages(env.YOUTUBE_TRANSCRIPT_LANGUAGES),metadataFallback:true}),2,transcript.derived?'youtube_transcript_runpod':'youtube_transcript'))
    }else{
      adapters.push(youtubeLearningConnector(createYouTubeMetadataSearch(env.YOUTUBE_API_KEY),2,'youtube_metadata'))
    }
  }
  const limit=failureLimit(env)
  return adapters.map(gapScopeFor).map(adapter=>guardLearningSourceAdapter(adapter,limit,sourceIntervalMs(adapter,env)))
}
