// saas/app/api/creative/generate-image/route.ts
//
// Creative Studio image generation via Gemini 2.5 Flash Image ("Nano Banana").
// Returns the generated image directly to the client (no server-side storage).
// Flow: check image credit -> call Gemini -> spend 1 credit -> return image.
// Refunds the credit if generation fails.
//
// Env required: GEMINI_API_KEY

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import { getCreditState, spendCredit, refundCredit } from '@/lib/credits'

export const dynamic = 'force-dynamic'

const GEMINI_MODEL = 'gemini-2.5-flash-image'

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

  // ── Call Gemini (with one automatic retry if it returns no image) ───────────────
  async function callGemini(): Promise<{ base64: string; mime: string } | { error: string; status: number }> {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key! },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
        }),
        cache: 'no-store',
      })

      if (!res.ok) {
        const detail = await res.text()
        console.error('Gemini image error:', res.status, detail)
        const msg = res.status === 429
          ? 'Rate limit reached. Please wait a moment and try again.'
          : 'The image service is temporarily unavailable. Please try again.'
        return { error: msg, status: 502 }
      }

      const data = await res.json()
      const parts = data?.candidates?.[0]?.content?.parts
      const imagePart = Array.isArray(parts) ? parts.find((p: any) => p?.inlineData?.data) : null
      const base64 = imagePart?.inlineData?.data
      const mime = imagePart?.inlineData?.mimeType || 'image/png'

      if (!base64) return { error: 'no_image', status: 502 }
      return { base64, mime }
    } catch (err) {
      console.error('Gemini image exception:', err)
      return { error: 'Could not reach the image service.', status: 502 }
    }
  }

  // First attempt; if Gemini returns no image, retry once (this was the frequent
  // first-try 502 — Gemini occasionally replies with no image part).
  let result = await callGemini()
  if ('error' in result && result.error === 'no_image') {
    result = await callGemini()
  }

  if ('error' in result) {
    const message = result.error === 'no_image'
      ? 'No image was generated. Try rephrasing your prompt.'
      : result.error
    return new Response(JSON.stringify({ error: message }), { status: result.status })
  }

  // ── Spend 1 image credit (only now that we have a real image) ───────────────────
  const spend = await spendCredit(user.id, 'image')
  if (!spend.ok) {
    return new Response(JSON.stringify({
      error: 'cap_reached',
      meter: 'image',
      message: 'You have used all your image credits for this plan.',
      remaining: 0,
      plan: spend.plan,
    }), { status: 403 })
  }

  // ── Return the image directly (no server-side storage) ──────────────────────────
  return new Response(JSON.stringify({
    imageUrl: `data:${result.mime};base64,${result.base64}`,
    stored: false,
    remaining: spend.remaining,
  }), { status: 200 })
}
