import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { createPlatformImagePort } from '@/lib/cos/aiPort'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { classifyVisualRequest, type VisualRequestClassification } from '@/lib/visuals/requestClassifier'
import { resolveVerifiedReferenceVisual, type VerifiedReferenceVisual } from '@/lib/visuals/referenceAssets'
import { resolveVerifiedPersonReference, type VerifiedPersonReference } from '@/lib/visuals/personReferences'
import {
  generateReferenceConditionedImage,
  generateReferenceEditedImage,
  type ReferenceConditionedImageResult,
} from '@/lib/visuals/referenceImageGeneration'
import { verifyReferenceConditionedPeopleImage } from '@/lib/visuals/personImageVerification'
import { verifyGeneratedVisualOutput } from '@/lib/visuals/visualOutputVerification'
import {
  hasUserReferenceImage,
  isUserReferenceImageError,
  readUserReferenceImage,
  type UserReferenceImage,
} from '@/lib/visuals/userReference'
import { isVisualObjectiveError, readVisualObjective } from '@/lib/visuals/request-contract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_GENERATION_ATTEMPTS = 2
const TECHNICAL_VERIFICATION_REASONS = new Set([
  'verification_runtime_unavailable',
  'verification_transport_failure',
  'verification_timeout',
  'verification_invalid_response',
  'verification_invalid_schema',
])

type VisualLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp'
type GeneratedImage = Readonly<{ b64: string; mime: ImageMime }>

function imageMimeType(b64: string): ImageMime {
  const bytes = Buffer.from(b64.slice(0, 96), 'base64')
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return 'image/png'
}

function extensionFor(mime: string): 'png' | 'jpg' | 'webp' {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
}

function visualLanguage(objective: string): VisualLanguage {
  const value = objective.toLowerCase()
  if (/[а-яё]/i.test(value)) return 'ru'
  if (/[ąćęłńóśźż]/i.test(value) || /\b(?:narysuj|stworz|zrob|zaprojektuj|edytuj|usun|zmien)\b/i.test(value)) return 'pl'
  if (/\b(?:dibuja|dibujar|dibuje|crea|crear|genera|generar|edita|modifica|imagen|foto|blason|equipo|futbol)\b/i.test(value)) return 'es'
  if (/\b(?:faça|faca|desenhe|desenhar|desenha|crie|criar|gere|gerar|edite|editar|imagem|foto|distintivo|brasao|futebol|time|equipe|presidente)\b/i.test(value)) return 'pt'
  return 'en'
}

function trace(traceId: string, event: string, details: Record<string, unknown> = {}): void {
  console.info('[visual-generation-trace]', JSON.stringify({
    traceId,
    event,
    at: new Date().toISOString(),
    ...details,
  }))
}

function objectiveFingerprint(objective: string): string {
  return createHash('sha256').update(objective, 'utf8').digest('hex')
}

