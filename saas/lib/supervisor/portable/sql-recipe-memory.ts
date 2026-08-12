import type { CosConnectorRecipe } from '../../ai/cos/connectorDelegation.ts'
import type { PortableRecipeMemoryPort } from './host-context.ts'

export interface RecipeMemorySqlClient {
  queryOne<T = unknown>(sql: string, params: readonly unknown[]): Promise<T | undefined>
  execute(sql: string, params: readonly unknown[]): Promise<void>
}

export interface SqlRecipeMemoryOptions {
  sql: RecipeMemorySqlClient
  tableName?: string
  /** Expire learned recipes after this age. Defaults to 24 hours; <=0 disables expiry. */
  maxAgeMs?: number
  now?: () => number
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

export class SqlRecipeMemory implements PortableRecipeMemoryPort {
  private readonly sql: RecipeMemorySqlClient
  private readonly table: string
  private readonly maxAgeMs: number
  private readonly now: () => number

  constructor(options: SqlRecipeMemoryOptions) {
    if (!options.sql) throw new Error('SqlRecipeMemory requires a SQL client')
    const table = options.tableName ?? 'supervisor_recipe_memory'
    if (!IDENT.test(table)) throw new Error(`Invalid recipe memory table name: ${table}`)
    this.sql = options.sql
    this.table = table
    this.maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000
    this.now = options.now ?? Date.now
  }

  async get(key: string): Promise<CosConnectorRecipe | undefined> {
    const row = await this.sql.queryOne<{ recipe_json?: unknown; updated_at?: unknown }>(
      'SELECT recipe_json, updated_at FROM ' + this.table + ' WHERE recipe_key = $1',
      [key],
    )
    if (!row?.recipe_json) return undefined
    if (this.maxAgeMs > 0 && row.updated_at) {
      const updated = Date.parse(String(row.updated_at))
      if (Number.isFinite(updated) && this.now() - updated > this.maxAgeMs) return undefined
    }
    const raw = typeof row.recipe_json === 'string' ? JSON.parse(row.recipe_json) : row.recipe_json
    return raw as CosConnectorRecipe
  }

  async set(key: string, recipe: CosConnectorRecipe): Promise<void> {
    const payload = JSON.stringify(recipe)
    await this.sql.execute(
      'INSERT INTO ' + this.table + ' (recipe_key, recipe_json, updated_at) VALUES ($1, $2, $3) ' +
      'ON CONFLICT (recipe_key) DO UPDATE SET recipe_json = EXCLUDED.recipe_json, updated_at = EXCLUDED.updated_at',
      [key, payload, new Date(this.now()).toISOString()],
    )
  }
}

export function createSqlRecipeMemory(options: SqlRecipeMemoryOptions): PortableRecipeMemoryPort {
  return new SqlRecipeMemory(options)
}
