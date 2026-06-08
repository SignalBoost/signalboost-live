// saas/app/api/creative/generate-image/route.ts
//
// Creative Studio image generation via Gemini 2.5 Flash Image ("Nano Banana").
// Flow: check image credit -> call Gemini -> upload to Supabase Storage ->
// spend 1 image credit -> return public URL. Refunds on any failure.
//
// Env required: GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getCreditState, spendCredit, refundCredit } from '@/lib/credits'

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

  // ── Cap check BEFORE the expensive call ────────────────────────────────────────
  const state = await getCreditState(user.id)
  if (state.image <= 0) {
    return new Response(JSON.stringify({
      error: 'cap_reached',
      meter: 'image',
      message: 'You have used all your image credits for this plan.',
      remaining: 0,
      plan: state.plan,
    }), { status: 403 })
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

  // ── Spend 1 image credit (only now that we have a real image) ───────────────────
  const spend = await spendCredit(user.id, 'image')
  if (!spend.ok) {
    // Cap was hit between the pre-check and now (rare race) — don't return an image
    // the user didn't pay for.
    return new Response(JSON.stringify({
      error: 'cap_reached',
      meter: 'image',
      message: 'You have used all your image credits for this plan.',
      remaining: 0,
      plan: spend.plan,
    }), { status: 403 })
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
      // We have the image but couldn't store it — still deliver it inline so the
      // credit the user just spent isn't wasted.
      return new Response(JSON.stringify({
        imageUrl: `data:${mime};base64,${base64}`,
        stored: false,
        remaining: spend.remaining,
      }), { status: 200 })
    }

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(filename)
    return new Response(JSON.stringify({
      imageUrl: pub.publicUrl,
      stored: true,
      remaining: spend.remaining,
    }), { status: 200 })
  } catch (err) {
    console.error('Image storage exception:', err)
    // Same as above: image exists, deliver inline, credit already spent fairly.
    return new Response(JSON.stringify({
      imageUrl: `data:${mime};base64,${base64}`,
      stored: false,
      remaining: spend.remaining,
    }), { status: 200 })
  }
}
