// saas/lib/ai/cos/cosUniversityReadOnlyDb.ts
//
// A database handle that can only read. Owner, 2026-10-06: the outside evidence readers (line observation, Step 1
// evidence report) must observe the University without moving it. "Read only" is enforced here, not promised in a
// comment: any write or RPC attempted through this handle throws before it reaches the database.
//
// The wrapped store is PostgREST-shaped (`db.from(table)` returning a query builder). Writes on that builder are
// `insert`, `update`, `upsert` and `delete`; `rpc` can execute arbitrary server functions, so it is not exposed.

export const READ_ONLY_FORBIDDEN_METHODS: readonly string[] = Object.freeze(['insert', 'update', 'upsert', 'delete'])

export class ReadOnlyDbViolation extends Error {
  readonly table: string
  readonly method: string
  constructor(table: string, method: string) {
    super(`read_only_db_violation: ${method} on ${table} refused`)
    this.name = 'ReadOnlyDbViolation'
    this.table = table
    this.method = method
  }
}

type FromDb = { from: (table: string) => any }

/**
 * Wrap a PostgREST-shaped store so it can only read. Only `from()` is exposed; write methods throw.
 *
 * Query builders return themselves (or a new builder) from every chained call, so the guard has to follow the chain:
 * any object a builder method returns is wrapped again, otherwise `from(t).select().update(...)` would escape. A real
 * Promise (what `then` produces) is returned as is, so awaiting a query still resolves to plain data.
 */
export function readOnlyDb(db: FromDb): FromDb {
  const forbidden = new Set(READ_ONLY_FORBIDDEN_METHODS)
  const guard = (table: string, builder: any): any => new Proxy(builder, {
    get(target, property, receiver) {
      if (typeof property === 'string' && forbidden.has(property)) {
        return () => { throw new ReadOnlyDbViolation(table, property) }
      }
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const result = value.apply(target, args)
        return result !== null && typeof result === 'object' && !(result instanceof Promise) ? guard(table, result) : result
      }
    },
  })
  return Object.freeze({
    from(table: string) {
      return guard(table, db.from(table))
    },
  })
}
// end of saas/lib/ai/cos/cosUniversityReadOnlyDb.ts (if this line is missing, the paste was cut short)
