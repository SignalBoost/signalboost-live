import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 30

const BUCKET = 'video-uploads'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureBucket(supabase: any) {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: false })
  }
}

export async function POST(req: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) {
    return NextResponse.json(
      { ok: false, error: 'You must be signed in to upload a video.' },
      { status: 401 },
    )
  }

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
  const path = `${access.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`

  try {
    await ensureBucket(supabase)
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message || 'Could not create upload URL.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data: { bucket: BUCKET, path: data.path, token: data.token } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload URL failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
