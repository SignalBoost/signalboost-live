import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { createPlatformImagePort } from '@/lib/cos/aiPort'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { detectConciergeVisualIntent } from '@/lib/visuals/intent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_OBJECTIVE_CHARS = 4_000
function imageMimeType(b64: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  const bytes = Buffer.from(b64.slice(0, 96), 'base64')
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return 'image/png'
}

function extensionFor(mime: string): 'png' | 'jpg' | 'webp' {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
}

function objectiveOf(value: unknown): string {
  const objective = String(value || '').replace(/\0/g, '').trim()
  if (!objective || objective.length > MAX_OBJECTIVE_CHARS) throw new Error('visual_invalid_objective')
  return objective
}

function visualPrompt(objective: string): string {
  return [
    'Create one polished, colorful visual for the user request below.',
    'Use a clear, modern editorial-illustration style with strong composition, readable visual hierarchy, and no watermarks.',
    'For people or animals, use an original, non-identifiable depiction.',
    'For a diagram, favor a clean visual layout and simple, legible labels only when essential.',
    'Do not include brand logos, UI chrome, or unrelated text.',
    '',
    'USER REQUEST:',
    objective,
  ].join('\n')
}

/** Authenticated Concierge visual tool. It creates a downloadable, inline-rendered PNG; it never publishes it. */
export async function POST(request: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to create visual files.' }, { status: 401 })

  try {
    const body = await request.json()
    const objective = objectiveOf(body?.objective)
    const intent = detectConciergeVisualIntent(objective)
    if (!intent) return NextResponse.json({ error: 'visual_request_not_recognised' }, { status: 400 })

    const generated = await createPlatformImagePort().generate({ prompt: visualPrompt(objective), size: '512x512' })
    if (!generated.ok || !generated.b64) {
      return NextResponse.json({ error: generated.error || 'visual_generation_unavailable' }, { status: 503 })
    }

    const workspace = createSupabaseBuilderWorkspace(access.userId)
    if (!workspace) return NextResponse.json({ error: 'visual_storage_unavailable' }, { status: 503 })

    const workspaceId = crypto.randomUUID()
    await workspace.ensureWorkspace(workspaceId)
    const mime = imageMimeType(generated.b64)
    const filename = intent.filename.replace(/png$/i, extensionFor(mime))
    await workspace.writeFile(workspaceId, filename, `artifact-image-base64:${mime}:${generated.b64}`)

    return NextResponse.json({
      reply: 'Created your visual. It is shown below and ready to download.',
      source: 'concierge-visual',
      workspaceId,
      files: [filename],
      execution_allowed: true,
      external_action_taken: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'visual_request_failed'
    const status = /^visual_(invalid|request)/.test(message) ? 400 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
