// saas/lib/supervisor/portable/enterprise-dispatch-store.ts
//
// A database-neutral durable dispatch ledger for the Self-Healing portable, for
// buyers who run their own SQL database (Postgres, and any ANSI-SQL store that
// enforces primary-key uniqueness). It implements the same DispatchStore contract
// as the platform's store but depends only on a tiny SqlExecutor interface the buyer
// wires to their driver — no Supabase, no host client, no process.env.
//
// The at-most-once guarantee rests on a UNIQUE/PRIMARY KEY on dispatch_id: a
// duplicate-key error means another dispatcher already claimed this exact dispatch,
// so execution must not begin (claim returns false). Any other error is surfaced.
//
// The buyer is responsible for creating the ledger table once (DDL provided in the
// portable's integration guide); this store only inserts claims.

import type { DispatchClaim, DispatchStore } from '../executors/dispatch-store.ts'

// The minimal SQL surface the store needs. A buyer implements this against their
// driver (node-postgres, Prisma's $executeRaw, an RDS Data API call, etc.). It must
// throw an error whose shape lets isUniqueViolation recognize a duplicate key.
export interface SqlExecutor {
  // Parameterized insert. `params` bind to $1..$n placeholders in order.
  execute(sql: string, params: readonly unknown[]): Promise<void>
}

export interface EnterpriseDispatchStoreOptions {
  sql: SqlExecutor
  /** Table name, defaulting to a neutral name the buyer can override to fit their schema. */
  tableName?: string
  /** Lets the buyer teach the store how their driver signals a unique-constraint violation. */
  isUniqueViolation?: (error: unknown) => boolean
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

function defaultIsUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null
  const code = String(e?.code ?? '')
  const message = String(e?.message ?? '').toLowerCase()
  // 23505 is the ANSI/Postgres unique_violation SQLSTATE; the text checks cover
  // drivers that surface a message instead of a SQLSTATE.
  return code === '23505' || message.includes('duplicate') || message.includes('unique')
}

export class EnterpriseDispatchStore implements DispatchStore {
  private readonly sql: SqlExecutor
  private readonly table: string
  private readonly isUnique: (error: unknown) => boolean

  constructor(options: EnterpriseDispatchStoreOptions) {
    if (!options.sql) throw new Error('EnterpriseDispatchStore requires a SqlExecutor')
    const table = options.tableName ?? 'supervisor_dispatch_ledger'
    // Guard against injection via a bad table name: identifiers are validated, never
    // parameterized (SQL cannot bind an identifier). Values below are always bound.
    if (!IDENT.test(table)) throw new Error(`Invalid ledger table name: ${table}`)
    this.sql = options.sql
    this.table = table
    this.isUnique = options.isUniqueViolation ?? defaultIsUniqueViolation
  }

  async claim(input: DispatchClaim): Promise<boolean> {
    const sql =
      'INSERT INTO ' + this.table +
      ' (dispatch_id, incident_id, executor_kind, work_item_id, execution_id, claimed_at, status, schema_version)' +
      ' VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
    const params = [
      input.dispatchId,
      input.incidentId,
      input.executorKind,
      input.workItemId ?? null,
      input.executionId ?? null,
      input.claimedAt,
      'claimed',
      'supervisor-dispatch-ledger-v1',
    ]
    try {
      await this.sql.execute(sql, params)
      return true
    } catch (error) {
      if (this.isUnique(error)) return false
      throw new Error('dispatch_claim_failed')
    }
  }
}

export function createEnterpriseDispatchStore(options: EnterpriseDispatchStoreOptions): DispatchStore {
  return new EnterpriseDispatchStore(options)
}