function generatedReply(language: VisualLanguage): string {
  return {
    en: 'Created and verified your generated visual. It is shown below and ready to download.',
    es: 'Creé y verifiqué tu imagen generada. Se muestra abajo y está lista para descargar.',
    pt: 'Criei e verifiquei sua imagem gerada. Ela aparece abaixo e está pronta para baixar.',
    pl: 'Utworzyłem i zweryfikowałem wygenerowany obraz. Jest pokazany poniżej i gotowy do pobrania.',
    ru: 'Созданное изображение проверено. Оно показано ниже и готово к скачиванию.',
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

function peopleReply(language: VisualLanguage): string {
  return {
    en: 'Created and verified a synthetic illustration using authoritative references for every requested person. It is shown below and ready to download.',
    es: 'Creé y verifiqué una ilustración sintética usando referencias autorizadas de todas las personas solicitadas. Aparece abajo y está lista para descargar.',
    pt: 'Criei e verifiquei uma ilustração sintética usando referências autorizadas de todas as pessoas solicitadas. Ela aparece abaixo e está pronta para baixar.',
    pl: 'Utworzyłem i zweryfikowałem syntetyczną ilustrację z użyciem wiarygodnych wzorców wszystkich wskazanych osób. Jest pokazana poniżej i gotowa do pobrania.',
    ru: 'Создана и проверена синтетическая иллюстрация с достоверными изображениями всех указанных людей. Она показана ниже и готова к скачиванию.',
  }[language]
}

function editedReply(language: VisualLanguage): string {
  return {
    en: 'Edited and verified the supplied image. The generated edit is shown below and ready to download.',
    es: 'Edité y verifiqué la imagen proporcionada. La edición generada aparece abajo y está lista para descargar.',
    pt: 'Editei e verifiquei a imagem enviada. A edição gerada aparece abaixo e está pronta para baixar.',
    pl: 'Edytowałem i zweryfikowałem przesłany obraz. Wygenerowana wersja jest pokazana poniżej i gotowa do pobrania.',
    ru: 'Предоставленное изображение отредактировано и проверено. Результат показан ниже и готов к скачиванию.',
  }[language]
}

function unverifiedReferenceReply(language: VisualLanguage, entity: string): string {
  const label = entity || 'requested mark'
  return {
    en: `I could not verify an authoritative image for ${label}, so I did not invent or substitute one. Provide a reference image or request an original emblem instead.`,
    es: `No pude verificar una imagen autorizada de ${label}, así que no inventé ni sustituí una. Proporciona una referencia o solicita un emblema original.`,
    pt: `Não encontrei uma imagem verificável de ${label}, então não inventei nem substituí uma. Envie uma referência ou peça um emblema original.`,
    pl: `Nie znalazłem wiarygodnego obrazu dla ${label}, więc go nie wymyśliłem ani nie zastąpiłem. Prześlij wzór albo poproś o oryginalny emblemat.`,
    ru: `Не удалось подтвердить достоверное изображение для ${label}, поэтому я не стал ничего выдумывать или подменять. Пришлите образец или запросите оригинальную эмблему.`,
  }[language]
}

function unverifiedPeopleReply(language: VisualLanguage, unresolved: readonly string[]): string {
  const names = unresolved.join(', ')
  return {
    en: `I could not verify a reliable portrait reference for: ${names}. I did not substitute or invent anyone. Use a fuller name or provide a reference image.`,
    es: `No pude verificar una referencia fiable para: ${names}. No sustituí ni inventé a nadie. Usa un nombre más completo o proporciona una imagen de referencia.`,
    pt: `Não encontrei uma referência verificável para: ${names}. Não substituí nem inventei ninguém. Use um nome mais completo ou envie uma imagem de referência.`,
    pl: `Nie udało się zweryfikować wzorca dla: ${names}. Nikogo nie zastąpiłem ani nie wymyśliłem. Podaj pełniejsze dane lub prześlij zdjęcie wzorcowe.`,
    ru: `Не удалось проверить эталонное изображение для: ${names}. Я никого не заменял и не выдумывал. Укажите более полное имя или пришлите изображение-образец.`,
  }[language]
}

function verificationFailureReply(language: VisualLanguage, people: boolean): string {
  if (people) {
    return {
      en: 'The generated scene did not preserve every requested identity distinctly, so I blocked it instead of showing a substituted, missing, or duplicated person.',
      es: 'La escena generada no conservó claramente todas las identidades solicitadas, así que la bloqueé en vez de mostrar una persona sustituida, ausente o duplicada.',
      pt: 'A cena gerada não preservou claramente todas as identidades solicitadas, então eu a bloqueei em vez de mostrar uma pessoa substituída, ausente ou duplicada.',
      pl: 'Wygenerowana scena nie zachowała wyraźnie wszystkich wskazanych tożsamości, więc została zablokowana zamiast pokazania osoby zastąpionej, brakującej lub zduplikowanej.',
      ru: 'Сгенерированная сцена не сохранила каждую запрошенную личность отдельно, поэтому она была заблокирована, а не показана с заменённым, отсутствующим или дублированным человеком.',
    }[language]
  }
  return {
    en: 'The generated visual did not pass the requested-content verification, so I blocked it rather than showing an incorrect result.',
    es: 'La imagen generada no superó la verificación del contenido solicitado, así que la bloqueé en lugar de mostrar un resultado incorrecto.',
    pt: 'A imagem gerada não passou na verificação do conteúdo solicitado, então eu a bloqueei em vez de mostrar um resultado incorreto.',
    pl: 'Wygenerowany obraz nie przeszedł weryfikacji żądanej treści, więc został zablokowany zamiast pokazania błędnego wyniku.',
    ru: 'Сгенерированное изображение не прошло проверку запрошенного содержания, поэтому неверный результат был заблокирован.',
  }[language]
}

function userReferenceFailureReply(language: VisualLanguage, code: string): string {
  const replies: Record<string, Record<VisualLanguage, string>> = {
    visual_reference_image_required: {
      en: 'Attach the image you want edited, then send the edit request again.',
      es: 'Adjunta la imagen que quieres editar y vuelve a enviar la solicitud.',
      pt: 'Anexe a imagem que deseja editar e envie o pedido novamente.',
      pl: 'Dołącz obraz, który chcesz edytować, i wyślij prośbę ponownie.',
      ru: 'Прикрепите изображение, которое нужно отредактировать, и отправьте запрос снова.',
    },
    visual_reference_image_type_unsupported: {
      en: 'The reference image type is not supported. Use PNG, JPEG, or WebP.',
      es: 'El tipo de imagen de referencia no es compatible. Usa PNG, JPEG o WebP.',
      pt: 'O tipo da imagem de referência não é compatível. Use PNG, JPEG ou WebP.',
      pl: 'Typ obrazu wzorcowego nie jest obsługiwany. Użyj PNG, JPEG lub WebP.',
      ru: 'Тип исходного изображения не поддерживается. Используйте PNG, JPEG или WebP.',
    },
    visual_reference_image_too_large: {
      en: 'The reference image is too large. Use an image no larger than 10 MB.',
      es: 'La imagen de referencia es demasiado grande. Usa una imagen de hasta 10 MB.',
      pt: 'A imagem de referência é muito grande. Use uma imagem de até 10 MB.',
      pl: 'Obraz wzorcowy jest za duży. Użyj obrazu o rozmiarze do 10 MB.',
      ru: 'Исходное изображение слишком большое. Используйте файл не более 10 МБ.',
    },
    visual_reference_image_invalid: {
      en: 'The attached reference image could not be validated. Attach a valid PNG, JPEG, or WebP file.',
      es: 'No se pudo validar la imagen adjunta. Adjunta un archivo PNG, JPEG o WebP válido.',
      pt: 'Não foi possível validar a imagem anexada. Envie um arquivo PNG, JPEG ou WebP válido.',
      pl: 'Nie udało się zweryfikować dołączonego obrazu. Dołącz prawidłowy plik PNG, JPEG lub WebP.',
      ru: 'Не удалось проверить прикреплённое изображение. Прикрепите корректный PNG, JPEG или WebP.',
    },
  }
  return replies[code]?.[language] || replies.visual_reference_image_invalid[language]
}

function visualPrompt(objective: string, retry: boolean): string {
  return [
    'Create one polished, high-quality original visual for the user request below.',
    'Respect every explicit subject, action, relationship, count, and ordering requirement exactly.',
    'Never substitute, duplicate, clone, merge, omit, or add a requested principal subject.',
    'If the user specifies a count, show exactly that count and no extra foreground people or animals.',
    'Use a style appropriate to the requested format, with strong composition, clear visual hierarchy, and no watermarks.',
    'For an original logo, badge, emblem, insignia, or icon, use a clean centered graphic-design composition rather than an editorial scene.',
    'Do not reconstruct, imitate, or claim to reproduce an existing named brand or team mark from model memory.',
    'Do not add unrelated logos, UI chrome, captions, or unrelated text.',
    'For unnamed people or animals, use an original, non-identifiable depiction.',
    'For a diagram, favor a clean visual layout and simple, legible labels only when essential.',
    retry ? 'STRICT CORRECTION: a prior candidate failed visual verification. Prioritize exact requested content, count, and composition over decoration.' : '',
    '',
    'USER REQUEST:',
    objective,
  ].filter(Boolean).join('\n')
}

function peopleVisualPrompt(objective: string, references: readonly VerifiedPersonReference[], retry: boolean): string {
  const mapping = references.map((reference, index) => `Reference image ${index + 1} is exclusively ${reference.canonicalName}.`).join('\n')
  const names = references.map((reference) => reference.canonicalName).join(' and ')
  return [
    'Create one polished, high-quality synthetic editorial image. It must not be presented as documentary evidence of a real event.',
    mapping,
    `The requested principal people are exactly: ${names}.`,
    `Render exactly ${references.length} distinct principal people, each exactly once.`,
    'Preserve the recognizable facial structure, hair, age presentation, and stable identity traits from each corresponding reference image.',
    'Do not duplicate, clone, merge, average, swap, substitute, omit, or invent any requested person.',
    'Do not use one reference for more than one person. Do not make two principal people look like the same individual.',
    'Unless the user explicitly specifies another arrangement, place the people from left to right in reference-image order.',
    'Change clothing, pose, lighting, and background only as needed to satisfy the requested scene.',
    'Keep all principal faces unobstructed and sufficiently large to remain recognizable. Avoid background faces that resemble the principal people.',
    retry ? 'STRICT CORRECTION: a prior candidate failed identity/count verification. Prioritize exact one-to-one identity mapping over style or background detail.' : '',
    '',
    'USER REQUEST:',
    objective,
  ].filter(Boolean).join('\n')
}

function editVisualPrompt(objective: string, retry: boolean): string {
  return [
    'Edit the supplied source image according to the user request.',
    'Preserve every unedited principal subject, recognizable identity, subject count, pose, framing, and composition.',
    'Never substitute, duplicate, clone, merge, omit, or invent a principal subject.',
    'Do not add extra foreground people, faces, logos, text, or objects unless explicitly requested.',
    retry ? 'STRICT CORRECTION: a prior edit failed source-preservation or requested-change verification. Apply the requested change clearly and preserve everything else.' : '',
    '',
    'USER REQUEST:',
    objective,
  ].filter(Boolean).join('\n')
}

function technicalVerificationFailure(reasons: readonly string[]): boolean {
  return reasons.some((reason) => TECHNICAL_VERIFICATION_REASONS.has(reason))
}

async function createVerifiedPeopleVisual(
  objective: string,
  references: readonly VerifiedPersonReference[],
  traceId: string,
): Promise<{
  generated?: GeneratedImage
  attempts: number
  reasonCodes: readonly string[]
  error?: string
}> {
  let lastError = 'visual_people_generation_failed'
  let lastReasons: readonly string[] = []
  let attempts = 0

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    attempts = attempt + 1
    const generated = await generateReferenceConditionedImage({
      prompt: peopleVisualPrompt(objective, references, attempt > 0),
      size: '1024x1024',
      references,
    })
    if (!generated.ok || !generated.b64 || !generated.mime) {
      lastError = generated.error || 'visual_people_generation_failed'
      lastReasons = ['reference_generation_failed']
      trace(traceId, 'generation-attempt', { attempt: attempts, model: 'black-forest-labs/FLUX-2-max', ok: false, reasonCodes: lastReasons })
      if (/not configured/i.test(lastError)) break
      continue
    }

    const verification = await verifyReferenceConditionedPeopleImage({
      generated: { b64: generated.b64, mime: generated.mime },
      references,
    })
    trace(traceId, 'verification-attempt', {
      attempt: attempts,
      verifier: 'Qwen/Qwen2.5-VL-32B-Instruct',
      ok: verification.ok,
      reasonCodes: verification.reasonCodes,
    })
    if (verification.ok) {
      return { generated: { b64: generated.b64, mime: generated.mime }, attempts, reasonCodes: [] }
    }

    lastError = verification.error || 'visual_people_identity_verification_failed'
    lastReasons = verification.reasonCodes
    if (technicalVerificationFailure(verification.reasonCodes)) break
  }

  return { attempts, reasonCodes: lastReasons, error: lastError }
}

async function createVerifiedGenericVisual(objective: string, traceId: string): Promise<{
  generated?: GeneratedImage
  attempts: number
  reasonCodes: readonly string[]
  error?: string
}> {
  let lastError = 'visual_generation_unavailable'
  let lastReasons: readonly string[] = []
  let attempts = 0

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    attempts = attempt + 1
    const generated: ReferenceConditionedImageResult = await createPlatformImagePort().generate({
      prompt: visualPrompt(objective, attempt > 0),
      size: '1024x1024',
    })
    if (!generated.ok || !generated.b64) {
      lastError = generated.error || 'visual_generation_unavailable'
      lastReasons = ['generation_failed']
      trace(traceId, 'generation-attempt', { attempt: attempts, model: 'platform-image-port', ok: false, reasonCodes: lastReasons })
      if (/not configured/i.test(lastError)) break
      continue
    }

    const candidate = { b64: generated.b64, mime: generated.mime || imageMimeType(generated.b64) }
    const verification = await verifyGeneratedVisualOutput({ objective, generated: candidate })
    trace(traceId, 'verification-attempt', {
      attempt: attempts,
      verifier: verification.model || 'approved-vision-runtime',
      ok: verification.ok,
      reasonCodes: verification.reasonCodes,
    })
    if (verification.ok) return { generated: candidate, attempts, reasonCodes: [] }

    lastError = verification.error || 'visual_output_verification_failed'
    lastReasons = verification.reasonCodes
    if (technicalVerificationFailure(verification.reasonCodes)) break
  }

  return { attempts, reasonCodes: lastReasons, error: lastError }
}

