import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { detectConciergeArtifactIntent } from '@/lib/artifacts/intent'
import { textPdfBase64 } from '@/lib/artifacts/text-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

const MAX_OBJECTIVE_CHARS = 8_000
const MAX_SOURCE_CHARS = 120_000
const PDF_PREFIX = 'artifact-pdf-base64:'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function objectiveOf(value: unknown): string {
  const objective = String(value || '').replace(/\0/g, '').trim()
  if (!objective || objective.length > MAX_OBJECTIVE_CHARS) throw new Error('artifact_invalid_objective')
  return objective
}

function documentPrompt(objective: string, format: 'txt' | 'pdf', sourceText: string): string {
  return [
    'Write the finished body of a user-requested document.',
    'Use only details stated by the user or present in the supplied current-conversation source material. Do not invent dates, names, sources, facts, or contact details.',
    'When source material is supplied, convert that material faithfully into the requested format; do not replace it with a generic explanation.',
    'If the request asks for unprovided factual research, state that the needed facts are missing rather than fabricating them.',
    'Return only the document body, with no preamble, markdown fence, filename, or explanation.',
    `Requested format: ${format}.`,
    '',
    'USER REQUEST:',
    objective,
    ...(sourceText ? ['', 'SOURCE MATERIAL FROM THE CURRENT CONVERSATION:', sourceText] : []),
  ].join('\n')
}

async function sourceMaterial(body: any, userId: string): Promise<string> {
  const workspaceId = String(body?.sourceWorkspaceId || '')
  const sourcePath = String(body?.sourcePath || '').trim()
  if (UUID.test(workspaceId) && sourcePath && sourcePath.length <= 500 && !sourcePath.split('/').includes('..')) {
    const workspace = createSupabaseBuilderWorkspace(userId)
    const file = workspace ? await workspace.readFile(workspaceId, sourcePath).catch(() => null) : null
    const content = String(file?.content || '')
    if (content && !/^artifact-(?:pdf|image)-base64:/.test(content)) return content.slice(0, MAX_SOURCE_CHARS)
  }
  return String(body?.sourceText || '').replace(/\0/g, '').trim().slice(0, MAX_SOURCE_CHARS)
}

/** Authenticated Concierge artifact tool. It creates a downloadable document; it never sends it. */
export async function POST(request: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to create downloadable files.' }, { status: 401 })

  try {
    const body = await request.json()
    const objective = objectiveOf(body?.objective)
    const intent = detectConciergeArtifactIntent(objective)
    if (!intent) return NextResponse.json({ error: 'artifact_format_not_recognised' }, { status: 400 })
    const sourceText = await sourceMaterial(body, access.userId)

    const generated = await createPlatformAiPort().generate({
      systemPrompt: 'You create precise, safe document drafts for the authenticated SignalBoost Concierge.',
      prompt: documentPrompt(objective, intent.format, sourceText),
      maxTokens: 2_400,
    })
    const documentBody = String(generated || '').replace(/\0/g, '').trim()
    if (!documentBody) return NextResponse.json({ error: 'artifact_document_generation_unavailable' }, { status: 503 })

    const workspace = createSupabaseBuilderWorkspace(access.userId)
    if (!workspace) return NextResponse.json({ error: 'artifact_storage_unavailable' }, { status: 503 })

    const workspaceId = crypto.randomUUID()
    await workspace.ensureWorkspace(workspaceId)
    const path = `${intent.filenameStem}.${intent.format}`
    const content = intent.format === 'pdf'
      ? PDF_PREFIX + textPdfBase64(documentBody)
      : documentBody
    await workspace.writeFile(workspaceId, path, content)

    return NextResponse.json({
      reply: `Created ${path}. You can download it below.`,
      source: 'concierge-artifact',
      workspaceId,
      files: [path],
      execution_allowed: true,
      external_action_taken: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'artifact_request_failed'
    const status = /^artifact_(invalid|format)/.test(message) ? 400 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
