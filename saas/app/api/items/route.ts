// GET /api/items?query=museums          — filter by query
// GET /api/items                        — return last 50 items across all queries
//
// Wikipedia content is licensed under CC BY-SA 4.0.
// Attribution is required and included in every response.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const db    = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const query = req.nextUrl.searchParams.get('query')?.trim() ?? ''

    let builder = db
      .from('items')
      .select('id, query, title, description, image_url, wiki_url, fetched_at')
      .order('fetched_at', { ascending: false })
      .limit(50)

    if (query) {
      builder = builder.eq('query', query)
    }

    const { data, error } = await builder

    if (error) {
      console.error('Items route: DB error', error)
      return NextResponse.json({ error: 'Could not fetch items.' }, { status: 500 })
    }

    return NextResponse.json({
      items: data ?? [],
      count: data?.length ?? 0,
      attribution: {
        source:      'Wikipedia',
        license:     'CC BY-SA 4.0',
        license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
        notice:      'Content retrieved from Wikipedia. Wikipedia® is a registered trademark of the Wikimedia Foundation. Content is available under the Creative Commons Attribution-ShareAlike 4.0 International License.',
      },
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Items route error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
