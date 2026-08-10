import type { KnowledgeGap } from './index'
import type { ContinuousLearningSourceAdapter, LearningSourceDocument } from './cycle'

export type SourceAcquisitionReport = {
  documents: LearningSourceDocument[]
  attemptedSources: number
  successfulSources: number
  failedSources: number
  failures: Array<{ sourceKind: string; message: string }>
}

/**
 * Runs approved learning sources independently so one unavailable external feed cannot
 * prevent COS from learning from the others. The learning director remains responsible
 * for admission, deduplication, confidence and persistence after acquisition.
 */
export async function acquireAcrossSources(
  gap: KnowledgeGap,
  sources: ContinuousLearningSourceAdapter[],
  maxDocuments = 20,
): Promise<SourceAcquisitionReport> {
  const settled = await Promise.allSettled(sources.map(async (source) => ({
    sourceKind: source.kind,
    documents: await source.acquire(gap),
  })))

  const documents: LearningSourceDocument[] = []
  const failures: Array<{ sourceKind: string; message: string }> = []
  let successfulSources = 0

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulSources += 1
      documents.push(...result.value.documents)
      return
    }
    failures.push({
      sourceKind: sources[index]?.kind ?? 'unknown',
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
    })
  })

  const unique = new Map<string, LearningSourceDocument>()
  for (const document of documents) {
    const key = `${document.sourceKind}:${document.sourceUri}`
    if (!unique.has(key)) unique.set(key, document)
    if (unique.size >= Math.max(1, maxDocuments)) break
  }

  return {
    documents: [...unique.values()],
    attemptedSources: sources.length,
    successfulSources,
    failedSources: failures.length,
    failures,
  }
}
