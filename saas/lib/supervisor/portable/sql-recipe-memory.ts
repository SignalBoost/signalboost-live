import type { CosConnectorRecipe } from '../../ai/cos/connectorDelegation.ts'
import type { PortableRecipeMemoryPort } from './host-context.ts'

export interface RecipeMemorySqlClient {
  queryOne<T = unknown>(sql: string, params: readonly unknown[]): Promise<T | undefined>
  execute(sql: string, params: readonly unknown[]): Promise<void>
}

export interface SqlRecipeMemoryOptions {
  sql: RecipeMemorySqlClient
  tableName?: string
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

export class SqlRecipeMemory implements PortableRecipeMemoryPort {
  private readonly sql: RecipeMemorySqlClient
  private readonly table: string

  constructor(options: SqlRecipeMemoryOptions) {
    if (!options.sql) throw new Error('SqlRecipeMemory requires a SQL client')
    const table = options.tableName ?? 'supervisor_recipe_memory'
    if (!IDENT.test(table)) throw new Error(`Invalid recipe memory table name: ${table}`)
    this.sql = options.sql
    this.table = table
  }

  async get(key: string): Promise<CosConnectorRecipe | undefined> {
    const row = await this.sql.queryOne<{ recipe_json?: unknown }>(
      'SELECT recipe_json FROM ' + this.table + ' WHERE recipe_key = $1',
      [key],
    )
    if (!row?.recipe_json) return undefined
    const raw = typeof row.recipe_json === 'string' ? JSON.parse(row.recipe_json) : row.recipe_json
    return raw as CosConnectorRecipe
  }

  async set(key: string, recipe: CosConnectorRecipe): Promise<void> {
    const payload = JSON.stringify(recipe)
    await this.sql.execute(
      'INSERT INTO ' + this.table + ' (recipe_key, recipe_json, updated_at) VALUES ($1, $2, $3) ' +
      'ON CONFLICT (recipe_key) DO UPDATE SET recipe_json = EXCLUDED.recipe_json, updated_at = EXCLUDED.updated_at',
      [key, payload, new Date().toISOString()],
    )
  }
}

export function createSqlRecipeMemory(options: SqlRecipeMemoryOptions): PortableRecipeMemoryPort {
  return new SqlRecipeMemory(options)
}
