import type { CosRecipeConfidenceRecord } from '../../ai/cos/recipeConfidence.ts'
import type { PortableRecipeConfidencePort } from './host-context.ts'
import type { RecipeMemorySqlClient } from './sql-recipe-memory.ts'

export interface SqlRecipeConfidenceOptions {
  sql: RecipeMemorySqlClient
  tableName?: string
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

export class SqlRecipeConfidenceMemory implements PortableRecipeConfidencePort {
  private readonly sql: RecipeMemorySqlClient
  private readonly table: string

  constructor(options: SqlRecipeConfidenceOptions) {
    if (!options.sql) throw new Error('SqlRecipeConfidenceMemory requires a SQL client')
    const table = options.tableName ?? 'supervisor_recipe_confidence'
    if (!IDENT.test(table)) throw new Error(`Invalid recipe confidence table name: ${table}`)
    this.sql = options.sql
    this.table = table
  }

  async get(key: string): Promise<CosRecipeConfidenceRecord | undefined> {
    const row = await this.sql.queryOne<{ record_json?: unknown }>(
      'SELECT record_json FROM ' + this.table + ' WHERE recipe_key = $1', [key],
    )
    if (!row?.record_json) return undefined
    return (typeof row.record_json === 'string' ? JSON.parse(row.record_json) : row.record_json) as CosRecipeConfidenceRecord
  }

  async set(key: string, record: CosRecipeConfidenceRecord): Promise<void> {
    await this.sql.execute(
      'INSERT INTO ' + this.table + ' (recipe_key, record_json, updated_at) VALUES ($1, $2, $3) ' +
      'ON CONFLICT (recipe_key) DO UPDATE SET record_json = EXCLUDED.record_json, updated_at = EXCLUDED.updated_at',
      [key, JSON.stringify(record), new Date(record.updatedAt).toISOString()],
    )
  }
}

export function createSqlRecipeConfidenceMemory(options: SqlRecipeConfidenceOptions): PortableRecipeConfidencePort {
  return new SqlRecipeConfidenceMemory(options)
}
