import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { query, maxResults } = await req.json()
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Provide a "query" like "restaurants in Merida".' }, { status: 400 })
    }

    const key = process.env.GOOGLE_PLACES_API_KEY
    if (!key) {
      return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY is not set.' }, { status: 500 })
    }

    // Google Places API (New) - Text Search
    const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        // Only request the fields we need (keeps cost low)
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.primaryTypeDisplayName,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: Math.min(maxResults || 20, 20),
      }),
    })

    const data = await placesRes.json()
    if (!placesRes.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'Places API error', details: data },
        { status: 500 }
      )
    }

    const places = data.places || []
    if (places.length === 0) {
      return NextResponse.json({ found: 0, saved: 0, message: 'No businesses found for that query.' })
    }

    const supabase = admin()
    let saved = 0

    for (const p of places) {
      const row = {
        business_name: p.displayName?.text || 'Unknown',
        category: p.primaryTypeDisplayName?.text || null,
        location: p.formattedAddress || null,
        website: p.websiteUri || null,
        phone: p.nationalPhoneNumber || null,
        source: 'google_places',
        source_id: p.id || null,
        status: 'discovered',
        // A simple opportunity signal: no website OR few reviews = bigger opportunity
        web_presence_score:
          (p.websiteUri ? 50 : 0) + Math.min((p.userRatingCount || 0), 50),
        assessment: [
          p.websiteUri ? 'has website' : 'NO website',
          p.userRatingCount ? `${p.userRatingCount} reviews` : 'no reviews',
          p.rating ? `rating ${p.rating}` : 'no rating',
        ].join(', '),
      }

      // Upsert by (source, source_id) so re-running doesn't create duplicates
      const { error } = await supabase
        .from('prospects')
        .upsert(row, { onConflict: 'source,source_id', ignoreDuplicates: true })

      if (!error) saved++
    }

    return NextResponse.json({ found: places.length, saved, query })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'discovery failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
