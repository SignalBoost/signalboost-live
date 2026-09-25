// saas/lib/ai/cos/learningContinuityPagination.ts
//
// Pure PostgREST pagination helper for learning continuity. Kept dependency-free so the Production
// reader and the mandatory standalone Node regression execute the exact same paging behavior.

export type ContinuityRetentionRow = {
  created_at?: string | null
  subject?: string | null
  source_kind?: string | null
}

export const CONTINUITY_CORPUS_PAGE_SIZE = 1000
export const CONTINUITY_CORPUS_MAX_PAGES = 250

export type ContinuityCorpusRead =
  | { ok: true; rows: ContinuityRetentionRow[] }
  | { ok: false; error: string }

export async function readLearningContinuityCorpus(
  db:any,
  effectiveCorpusFilter:string,
): Promise<ContinuityCorpusRead> {
  const rows:ContinuityRetentionRow[]=[]
  for(let page=0;page<CONTINUITY_CORPUS_MAX_PAGES;page+=1){
    const from=page*CONTINUITY_CORPUS_PAGE_SIZE
    const to=from+CONTINUITY_CORPUS_PAGE_SIZE-1
    const result=await db
      .from('cos_continuous_learning')
      .select('created_at,subject,source_kind')
      .or(effectiveCorpusFilter)
      .order('created_at',{ascending:false})
      .range(from,to)
    if(result.error){
      return {ok:false,error:`cos_continuous_learning read failed: ${result.error.message}`}
    }
    const data=(result.data??[]) as ContinuityRetentionRow[]
    rows.push(...data)
    if(data.length<CONTINUITY_CORPUS_PAGE_SIZE)return {ok:true,rows}
  }
  return {
    ok:false,
    error:`cos_continuous_learning read exceeded bounded paging ceiling of ${CONTINUITY_CORPUS_PAGE_SIZE*CONTINUITY_CORPUS_MAX_PAGES} rows; refusing to classify a truncated corpus.`,
  }
}
