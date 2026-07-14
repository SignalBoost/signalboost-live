#!/usr/bin/env node

/**
 * Staged Supabase -> PocketBase record migration.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   POCKETBASE_URL
 *   POCKETBASE_ADMIN_EMAIL
 *   POCKETBASE_ADMIN_PASSWORD
 *   MIGRATION_TABLES=comma,separated,table,names
 *
 * The matching PocketBase collections must exist before import. The script is
 * idempotent when each source row has an `id` field: it stores that value in
 * `legacy_id` and updates an existing matching record.
 */

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "POCKETBASE_URL",
  "POCKETBASE_ADMIN_EMAIL",
  "POCKETBASE_ADMIN_PASSWORD",
  "MIGRATION_TABLES",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pocketBaseUrl = process.env.POCKETBASE_URL.replace(/\/$/, "");
const tables = process.env.MIGRATION_TABLES.split(",").map((value) => value.trim()).filter(Boolean);
const pageSize = Number(process.env.MIGRATION_PAGE_SIZE || 500);

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${response.status} ${url}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

async function authenticatePocketBase() {
  const result = await jsonFetch(`${pocketBaseUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identity: process.env.POCKETBASE_ADMIN_EMAIL,
      password: process.env.POCKETBASE_ADMIN_PASSWORD,
    }),
  });
  return result.token;
}

async function readSupabaseTable(table) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({ select: "*", offset: String(offset), limit: String(pageSize) });
    const page = await jsonFetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?${query}`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    if (!Array.isArray(page)) throw new Error(`Unexpected response for ${table}`);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function normalizeRecord(row) {
  const record = { ...row };
  if (row.id !== undefined && row.id !== null) record.legacy_id = String(row.id);
  delete record.id;
  delete record.created;
  delete record.updated;
  return record;
}

async function findExisting(collection, legacyId, token) {
  if (!legacyId) return null;
  const params = new URLSearchParams({ page: "1", perPage: "1", filter: `legacy_id = "${String(legacyId).replaceAll('"', '\\"')}"` });
  const result = await jsonFetch(`${pocketBaseUrl}/api/collections/${encodeURIComponent(collection)}/records?${params}`, {
    headers: { Authorization: token },
  });
  return result.items?.[0] || null;
}

async function writePocketBaseRecord(collection, row, token) {
  const payload = normalizeRecord(row);
  const existing = await findExisting(collection, payload.legacy_id, token);
  const url = existing
    ? `${pocketBaseUrl}/api/collections/${encodeURIComponent(collection)}/records/${existing.id}`
    : `${pocketBaseUrl}/api/collections/${encodeURIComponent(collection)}/records`;
  await jsonFetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return existing ? "updated" : "created";
}

const token = await authenticatePocketBase();
const summary = {};

for (const table of tables) {
  console.log(`Reading ${table} from Supabase...`);
  const rows = await readSupabaseTable(table);
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const action = await writePocketBaseRecord(table, row, token);
      if (action === "created") created += 1;
      else updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`[${table}] ${row.id ?? "unknown"}:`, error.message);
    }
  }

  summary[table] = { sourceRows: rows.length, created, updated, failed };
  console.log(`${table}:`, summary[table]);
}

console.log("Migration summary:");
console.log(JSON.stringify(summary, null, 2));
if (Object.values(summary).some((entry) => entry.failed > 0)) process.exitCode = 2;
