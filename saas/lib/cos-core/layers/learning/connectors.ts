import type { KnowledgeGap } from './index.ts'
import type { ContinuousLearningSourceAdapter, LearningSourceDocument } from './cycle.ts'

export type LearningConnectorResult={uri:string;title?:string;text:string;observedAt?:string;license?:string}
export type LearningConnectorSearch=(query:string,limit:number)=>Promise<LearningConnectorResult[]>
type LearningQueryBuilder=(gap:KnowledgeGap)=>string
const defaultLearningQuery:LearningQueryBuilder=(gap)=>[gap.subject,gap.question].filter(Boolean).join(' ').trim()

export class SearchLearningConnector implements ContinuousLearningSourceAdapter{
  constructor(readonly kind:LearningSourceDocument['sourceKind'],private readonly search:LearningConnectorSearch,private readonly maxResults=5,readonly id?:string,private readonly queryForGap:LearningQueryBuilder=defaultLearningQuery){}
  async acquire(gap:KnowledgeGap):Promise<LearningSourceDocument[]>{const query=this.queryForGap(gap).trim();if(!query)return[];const results=await this.search(query,this.maxResults);return results.filter(result=>Boolean(result.uri&&result.text.trim())).slice(0,this.maxResults).map(result=>({sourceKind:this.kind,sourceUri:result.uri,sourceTitle:result.title,observedAt:result.observedAt??new Date().toISOString(),subject:gap.subject,text:result.text,license:result.license}))}
}

// YouTube search.list now has a small dedicated daily quota bucket. Searching once per curriculum
// question wastes that bucket and repeatedly discovers nearly identical videos. Search by the gap's
// subject/domain instead; the cycle still scores every returned transcript against the full question
// before admission, so relevance gating remains question-specific while discovery is shared.
export const youtubeLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='youtube')=>new SearchLearningConnector('video_transcript',search,maxResults,id,(gap)=>gap.subject||gap.question)
export const libraryLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='open_library')=>new SearchLearningConnector('library_material',search,maxResults,id)
export const scientificLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='scientific')=>new SearchLearningConnector('scientific_journal',search,maxResults,id)
export const newsLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='news')=>new SearchLearningConnector('news_article',search,maxResults,id)
export const officialDocsLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='official_docs')=>new SearchLearningConnector('official_documentation',search,maxResults,id)
export const datasetLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='dataset')=>new SearchLearningConnector('public_dataset',search,maxResults,id)
// General current facts (people, organisations, entities, status). Queries by SUBJECT rather than
// subject+question: an encyclopaedia is looked up by entity name, and appending a full question
// buries the entity among stop-words and returns nothing. The cycle still scores every returned
// article against the full question before admission, so relevance gating stays question-specific.
export const referenceLearningConnector=(search:LearningConnectorSearch,maxResults=3,id='reference')=>new SearchLearningConnector('approved_public_web',search,maxResults,id,(gap)=>gap.subject||gap.question)
