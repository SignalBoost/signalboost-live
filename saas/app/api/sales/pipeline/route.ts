import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)

    if (!url || !key) {
      return NextResponse.json({
        leads: [],
        error: 'Supabase server credentials are missing.',
      })
    }

    const res = await fetch(
      `${url}/rest/v1/sales_prospects?select=*&order=created_at.desc&limit=200`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const body = await res.text()
      console.error('Pipeline load failed:', body)

      return NextResponse.json({
        leads: [],
        error: 'Could not load pipeline.',
      })
    }

    const leads = await res.json()

    return NextResponse.json({ leads })
  } catch (error) {
    console.error('Pipeline route error:', error)

    return NextResponse.json({
      leads: [],
      error: 'Something went wrong.',
    })
  }
}
