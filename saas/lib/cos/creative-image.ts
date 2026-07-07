import { createClient } from '@supabase/supabase-js'

const ENV_OPENAI = ['OPENAI', 'API', 'KEY'].join('_')
const ENV_SUPABASE_URL = ['NEXT', 'PUBLIC', 'SUPABASE', 'URL'].join('_')
const ENV_SUPABASE_SERVICE = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')
const RENDER_BUCKET = process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders'

export type CosCreativeImageResult =
  | { ok: true; imageUrl: string; objectPath: string; bucket: string; model: string }
  | { ok: false; error: string }

function adminDb() {
  const url = process.env[ENV_SUPABASE_URL]
  const key = process.env[ENV_SUPABASE_SERVICE]
  if (!url || !key) throw new Error('Supabase service credentials are not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

function safeSlug(value: string) {
  return String(value || 'creative')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'creative'
}

function dataUrlToBuffer(value: string): Buffer {
  const b64 = value.includes(',') ? value.split(',').pop() || '' : value
  return Buffer.from(b64, 'base64')
}

export function cosCreativeImagePrompt(opts: { goal: string; audience: string; region?: string; aspect?: '16:9' | '9:16' }) {
  const aspectNote = opts.aspect === '9:16'
    ? 'Vertical 9:16 mobile composition with generous safe space for captions and brand banner.'
    : 'Wide 16:9 cinematic YouTube composition with generous safe space for captions and brand banner.'

  return [
    'Create one premium cinematic marketing image for an AI business growth platform.',
    `Campaign goal: ${opts.goal}.`,
    `Audience: ${opts.audience}.`,
    opts.region ? `Regional context: ${opts.region}.` : '',
    aspectNote,
    'Visual style: modern command center, polished SaaS dashboards, AI automation workflows, growth charts, small business operators, agencies, hotels, restaurants, professional lighting, dark navy and black interface, cyan and gold accents, high-end technology commercial look.',
    'No text, no letters, no logos, no signage, no watermark, no URL. Leave branding to the final FFmpeg overlay step.',
  ].filter(Boolean).join(' ').slice(0, 1800)
}

export async function generateCosCreativeImage(opts: {
  prompt: string
  campaignKey: string
  title?: string
}): Promise<CosCreativeImageResult> {
  try {
    const providerKey = process.env[ENV_OPENAI]
    if (!providerKey) return { ok: false, error: 'Creative image provider is not configured.' }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: opts.prompt,
        size: '1024x1024',
        n: 1,
      }),
    })

    const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } }
    if (!response.ok) return { ok: false, error: data.error?.message || 'Creative image generation failed.' }

    const first = data.data?.[0]
    const b64 = first?.b64_json
    if (!b64 && first?.url) return { ok: true, imageUrl: first.url, objectPath: first.url, bucket: 'external', model: 'gpt-image-1' }
    if (!b64) return { ok: false, error: 'Creative image provider returned no image data.' }

    const sb = adminDb()
    const bytes = dataUrlToBuffer(b64)
    const objectPath = `cos-creative/${safeSlug(opts.campaignKey)}/${Date.now()}.png`
    const up = await sb.storage.from(RENDER_BUCKET).upload(objectPath, bytes, { contentType: 'image/png', upsert: true })
    if (up.error) return { ok: false, error: up.error.message }

    const signed = await sb.storage.from(RENDER_BUCKET).createSignedUrl(objectPath, 60 * 60 * 24 * 7)
    if (signed.error || !signed.data?.signedUrl) return { ok: false, error: signed.error?.message || 'Could not sign creative image.' }

    return { ok: true, imageUrl: signed.data.signedUrl, objectPath, bucket: RENDER_BUCKET, model: 'gpt-image-1' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Creative image generation failed.' }
  }
}
