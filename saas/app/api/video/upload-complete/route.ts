import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

export async function POST(req: Request) {
  const supabase = admin()

  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.',
      },
      { status: 500 },
    )
  }

  let body: { bucket?: string; path?: string } = {}

  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const bucket = String(body.bucket || 'video-uploads')
  const path = String(body.path || '')

  if (!path) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Uploaded file path is required.',
      },
      { status: 400 },
    )
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7)

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Could not create playback URL.',
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    data: {
      bucket,
      path,
      signedUrl: data.signedUrl,
    },
  })
}
