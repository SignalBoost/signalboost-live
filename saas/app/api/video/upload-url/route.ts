import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

const BUCKET = 'video-uploads'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function ensureBucket(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: false })
  }
}

export async function POST(req: Request) {   
  const supabase = admin()
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.' },
      { status: 500 },
    )
  }

  let body: { filename?: string } = {}
  try { body = await req.json() } catch {}
  const rawName = typeof body.filename === 'string' && body.filename ? body.filename : 'video.mp4'
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'video.mp4'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`

  try {
    await ensureBucket(supabase)
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message || 'Could not create upload URL.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data: { bucket: BUCKET, path: data.path, token: data.token } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload URL failed.'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
