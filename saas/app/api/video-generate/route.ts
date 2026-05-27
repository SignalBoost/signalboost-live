import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fal } from '@fal-ai/client'
import { spendVideoCredit } from '@/lib/credits'

const TEXT_MODEL = 'fal-ai/kling-video/v3/standard/text-to-video'
const IMAGE_MODEL = 'fal-ai/kling-video/o3/standard/image-to-video'

fal.config({ credentials: process.env.FAL_KEY })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const mode: 'text' | 'image' = body.mode === 'image' ? 'image' : 'text'
    const prompt: string = (body.prompt || '').trim()
    const imageDataUri: string | undefined = body.imageDataUri
    const aspectRatio: string = body.aspectRatio || '9:16'

    // Authenticate the user from Supabase cookies
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options))
            } catch {}
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'videoGenerate.errors.authRequired' }, { status: 401 })
    }

    if (mode === 'text' && !prompt) {
      return NextResponse.json({ error: 'videoGenerate.errors.promptRequired' }, { status: 400 })
    }
    if (mode === 'image' && !imageDataUri) {
      return NextResponse.json({ error: 'videoGenerate.errors.imageRequired' }, { status: 400 })
    }

    // Spend a credit BEFORE generating (refunded later by video-status if it fails)
    const spend = await spendVideoCredit(user.id)
    if (!spend.ok) {
      if (spend.reason === 'no_credits') {
        return NextResponse.json(
          { error: 'videoGenerate.errors.noCredits' },
          { status: 402 }
        )
      }
      return NextResponse.json({ error: 'videoGenerate.errors.creditCheckFailed' }, { status: 500 })
    }

    // Build the input for the chosen model
    let model: string
    let input: Record<string, unknown>

    if (mode === 'image') {
      // Upload the image to fal storage to get a public URL
      const res = await fetch(imageDataUri as string)
      const blob = await res.blob()
      const file = new File([blob], 'source.png', { type: blob.type || 'image/png' })
      const imageUrl = await fal.storage.upload(file)

      model = IMAGE_MODEL
      input = {
        image_url: imageUrl,
        prompt: prompt || 'videoGenerate.defaults.imagePrompt',
        duration: '5',
      }
    } else {
      model = TEXT_MODEL
      input = {
        prompt,
        duration: '5',
        aspect_ratio: aspectRatio,
      }
    }

    // Submit to the queue (long-running render)
    const { request_id } = await fal.queue.submit(model, { input })

    return NextResponse.json({
      request_id,
      model,
      remaining: spend.remaining,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'errors.generationFailed'
    console.error('video-generate error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
