import type { CachedResponse, KnowledgeRecord, KnowledgeStore } from './types'

export type KnowledgeFact = {
  id: string
  taskId: string
  subject: string
  predicate: string
  object: string
  confidence: number
  source: string
  updatedAt: Date
}

export interface PersistentKnowledgeStore extends KnowledgeStore {
  getFact(taskId: string, subject: string, predicate: string): Promise<KnowledgeFact | null>
  upsertFact(fact: KnowledgeFact): Promise<void>
  findFacts(taskId: string, subjects: string[]): Promise<KnowledgeFact[]>
}

export interface SemanticKnowledgeStore extends PersistentKnowledgeStore {
  queryNearest(vector: number[], options: { taskId: string }): Promise<CachedResponse | null>
  save(record: KnowledgeRecord): Promise<void>
}

/**
 * Provider-neutral graph facade. Postgres, pgvector, Neo4j, or another store
 * can implement this without changing Portables or provider adapters.
 */
export class KnowledgeGraph {
  constructor(private readonly store: PersistentKnowledgeStore) {}

  async remember(fact: KnowledgeFact) {
    await this.store.upsertFact(fact)
  }

  async recall(taskId: string, subjects: string[]) {
    return this.store.findFacts(taskId, subjects)
  }
}
