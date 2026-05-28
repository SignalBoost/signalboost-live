import { createClient } from '@supabase/supabase-js'

type SourceType = 'CSV' | 'API' | 'Scraper'

type ItemInput = {
  name: string
  category: string
  description?: string
  image_url?: string
  source_url?: string
  metadata?: Record<string, unknown>
}

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

function validateRow(row: Record<string, string>) {
  if (!row.name?.trim()) throw new Error('Each row requires name')
  if (!row.category?.trim()) throw new Error('Each row requires category')
}

async function upsertCategory(name: string) {
  const db = getDb()
  const { data, error } = await db.from('categories').upsert({ name }, { onConflict: 'name' }).select('id').single()
  if (error) throw error
  return data.id as string
}

async function insertItems(items: ItemInput[], sourceId: string) {
  const db = getDb()
  const rows = await Promise.all(items.map(async item => ({
    name: item.name,
    category_id: await upsertCategory(item.category),
    description: item.description || null,
    image_url: item.image_url || null,
    source_url: item.source_url || null,
    source_id: sourceId,
    metadata: item.metadata ?? {},
  })))

  const { error } = await db.from('items').insert(rows)
  if (error) throw error
}

async function createSource(type: SourceType, config: Record<string, unknown>) {
  const db = getDb()
  const { data, error } = await db.from('sources').insert({ type, config }).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function importCsvItems(csvText: string, config: Record<string, unknown> = {}) {
  const rows = parseCsv(csvText)
  const items: ItemInput[] = rows.map((row) => {
    validateRow(row)
    return {
      name: row.name,
      category: row.category,
      description: row.description,
      image_url: row.image_url,
      source_url: row.source_url,
      metadata: { raw_row: row },
    }
  })

  const sourceId = await createSource('CSV', config)
  await insertItems(items, sourceId)
  return { inserted: items.length, sourceId }
}

export async function importApiItems(endpoint: string, mapping: Record<string, string>, extraConfig: Record<string, unknown> = {}) {
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(`API request failed: ${response.status}`)
  const payload = await response.json()
  const records = Array.isArray(payload) ? payload : (payload.items ?? [])

  const items: ItemInput[] = records.map((record: Record<string, unknown>) => ({
    name: String(record[mapping.name] ?? ''),
    category: String(record[mapping.category] ?? 'Uncategorized'),
    description: String(record[mapping.description] ?? ''),
    image_url: String(record[mapping.image_url] ?? ''),
    source_url: String(record[mapping.source_url] ?? ''),
    metadata: { raw_record: record, mapping },
  }))

  items.forEach((item) => {
    if (!item.name) throw new Error('Mapped API item is missing name')
  })

  const sourceId = await createSource('API', { endpoint, mapping, ...extraConfig })
  await insertItems(items, sourceId)
  return { inserted: items.length, sourceId }
}

export async function importScraperItems(input: { json?: unknown[]; csv?: string; mapping?: Record<string, string>; config?: Record<string, unknown> }) {
  const mapping = input.mapping ?? {
    name: 'name',
    category: 'category',
    description: 'description',
    image_url: 'image_url',
    source_url: 'source_url',
  }

  let records: Record<string, unknown>[] = []
  if (input.json && Array.isArray(input.json)) {
    records = input.json as Record<string, unknown>[]
  } else if (input.csv) {
    records = parseCsv(input.csv)
  } else {
    throw new Error('Provide scraper output as json[] or csv string')
  }

  const items: ItemInput[] = records.map((record) => ({
    name: String(record[mapping.name] ?? ''),
    category: String(record[mapping.category] ?? 'Uncategorized'),
    description: String(record[mapping.description] ?? ''),
    image_url: String(record[mapping.image_url] ?? ''),
    source_url: String(record[mapping.source_url] ?? ''),
    metadata: { raw_record: record, mapping, source: 'scraper' },
  }))

  items.forEach((item) => {
    if (!item.name) throw new Error('Mapped scraper item is missing name')
  })

  const sourceId = await createSource('Scraper', { mapping, ...(input.config ?? {}) })
  await insertItems(items, sourceId)
  return { inserted: items.length, sourceId }
}
