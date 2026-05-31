import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request: Request) {
  const body = await request.json()
  const rating = Number(body.rating)
  if (!body.customer_name || !body.customer_email || !body.comment || !Number.isFinite(rating)) {
    return NextResponse.json({ error: 'Missing review fields' }, { status: 400 })
  }

  const review = {
    customer_name: String(body.customer_name).slice(0, 160),
    customer_email: String(body.customer_email).slice(0, 240),
    rating,
    comment: String(body.comment).slice(0, 4000),
    language: String(body.language || 'en').slice(0, 8),
    route: rating <= 3 ? 'recovery' : 'publishable',
    media_name: String(body.media_name || '').slice(0, 240),
    media_type: String(body.media_type || '').slice(0, 120),
    source: 'signalboost_reviews_stage_1',
  }

  if (supabaseUrl && serviceRoleKey) {
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { error } = await supabase.from('review_requests').insert(review)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (process.env.RESEND_API_KEY && process.env.REVIEWS_ALERT_EMAIL) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'SignalBoost <reviews@signalboost.ai>',
        to: [process.env.REVIEWS_ALERT_EMAIL],
        subject: `New ${review.route} review (${rating}★)`,
        text: `${review.customer_name} (${review.customer_email}) left ${rating} stars in ${review.language}.\n\n${review.comment}`,
      }),
    })
  }

  return NextResponse.json({ ok: true, route: review.route })
}