async function createVerifiedEditVisual(
  objective: string,
  reference: UserReferenceImage,
  traceId: string,
): Promise<{
  generated?: GeneratedImage
  attempts: number
  reasonCodes: readonly string[]
  error?: string
}> {
  let lastError = 'visual_reference_edit_failed'
  let lastReasons: readonly string[] = []
  let attempts = 0

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    attempts = attempt + 1
    const generated = await generateReferenceEditedImage({
      prompt: editVisualPrompt(objective, attempt > 0),
      size: '1024x1024',
      reference,
    })
    if (!generated.ok || !generated.b64 || !generated.mime) {
      lastError = generated.error || 'visual_reference_edit_failed'
      lastReasons = ['reference_edit_generation_failed']
      trace(traceId, 'generation-attempt', { attempt: attempts, model: 'black-forest-labs/FLUX-2-max', ok: false, reasonCodes: lastReasons })
      if (/not configured/i.test(lastError)) break
      continue
    }

    const candidate = { b64: generated.b64, mime: generated.mime }
    const verification = await verifyGeneratedVisualOutput({ objective, generated: candidate, reference })
    trace(traceId, 'verification-attempt', {
      attempt: attempts,
      verifier: verification.model || 'approved-vision-runtime',
      ok: verification.ok,
      reasonCodes: verification.reasonCodes,
    })
    if (verification.ok) return { generated: candidate, attempts, reasonCodes: [] }

    lastError = verification.error || 'visual_reference_edit_verification_failed'
    lastReasons = verification.reasonCodes
    if (technicalVerificationFailure(verification.reasonCodes)) break
  }

  return { attempts, reasonCodes: lastReasons, error: lastError }
}

