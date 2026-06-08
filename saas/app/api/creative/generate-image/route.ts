// saas/app/api/creative/generate-image/route.ts
//
// Creative Studio image generation via Gemini 2.5 Flash Image ("Nano Banana").
// Flow: prompt -> Gemini returns base64 image bytes -> upload to Supabase Storage
// bucket 'generated-images' -> return the public URL.
//
// Env required: GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const GEMINI_MODEL = 'gemini-2.5-flash-image'
const BUCKET = 'generated-images'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function extOf(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  return 'png'
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Please sign in to generate images.' }), { status: 401 })
  }

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    return new Response(JSON.stringify({ error: 'Image generation is not configured.' }), { status: 500 })
  }

  let body: any = null
  try { body = await req.json() } catch { body = null }
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  const aspectRatio = typeof body?.aspectRatio === 'string' ? body.aspectRatio : '16:9'

  if (prompt.length < 3) {
    return new Response(JSON.stringify({ error: 'Please describe the image you want.' }), { status: 400 })
  }

  // ── Call Gemini ──────────────────────────────────────────────────────────────
  let geminiData: any = null
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio },
        },
      }),
      cache: 'no-store',
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error('Gemini image error:', res.status, detail)
      const msg = res.status === 429
        ? 'Rate limit reached. Please wait a moment and try again.'
        : 'The image service is temporarily unavailable. Please try again.'
      return new Response(JSON.stringify({ error: msg }), { status: 502 })
    }
    geminiData = await res.json()
  } catch (err) {
    console.error('Gemini image exception:', err)
    return new Response(JSON.stringify({ error: 'Could not reach the image service.' }), { status: 502 })
  }

  // ── Extract the image bytes from the response ──────────────────────────────────
  const parts = geminiData?.candidates?.[0]?.content?.parts
  const imagePart = Array.isArray(parts) ? parts.find((p: any) => p?.inlineData?.data) : null
  const base64 = imagePart?.inlineData?.data
  const mime = imagePart?.inlineData?.mimeType || 'image/png'

  if (!base64) {
    console.error('Gemini returned no image part:', JSON.stringify(geminiData)?.slice(0, 500))
    return new Response(JSON.stringify({ error: 'No image was generated. Try rephrasing your prompt.' }), { status: 502 })
  }

  // ── Upload to Supabase Storage ─────────────────────────────────────────────────
  try {
    const bytes = Buffer.from(base64, 'base64')
    const filename = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extOf(mime)}`
    const db = supabaseAdmin()

    const { error: uploadError } = await db.storage.from(BUCKET).upload(filename, bytes, {
      contentType: mime,
      upsert: false,
    })
    if (uploadError) {
      console.error('Supabase upload failed:', uploadError.message)
      // Fallback: return the image inline as a data URL so the user still gets it.
      return new Response(JSON.stringify({ imageUrl: `data:${mime};base64,${base64}`, stored: false }), { status: 200 })
    }

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(filename)
    return new Response(JSON.stringify({ imageUrl: pub.publicUrl, stored: true }), { status: 200 })
  } catch (err) {
    console.error('Image storage exception:', err)
    return new Response(JSON.stringify({ imageUrl: `data:${mime};base64,${base64}`, stored: false }), { status: 200 })
  }
}
