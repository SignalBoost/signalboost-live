import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const db = getDb()

  const [{ data: categories }, { data: items }, { data: sources }] = await Promise.all([
    db.from('categories').select('id,name,description').order('name'),
    db.from('items').select('id,name,description,image_url,source_url,category_id,source_id,metadata,created_at').order('created_at', { ascending: false }).limit(300),
    db.from('sources').select('id,type,config,created_at').order('created_at', { ascending: false }).limit(100),
  ])

  const categoryMap = new Map((categories ?? []).map(c => [c.id, c.name]))
  const categorized = (items ?? []).reduce<Record<string, typeof items>>((acc, item) => {
    const key = categoryMap.get(item.category_id) ?? 'Uncategorized'
    acc[key] = acc[key] ?? []
    acc[key].push(item)
    return acc
  }, {})

  return NextResponse.json({ categories: categories ?? [], groupedItems: categorized, sources: sources ?? [] })
}