function classifierAudit(classification: VisualRequestClassification): Record<string, unknown> {
  return {
    requestType: classification.requestType,
    confidence: classification.confidence,
    resolvedEntities: classification.referencePeople,
    referenceQuery: classification.referenceQuery || null,
    requiresUserReferenceImage: classification.requiresUserReferenceImage,
    userReferenceImagePresent: classification.userReferenceImagePresent,
  }
}

/** Authenticated Concierge visual tool. It creates or retrieves a downloadable inline visual; it never publishes it. */
export async function POST(request: Request) {
  const traceId = crypto.randomUUID()
  let language: VisualLanguage = 'en'

  const access = await getAccess().catch(() => null)
  if (!access?.userId) {
    trace(traceId, 'final-decision', { decision: 'blocked', reason: 'authentication_required' })
    return NextResponse.json({ error: 'Sign in to create visual files.', trace_id: traceId }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { objective } = readVisualObjective(body)
    language = visualLanguage(objective)
    const userReferencePresent = hasUserReferenceImage(body)
    const classification = classifyVisualRequest({ objective, hasUserReferenceImage: userReferencePresent })

    trace(traceId, 'classifier-decision', {
      objectiveSha256: objectiveFingerprint(objective),
      objectiveLength: objective.length,
      ...(classification ? classifierAudit(classification) : { requestType: null, confidence: 0 }),
    })

    if (!classification) {
      trace(traceId, 'final-decision', { decision: 'blocked', reason: 'visual_request_not_recognised' })
      return NextResponse.json({
        error: 'visual_request_not_recognised',
        reply: 'Describe the visual you want to create or edit.',
        source: 'concierge-visual-unrecognised',
        trace_id: traceId,
        execution_allowed: false,
        external_action_taken: false,
      }, { status: 400 })
    }

    let b64: string
    let mime: ImageMime
    let verifiedReference: VerifiedReferenceVisual | null = null
    let verifiedPeople: VerifiedPersonReference[] = []
    let userReference: UserReferenceImage | null = null
    let generationAttempts = 0
    let reasonCodes: readonly string[] = []
    let modelSelected = 'authoritative-asset'

    if (classification.requestType === 'official-mark') {
      const query = classification.referenceQuery || classification.intent?.referenceQuery || ''
      verifiedReference = await resolveVerifiedReferenceVisual(query)
      trace(traceId, 'reference-resolution', {
        entity: query,
        ok: Boolean(verifiedReference),
        provider: verifiedReference?.provider || null,
        sourcePageUrl: verifiedReference?.sourcePageUrl || null,
      })
      if (!verifiedReference) {
        trace(traceId, 'final-decision', { decision: 'blocked', reason: 'visual_reference_not_verified', failedEntities: [query] })
        return NextResponse.json({
          error: 'visual_reference_not_verified',
          reply: unverifiedReferenceReply(language, query),
          source: 'concierge-visual-reference-unverified',
          trace_id: traceId,
          request_type: classification.requestType,
          failed_entities: [query],
          execution_allowed: false,
          external_action_taken: false,
        }, { status: 422 })
      }
      b64 = verifiedReference.b64
      mime = verifiedReference.mime
    } else if (classification.requestType === 'named-person' || classification.requestType === 'multiple-named-people') {
      const requestedPeople = [...classification.referencePeople].slice(0, 4)
      const resolved = await Promise.all(requestedPeople.map((person) => resolveVerifiedPersonReference(person)))
      const unresolvedPeople = requestedPeople.filter((_person, index) => !resolved[index])
      trace(traceId, 'reference-resolution', {
        requestedEntities: requestedPeople,
        resolvedEntities: resolved.filter(Boolean).map((reference) => reference?.canonicalName),
        failedEntities: unresolvedPeople,
        sources: resolved.filter(Boolean).map((reference) => reference?.sourcePageUrl),
      })
      if (!requestedPeople.length || unresolvedPeople.length) {
        trace(traceId, 'final-decision', { decision: 'blocked', reason: 'visual_person_reference_not_verified', failedEntities: unresolvedPeople })
        return NextResponse.json({
          error: 'visual_person_reference_not_verified',
          reply: unverifiedPeopleReply(language, unresolvedPeople.length ? unresolvedPeople : requestedPeople),
          source: 'concierge-visual-people-reference-unverified',
          trace_id: traceId,
          request_type: classification.requestType,
          execution_allowed: false,
          external_action_taken: false,
          requested_people: requestedPeople,
          failed_entities: unresolvedPeople.length ? unresolvedPeople : requestedPeople,
        }, { status: 422 })
      }

      verifiedPeople = resolved as VerifiedPersonReference[]
      modelSelected = 'black-forest-labs/FLUX-2-max'
      const generated = await createVerifiedPeopleVisual(objective, verifiedPeople, traceId)
      generationAttempts = generated.attempts
      reasonCodes = generated.reasonCodes
      if (!generated.generated) {
        trace(traceId, 'final-decision', {
          decision: 'blocked',
          reason: 'visual_people_identity_verification_failed',
          attempts: generationAttempts,
          reasonCodes,
        })
        return NextResponse.json({
          error: 'visual_people_identity_verification_failed',
          reply: verificationFailureReply(language, true),
          source: 'concierge-visual-people-verification-failed',
          trace_id: traceId,
          request_type: classification.requestType,
          execution_allowed: false,
          external_action_taken: false,
          requested_people: requestedPeople,
          reason_codes: reasonCodes,
          generation_attempts: generationAttempts,
        }, { status: 422 })
      }
      b64 = generated.generated.b64
      mime = generated.generated.mime
    } else if (classification.requestType === 'user-reference-edit') {
      userReference = readUserReferenceImage(body)
      trace(traceId, 'reference-resolution', {
        source: userReference.source,
        name: userReference.name,
        mime: userReference.mime,
        bytes: userReference.size,
        ok: true,
      })
      modelSelected = 'black-forest-labs/FLUX-2-max'
      const generated = await createVerifiedEditVisual(objective, userReference, traceId)
      generationAttempts = generated.attempts
      reasonCodes = generated.reasonCodes
      if (!generated.generated) {
        trace(traceId, 'final-decision', {
          decision: 'blocked',
          reason: 'visual_reference_edit_verification_failed',
          attempts: generationAttempts,
          reasonCodes,
        })
        return NextResponse.json({
          error: 'visual_reference_edit_verification_failed',
          reply: verificationFailureReply(language, false),
          source: 'concierge-visual-reference-edit-verification-failed',
          trace_id: traceId,
          request_type: classification.requestType,
          execution_allowed: false,
          external_action_taken: false,
          reason_codes: reasonCodes,
          generation_attempts: generationAttempts,
        }, { status: 422 })
      }
      b64 = generated.generated.b64
      mime = generated.generated.mime
    } else {
      modelSelected = 'platform-image-port'
      const generated = await createVerifiedGenericVisual(objective, traceId)
      generationAttempts = generated.attempts
      reasonCodes = generated.reasonCodes
      if (!generated.generated) {
        trace(traceId, 'final-decision', {
          decision: 'blocked',
          reason: 'visual_output_verification_failed',
          attempts: generationAttempts,
          reasonCodes,
        })
        return NextResponse.json({
          error: 'visual_output_verification_failed',
          reply: verificationFailureReply(language, false),
          source: 'concierge-visual-verification-failed',
          trace_id: traceId,
          request_type: classification.requestType,
          execution_allowed: false,
          external_action_taken: false,
          reason_codes: reasonCodes,
          generation_attempts: generationAttempts,
        }, { status: 422 })
      }
      b64 = generated.generated.b64
      mime = generated.generated.mime
    }

    const workspace = createSupabaseBuilderWorkspace(access.userId)
    if (!workspace) {
      trace(traceId, 'final-decision', { decision: 'blocked', reason: 'visual_storage_unavailable' })
      return NextResponse.json({ error: 'visual_storage_unavailable', trace_id: traceId }, { status: 503 })
    }

    const workspaceId = crypto.randomUUID()
    await workspace.ensureWorkspace(workspaceId)
    const filename = classification.filename.replace(/png$/i, extensionFor(mime))
    await workspace.writeFile(workspaceId, filename, `artifact-image-base64:${mime}:${b64}`)

    const isPeopleVisual = verifiedPeople.length > 0
    const isEdit = Boolean(userReference)
    const isGenerated = !verifiedReference
    const source = isPeopleVisual
      ? 'concierge-visual-reference-people'
      : isEdit
        ? 'concierge-visual-reference-edit'
        : verifiedReference
          ? 'concierge-visual-reference'
          : 'concierge-visual'

    trace(traceId, 'final-decision', {
      decision: 'delivered',
      requestType: classification.requestType,
      modelSelected,
      generationAttempts,
      workspaceId,
      filename,
    })

    return NextResponse.json({
      reply: isPeopleVisual
        ? peopleReply(language)
        : isEdit
          ? editedReply(language)
          : verifiedReference
            ? referenceReply(language)
            : generatedReply(language),
      source,
      trace_id: traceId,
      request_type: classification.requestType,
      classifier_confidence: classification.confidence,
      model_selected: modelSelected,
      workspaceId,
      files: [filename],
      execution_allowed: true,
      external_action_taken: false,
      external_retrieval_used: Boolean(verifiedReference || isPeopleVisual),
      synthetic_media: isGenerated,
      generated_visual_label: isGenerated ? 'AI-generated visual' : undefined,
      identity_reference_used: isPeopleVisual,
      identity_verification_passed: isPeopleVisual ? true : undefined,
      user_reference_used: isEdit,
      output_verification_passed: true,
      generation_attempts: isGenerated ? generationAttempts : 0,
      resolved_entities: isPeopleVisual
        ? verifiedPeople.map((reference) => reference.canonicalName)
        : verifiedReference
          ? [classification.referenceQuery]
          : classification.referencePeople,
      reference: verifiedReference ? {
        title: verifiedReference.title,
        provider: verifiedReference.provider,
        sourcePageUrl: verifiedReference.sourcePageUrl,
      } : undefined,
      references: isPeopleVisual ? verifiedPeople.map((reference) => ({
        canonicalName: reference.canonicalName,
        title: reference.title,
        provider: reference.provider,
        sourcePageUrl: reference.sourcePageUrl,
      })) : undefined,
      user_reference: userReference ? {
        name: userReference.name,
        mime: userReference.mime,
        size: userReference.size,
        source: userReference.source,
      } : undefined,
    })
  } catch (error) {
    if (isVisualObjectiveError(error)) {
      console.warn('[visual_objective_rejected]', {
        traceId,
        code: error.code,
        source: error.source,
        observedLength: error.observedLength,
        maxLength: error.maxLength,
      })
      trace(traceId, 'final-decision', { decision: 'blocked', reason: error.code })
      return NextResponse.json({
        error: error.code,
        reply: error.code === 'visual_objective_required'
          ? 'Describe the visual you want to create or edit.'
          : `Visual instructions can be up to ${error.maxLength.toLocaleString('en-US')} characters. Shorten the request and try again.`,
        source: 'concierge-visual-objective-rejected',
        trace_id: traceId,
        execution_allowed: false,
        external_action_taken: false,
        objective_source: error.source,
        observed_length: error.observedLength,
        max_length: error.maxLength,
      }, { status: 400 })
    }

    if (isUserReferenceImageError(error)) {
      trace(traceId, 'final-decision', {
        decision: 'blocked',
        reason: error.code,
        observedBytes: error.observedBytes,
        declaredMime: error.declaredMime,
      })
      return NextResponse.json({
        error: error.code,
        reply: userReferenceFailureReply(language, error.code),
        source: 'concierge-visual-reference-image-rejected',
        trace_id: traceId,
        request_type: 'user-reference-edit',
        execution_allowed: false,
        external_action_taken: false,
        observed_bytes: error.observedBytes,
        max_bytes: error.maxBytes,
        declared_mime: error.declaredMime,
      }, { status: 422 })
    }

    const message = error instanceof Error ? error.message : 'visual_request_failed'
    const status = /^visual_request/.test(message) ? 400 : 502
    trace(traceId, 'final-decision', { decision: 'blocked', reason: message, status })
    return NextResponse.json({ error: message, trace_id: traceId }, { status })
  }
}
