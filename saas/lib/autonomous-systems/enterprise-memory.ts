import type { TenantContext } from './types.ts';

export const EAE_ENTERPRISE_MEMORY_SCHEMA_VERSION = '1.0.0' as const;

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type EnterpriseMemoryKind = 'context' | 'decision' | 'verification' | 'lesson' | 'objective_outcome';

export interface EnterpriseMemoryRecord {
  readonly schemaVersion: typeof EAE_ENTERPRISE_MEMORY_SCHEMA_VERSION;
  readonly memoryId: string;
  readonly tenant: TenantContext;
  readonly kind: EnterpriseMemoryKind;
  readonly subject: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly source: string;
  readonly evidenceRefs: readonly string[];
  readonly tags: readonly string[];
  readonly payload: Readonly<Record<string, Json>>;
}

export interface EnterpriseMemoryQuery {
  readonly tenant: TenantContext;
  readonly subject?: string;
  readonly kinds?: readonly EnterpriseMemoryKind[];
  readonly tags?: readonly string[];
  readonly occurredAfter?: string;
  readonly occurredBefore?: string;
  readonly limit: number;
}

export interface EnterpriseMemorySnapshot {
  readonly schemaVersion: typeof EAE_ENTERPRISE_MEMORY_SCHEMA_VERSION;
  readonly snapshotId: string;
  readonly tenant: TenantContext;
  readonly generatedAt: string;
  readonly records: readonly EnterpriseMemoryRecord[];
  readonly truncated: boolean;
}

export interface EnterpriseMemoryStore {
  append(record: EnterpriseMemoryRecord): Promise<void>;
  query(request: EnterpriseMemoryQuery): Promise<readonly EnterpriseMemoryRecord[]>;
}

const secretPattern = /(secret|token|password|credential|authorization|private.?key|api.?key)/i;

function tenantKey(tenant: TenantContext): string {
  return `${tenant.tenantId}:${tenant.environmentId}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('non_json_value_rejected');
  return encoded;
}

function fingerprint(value: unknown): string {
  let hash = 2166136261;
  for (const character of canonical(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return value;
}

function assertJsonSafe(value: unknown, path = 'payload'): asserts value is Json {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new Error(`${path}_executable_rejected`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path}_non_finite_number`);
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (secretPattern.test(key)) throw new Error(`${path}_secret_rejected`);
    assertJsonSafe(entry, `${path}.${key}`);
  }
}

function validateRecord(record: EnterpriseMemoryRecord): void {
  if (record.schemaVersion !== EAE_ENTERPRISE_MEMORY_SCHEMA_VERSION) throw new Error('unsupported_schema');
  if (!record.memoryId || !record.subject || !record.source) throw new Error('invalid_memory_record');
  if (!record.tenant.tenantId || !record.tenant.environmentId) throw new Error('tenant_required');
  if (!Number.isFinite(Date.parse(record.occurredAt)) || !Number.isFinite(Date.parse(record.recordedAt))) {
    throw new Error('invalid_timestamp');
  }
  assertJsonSafe(record.payload);
}

export class InMemoryEnterpriseMemoryStore implements EnterpriseMemoryStore {
  private readonly records = new Map<string, EnterpriseMemoryRecord>();

  async append(record: EnterpriseMemoryRecord): Promise<void> {
    validateRecord(record);
    if (this.records.has(record.memoryId)) throw new Error('duplicate_memory_id');
    this.records.set(record.memoryId, deepFreeze({ ...record }));
  }

  async query(request: EnterpriseMemoryQuery): Promise<readonly EnterpriseMemoryRecord[]> {
    if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 256) {
      throw new Error('unbounded_memory_query_rejected');
    }
    const after = request.occurredAfter ? Date.parse(request.occurredAfter) : Number.NEGATIVE_INFINITY;
    const before = request.occurredBefore ? Date.parse(request.occurredBefore) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(after) && after !== Number.NEGATIVE_INFINITY) throw new Error('invalid_timestamp');
    if (!Number.isFinite(before) && before !== Number.POSITIVE_INFINITY) throw new Error('invalid_timestamp');

    const kinds = new Set(request.kinds ?? []);
    const tags = new Set(request.tags ?? []);
    return deepFreeze([...this.records.values()]
      .filter((record) => tenantKey(record.tenant) === tenantKey(request.tenant))
      .filter((record) => !request.subject || record.subject === request.subject)
      .filter((record) => kinds.size === 0 || kinds.has(record.kind))
      .filter((record) => tags.size === 0 || [...tags].every((tag) => record.tags.includes(tag)))
      .filter((record) => {
        const occurredAt = Date.parse(record.occurredAt);
        return occurredAt >= after && occurredAt <= before;
      })
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || left.memoryId.localeCompare(right.memoryId))
      .slice(0, request.limit));
  }
}

export function createEnterpriseMemoryRecord(input: Omit<EnterpriseMemoryRecord, 'schemaVersion' | 'memoryId'>): EnterpriseMemoryRecord {
  const base = { ...input, schemaVersion: EAE_ENTERPRISE_MEMORY_SCHEMA_VERSION };
  validateRecord({ ...base, memoryId: 'pending' });
  return deepFreeze({ ...base, memoryId: `eae_memory_${fingerprint(base)}` });
}

export async function buildEnterpriseMemorySnapshot(input: {
  readonly store: EnterpriseMemoryStore;
  readonly query: EnterpriseMemoryQuery;
  readonly generatedAt: string;
}): Promise<EnterpriseMemorySnapshot> {
  if (!Number.isFinite(Date.parse(input.generatedAt))) throw new Error('invalid_timestamp');
  const records = await input.store.query(input.query);
  const base = {
    schemaVersion: EAE_ENTERPRISE_MEMORY_SCHEMA_VERSION,
    tenant: input.query.tenant,
    generatedAt: input.generatedAt,
    records,
    truncated: records.length === input.query.limit,
  } as const;
  return deepFreeze({ ...base, snapshotId: `eae_memory_snapshot_${fingerprint(base)}` });
}
