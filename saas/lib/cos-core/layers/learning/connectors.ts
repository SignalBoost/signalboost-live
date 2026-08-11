import type { KnowledgeGap } from './index'
import type { ContinuousLearningSourceAdapter, LearningSourceDocument } from './cycle'

export type LearningConnectorResult={uri:string;title?:string;text:string;observedAt?:string;license?:string}
export type LearningConnectorSearch=(query:string,limit:number)=>Promise<LearningConnectorResult[]>

export class SearchLearningConnector implements ContinuousLearningSourceAdapter{
  constructor(readonly kind:LearningSourceDocument['sourceKind'],private readonly search:LearningConnectorSearch,private readonly maxResults=5,readonly id?:string){}
  async acquire(gap:KnowledgeGap):Promise<LearningSourceDocument[]>{const query=[gap.subject,gap.question].filter(Boolean).join(' ').trim();if(!query)return[];const results=await this.search(query,this.maxResults);return results.filter(result=>Boolean(result.uri&&result.text.trim())).slice(0,this.maxResults).map(result=>({sourceKind:this.kind,sourceUri:result.uri,sourceTitle:result.title,observedAt:result.observedAt??new Date().toISOString(),subject:gap.subject,text:result.text,license:result.license}))}
}
export const youtubeLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='youtube')=>new SearchLearningConnector('video_transcript',search,maxResults,id)
export const libraryLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='open_library')=>new SearchLearningConnector('library_material',search,maxResults,id)
export const scientificLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='scientific')=>new SearchLearningConnector('scientific_journal',search,maxResults,id)
export const newsLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='news')=>new SearchLearningConnector('news_article',search,maxResults,id)
export const officialDocsLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='official_docs')=>new SearchLearningConnector('official_documentation',search,maxResults,id)
export const datasetLearningConnector=(search:LearningConnectorSearch,maxResults=5,id='dataset')=>new SearchLearningConnector('public_dataset',search,maxResults,id)
