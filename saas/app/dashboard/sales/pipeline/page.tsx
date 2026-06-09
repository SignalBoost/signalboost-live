import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/access'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET() {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    const db = supabaseAdmin()

    const { data, error } = await db
      .from('outreach_queue')
      .select('id, company, contact_name, email, industry, country, language, status, draft_subject, draft_body, last_error')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('sales/pipeline: query failed', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ leads: data ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('sales/pipeline: exception', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
