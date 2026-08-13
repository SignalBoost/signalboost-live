export interface CachedResponse {
  taskId: string
  originalPrompt: string
  responsePayload: unknown
  similarityScore: number
  contextText?: string | null
}

export type KnowledgeRecord = {
  taskId: string
  promptText: string
  contextText: string
  embeddingVector: number[]
  responseData: unknown
  createdAt: Date
}

export interface KnowledgeStore {
  queryExact?(options: { taskId: string; prompt: string }): Promise<CachedResponse | null>
  queryNearest(vector: number[], options: { taskId: string }): Promise<CachedResponse | null>
  save(record: KnowledgeRecord): Promise<void>
}

export type EmbeddingGenerator = (text: string) => Promise<number[]>
