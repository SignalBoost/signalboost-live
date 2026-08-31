import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { createPlatformImagePort } from '@/lib/cos/aiPort'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { detectConciergeVisualIntent } from '@/lib/visuals/intent'
import { resolveVerifiedReferenceVisual, type VerifiedReferenceVisual } from '@/lib/visuals/referenceAssets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_OBJECTIVE_CHARS = 4_000

type VisualLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

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

function visualLanguage(objective: string): VisualLanguage {
  const value = objective.toLowerCase()
  if (/[а-яё]/i.test(value)) return 'ru'
  if (/[ąćęłńóśźż]/i.test(value) || /\b(?:narysuj|stworz|zrob|zaprojektuj|druzyny|pilkarskiej)\b/i.test(value)) return 'pl'
  if (/\b(?:dibuja|dibujar|dibuje|crea|crear|genera|generar|disena|disenar|blason|equipo|futbol)\b/i.test(value)) return 'es'
  if (/\b(?:desenhe|desenhar|desenha|crie|criar|gere|gerar|distintivo|brasao|futebol|time|equipe)\b/i.test(value)) return 'pt'
  return 'en'
}

function generatedReply(language: VisualLanguage): string {
  return {
    en: 'Created your visual. It is shown below and ready to download.',
    es: 'Creé tu imagen. Se muestra abajo y está lista para descargar.',
    pt: 'Criei sua imagem. Ela aparece abaixo e está pronta para baixar.',
    pl: 'Utworzyłem obraz. Jest pokazany poniżej i gotowy do pobrania.',
    ru: 'Изображение создано. Оно показано ниже и готово к скачиванию.',
  }[language]
}

function referenceReply(language: VisualLanguage): string {
  return {
    en: 'Found and displayed the verified mark you requested. It is shown below and ready to download.',
    es: 'Encontré y mostré el emblema verificado solicitado. Aparece abajo y está listo para descargar.',
    pt: 'Encontrei e exibi o distintivo verificado solicitado. Ele aparece abaixo e está pronto para baixar.',
    pl: 'Znalazłem i wyświetliłem zweryfikowany herb. Jest pokazany poniżej i gotowy do pobrania.',
    ru: 'Проверенная эмблема найдена и показана ниже. Она готова к скачиванию.',
  }[language]
}

function unverifiedReferenceReply(language: VisualLanguage): string {
  return {
    en: 'I could not verify an authoritative image of that mark, so I did not invent one. Provide a reference image or request an original emblem instead.',
    es: 'No pude verificar una imagen autorizada de ese emblema, así que no inventé una. Proporciona una referencia o solicita un emblema original.',
    pt: 'Não encontrei uma imagem verificável desse distintivo, então não inventei uma. Envie uma referência ou peça um emblema original.',
    pl: 'Nie znalazłem wiarygodnego obrazu tego herbu, więc go nie wymyśliłem. Prześlij wzór albo poproś o oryginalny emblemat.',
    ru: 'Не удалось подтвердить достоверное изображение этой эмблемы, поэтому я не стал её выдумывать. Пришлите образец или запросите оригинальную эмблему.',
  }[language]
}

function visualPrompt(objective: string): string {
  return [
    'Create one polished, high-quality original visual for the user request below.',
    'Use a style appropriate to the requested format, with strong composition, clear visual hierarchy, and no watermarks.',
    'For an original logo, badge, emblem, insignia, or icon, use a clean centered graphic-design composition rather than an editorial scene.',
    'Do not reconstruct, imitate, or claim to reproduce an existing named brand or team mark from model memory.',
    'Do not add unrelated logos, UI chrome, or unrelated text.',
    'For people or animals, use an original, non-identifiable depiction.',
    'For a diagram, favor a clean visual layout and simple, legible labels only when essential.',
    '',
    'USER REQUEST:',
    objective,
  ].join('\n')
}

/** Authenticated Concierge visual tool. It creates or retrieves a downloadable inline visual; it never publishes it. */
export async function POST(request: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to create visual files.' }, { status: 401 })

  try {
    const body = await request.json()
    const objective = objectiveOf(body?.objective)
    const language = visualLanguage(objective)
    const intent = detectConciergeVisualIntent(objective)
    if (!intent) return NextResponse.json({ error: 'visual_request_not_recognised' }, { status: 400 })

    let b64: string
    let mime: 'image/png' | 'image/jpeg' | 'image/webp'
    let verifiedReference: VerifiedReferenceVisual | null = null

    if (intent.mode === 'reference-mark') {
      verifiedReference = await resolveVerifiedReferenceVisual(intent.referenceQuery || '')
      if (!verifiedReference) {
        return NextResponse.json({
          error: 'visual_reference_not_verified',
          reply: unverifiedReferenceReply(language),
          source: 'concierge-visual-reference-unverified',
          execution_allowed: false,
          external_action_taken: false,
        }, { status: 422 })
      }
      b64 = verifiedReference.b64
      mime = verifiedReference.mime
    } else {
      const generated = await createPlatformImagePort().generate({ prompt: visualPrompt(objective), size: '512x512' })
      if (!generated.ok || !generated.b64) {
        return NextResponse.json({ error: generated.error || 'visual_generation_unavailable' }, { status: 503 })
      }
      b64 = generated.b64
      mime = imageMimeType(generated.b64)
    }

    const workspace = createSupabaseBuilderWorkspace(access.userId)
    if (!workspace) return NextResponse.json({ error: 'visual_storage_unavailable' }, { status: 503 })

    const workspaceId = crypto.randomUUID()
    await workspace.ensureWorkspace(workspaceId)
    const filename = intent.filename.replace(/png$/i, extensionFor(mime))
    await workspace.writeFile(workspaceId, filename, `artifact-image-base64:${mime}:${b64}`)

    return NextResponse.json({
      reply: verifiedReference ? referenceReply(language) : generatedReply(language),
      source: verifiedReference ? 'concierge-visual-reference' : 'concierge-visual',
      workspaceId,
      files: [filename],
      execution_allowed: true,
      external_action_taken: false,
      external_retrieval_used: Boolean(verifiedReference),
      reference: verifiedReference ? {
        title: verifiedReference.title,
        provider: verifiedReference.provider,
        sourcePageUrl: verifiedReference.sourcePageUrl,
      } : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'visual_request_failed'
    const status = /^visual_(invalid|request)/.test(message) ? 400 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
