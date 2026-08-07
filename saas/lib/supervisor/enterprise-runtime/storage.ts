import type { AuditEvent } from '../execution-contracts.ts'
import type { QuorumState, QuorumStateStore } from '../kernel/quorum-approval.ts'
import { canonicalJson } from '../kernel/canonical-json.ts'
import * as crypto from 'crypto'

export interface SqlResult<Row = Record<string, unknown>> { rows: Row[] }
export interface SqlClient {
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlResult<Row>>
}

export const supervisorEnterpriseSchemaSql = `
CREATE TABLE IF NOT EXISTS supervisor_audit_events (
  sequence_id BIGSERIAL PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  incident_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  schema_version TEXT NOT NULL,
  leaf_hash CHAR(64) NOT NULL,
  merkle_root_at_append CHAR(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS supervisor_audit_incident_idx ON supervisor_audit_events(incident_id, sequence_id);

CREATE TABLE IF NOT EXISTS supervisor_merkle_frontier (
  level INTEGER PRIMARY KEY,
  node_hash CHAR(64) NOT NULL,
  leaf_count BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supervisor_quorum_requests (
  request_id TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export class PostgresQuorumStateStore implements QuorumStateStore {
  constructor(private readonly db: SqlClient) {}

  async get(requestId: string): Promise<QuorumState | undefined> {
    const result = await this.db.query<{ state: QuorumState }>(
      'SELECT state FROM supervisor_quorum_requests WHERE request_id = $1 AND expires_at >= CURRENT_TIMESTAMP',
      [requestId],
    )
    return result.rows[0]?.state
  }

  async put(state: QuorumState): Promise<void> {
    await this.db.query(
      `INSERT INTO supervisor_quorum_requests(request_id, state, expires_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (request_id) DO UPDATE SET state = EXCLUDED.state, expires_at = EXCLUDED.expires_at, updated_at = CURRENT_TIMESTAMP`,
      [state.request.requestId, JSON.stringify(state), state.request.expiresAt],
    )
  }

  async delete(requestId: string): Promise<void> {
    await this.db.query('DELETE FROM supervisor_quorum_requests WHERE request_id = $1', [requestId])
  }
}

export interface PersistentMerkleAppendResult { leafHash: string; merkleRoot: string; leafIndex: number }

/** Incremental Merkle accumulator. Each append touches O(log n) frontier rows instead of replaying all leaves. */
export class PostgresMerkleAuditStore {
  constructor(private readonly db: SqlClient) {}

  async append(event: Readonly<AuditEvent>): Promise<PersistentMerkleAppendResult> {
    await this.db.query('BEGIN')
    try {
      const countResult = await this.db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM supervisor_audit_events')
      const leafIndex = Number(countResult.rows[0]?.count ?? '0')
      const leafHash = hash(canonicalJson(event))
      let carry = leafHash
      let level = 0
      let position = leafIndex

      while (position % 2 === 1) {
        const frontier = await this.db.query<{ node_hash: string }>('SELECT node_hash FROM supervisor_merkle_frontier WHERE level = $1 FOR UPDATE', [level])
        const left = frontier.rows[0]?.node_hash
        if (!left) throw new Error(`Merkle frontier missing level ${level}`)
        carry = hash(left + carry)
        await this.db.query('DELETE FROM supervisor_merkle_frontier WHERE level = $1', [level])
        position = Math.floor(position / 2)
        level += 1
      }

      await this.db.query(
        `INSERT INTO supervisor_merkle_frontier(level, node_hash, leaf_count)
         VALUES ($1, $2, $3)
         ON CONFLICT (level) DO UPDATE SET node_hash = EXCLUDED.node_hash, leaf_count = EXCLUDED.leaf_count, updated_at = CURRENT_TIMESTAMP`,
        [level, carry, leafIndex + 1],
      )

      const frontierRows = await this.db.query<{ level: number; node_hash: string }>('SELECT level, node_hash FROM supervisor_merkle_frontier ORDER BY level DESC')
      let root = ''
      for (const node of frontierRows.rows) root = root ? hash(node.node_hash + root) : node.node_hash
      if (!root) root = hash('EMPTY_SUPERVISOR_AUDIT_LEDGER')

      await this.db.query(
        `INSERT INTO supervisor_audit_events(event_id, incident_id, event_type, occurred_at, payload, schema_version, leaf_hash, merkle_root_at_append)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
        [event.eventId, event.incidentId, event.eventType, event.occurredAt, JSON.stringify(event.payload), event.schemaVersion, leafHash, root],
      )
      await this.db.query('COMMIT')
      return { leafHash, merkleRoot: root, leafIndex }
    } catch (error) {
      await this.db.query('ROLLBACK')
      throw error
    }
  }
}

export interface DistributedLock {
  release(): Promise<void>
}

export interface RedisLikeClient {
  set(key: string, value: string, options: { NX: true; PX: number }): Promise<string | null>
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>
}

export class RedisCircuitBreakerLock {
  constructor(private readonly redis: RedisLikeClient, private readonly prefix = 'supervisor:lock') {}

  async acquire(resource: string, ttlMs: number): Promise<DistributedLock | undefined> {
    const token = crypto.randomBytes(16).toString('hex')
    const key = `${this.prefix}:${resource}`
    const acquired = await this.redis.set(key, token, { NX: true, PX: ttlMs })
    if (!acquired) return undefined
    return {
      release: async () => {
        await this.redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          { keys: [key], arguments: [token] },
        )
      },
    }
  }
}
