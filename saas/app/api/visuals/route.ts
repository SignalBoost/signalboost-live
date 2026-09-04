import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { blockedGoal, completedGoal, partialGoal } from '@/lib/ai/cos/goalCompletion'
import { createPlatformImagePort } from '@/lib/cos/aiPort'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { detectConciergeVisualIntent } from '@/lib/visuals/intent'
import { resolveVerifiedReferenceVisual, type VerifiedReferenceVisual } from '@/lib/visuals/referenceAssets'
import {
  resolveVerifiedPersonReferenceWithRecovery,
  type VerifiedPersonReference,
} from '@/lib/visuals/personReferences'
import { generateReferenceConditionedImage, type ReferenceConditionedImageResult } from '@/lib/visuals/referenceImageGeneration'
import { verifyReferenceConditionedPeopleImage } from '@/lib/visuals/personImageVerification'
import { isVisualObjectiveError, readVisualObjective } from '@/lib/visuals/request-contract'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_PEOPLE_GENERATION_ATTEMPTS = 2
const GUEST_VISUAL_TRIAL_LIMIT = 1
const GUEST_VISUAL_TRIAL_WINDOW_HOURS = 24
const GUEST_VISUAL_TRIAL_ROUTE = 'concierge_visual_guest_trial'

type VisualLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp'

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
  if (/[ąćęłńóśźż]/i.test(value) || /\b(?:narysuj|stworz|zrob|zaprojektuj|druzyny|pilkarskiej)\b/i.test(value)) return 'pl'
  if (/\b(?:dibuja|dibujar|dibuje|crea|crear|genera|generar|disena|disenar|blason|equipo|futbol)\b/i.test(value)) return 'es'
  if (/\b(?:faça|faca|desenhe|desenhar|desenha|crie|criar|gere|gerar|imagem|distintivo|brasao|futebol|time|equipe|presidente)\b/i.test(value)) return 'pt'
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

function peopleReply(language: VisualLanguage): string {
  return {
    en: 'Created a synthetic illustration using verified references for the requested people. It is shown below and ready to download.',
    es: 'Creé una ilustración sintética usando referencias verificadas de las personas solicitadas. Aparece abajo y está lista para descargar.',
    pt: 'Criei uma ilustração sintética usando referências verificadas das pessoas solicitadas. Ela aparece abaixo e está pronta para baixar.',
    pl: 'Utworzyłem syntetyczną ilustrację z użyciem zweryfikowanych wzorców wskazanych osób. Jest pokazana poniżej i gotowa do pobrania.',
    ru: 'Создана синтетическая иллюстрация с использованием проверенных изображений указанных людей. Она показана ниже и готова к скачиванию.',
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

function unverifiedPeopleReply(language: VisualLanguage, unresolvedPeople: readonly string[]): string {
  const names = unresolvedPeople.filter(Boolean).join(', ')
  return {
    en: names
      ? `I tried the available verified-reference searches, but I still could not verify ${names}. Please provide the full name or a reference image for the unresolved person.`
      : 'I could not determine which named people require verified references. Please provide their full names.',
    es: names
      ? `Probé las búsquedas disponibles de referencias verificadas, pero aún no pude verificar a ${names}. Proporciona el nombre completo o una imagen de referencia de la persona pendiente.`
      : 'No pude determinar qué personas nombradas requieren referencias verificadas. Proporciona sus nombres completos.',
    pt: names
      ? `Tentei as buscas disponíveis de referências verificadas, mas ainda não consegui verificar ${names}. Envie o nome completo ou uma imagem de referência da pessoa pendente.`
      : 'Não consegui determinar quais pessoas citadas exigem referências verificadas. Envie os nomes completos.',
    pl: names
      ? `Sprawdziłem dostępne źródła zweryfikowanych zdjęć, ale nadal nie udało się potwierdzić osoby: ${names}. Podaj pełne imię i nazwisko lub prześlij zdjęcie wzorcowe.`
      : 'Nie udało się ustalić, które wskazane osoby wymagają zweryfikowanych wzorców. Podaj ich pełne imiona i nazwiska.',
    ru: names
      ? `Я проверил доступные источники подтверждённых изображений, но всё ещё не удалось подтвердить: ${names}. Укажите полное имя или пришлите изображение-образец.`
      : 'Не удалось определить, для каких названных людей нужны подтверждённые изображения. Укажите полные имена.',
  }[language]
}

function peopleVerificationFailureReply(language: VisualLanguage): string {
  return {
    en: 'The generated scene did not preserve every requested identity distinctly, so I blocked it instead of showing a substituted or duplicated person. You can provide clearer reference images or simplify the scene and try again.',
    es: 'La escena generada no conservó claramente todas las identidades solicitadas, así que la bloqueé en vez de mostrar una persona sustituida o duplicada. Puedes proporcionar referencias más claras o simplificar la escena e intentarlo de nuevo.',
    pt: 'A cena gerada não preservou claramente todas as identidades solicitadas, então eu a bloqueei em vez de mostrar uma pessoa substituída ou duplicada. Você pode enviar referências mais claras ou simplificar a cena e tentar novamente.',
    pl: 'Wygenerowana scena nie zachowała wyraźnie wszystkich wskazanych tożsamości, więc została zablokowana zamiast pokazania osoby zastąpionej lub zduplikowanej. Możesz przesłać wyraźniejsze wzorce albo uprościć scenę i spróbować ponownie.',
    ru: 'Сгенерированная сцена не сохранила каждую запрошенную личность отдельно, поэтому она была заблокирована, а не показана с заменённым или дублированным человеком. Можно прислать более чёткие образцы или упростить сцену и повторить попытку.',
  }[language]
}

function guestTrialUsedReply(language: VisualLanguage): string {
  return {
    en: 'You have used today’s free visual trial. Sign up to create and save more visuals.',
    es: 'Ya usaste la prueba visual gratuita de hoy. Regístrate para crear y guardar más imágenes.',
    pt: 'Você já usou o teste visual gratuito de hoje. Cadastre-se para criar e salvar mais imagens.',
    pl: 'Dzisiejsza bezpłatna próba tworzenia obrazu została już wykorzystana. Zarejestruj się, aby tworzyć i zapisywać kolejne obrazy.',
    ru: 'Сегодняшняя бесплатная пробная генерация уже использована. Зарегистрируйтесь, чтобы создавать и сохранять другие изображения.',
  }[language]
}

function guestTrialLimitResponse(language: VisualLanguage): NextResponse {
  return NextResponse.json({
    error: 'guest_visual_trial_used',
    reply: guestTrialUsedReply(language),
    source: 'concierge-visual-guest-trial-limit',
    signup_required: true,
    execution_allowed: false,
    external_action_taken: false,
    goal_completion: blockedGoal(
      ['anonymous_visual_trial_limit_reached'],
      ['authenticated_visual_access'],
      'ask_user',
    ),
  }, { status: 429 })
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') || ''
  return forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
}

async function reserveGuestVisualTrial(request: Request): Promise<boolean> {
  try {
    const admin = getAdminSupabase()
    const identifier = clientIp(request)
    const since = new Date(Date.now() - GUEST_VISUAL_TRIAL_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
    const { count, error } = await admin
      .from('api_rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('route_key', GUEST_VISUAL_TRIAL_ROUTE)
      .eq('identifier', identifier)
      .gte('created_at', since)
    if (error || (count || 0) >= GUEST_VISUAL_TRIAL_LIMIT) return false
    const { error: insertError } = await admin.from('api_rate_limit_events').insert({ route_key: GUEST_VISUAL_TRIAL_ROUTE, identifier })
    return !insertError
  } catch {
    // Guest generation is a paid provider action. If durable metering is unavailable,
    // fail closed instead of opening an unmetered anonymous path.
    return false
  }
}

function visualPrompt(objective: string): string {
  return [
    'Create one polished, high-quality original visual for the user request below.',
    'Use a style appropriate to the requested format, with strong composition, clear visual hierarchy, and no watermarks.',
    'For an original logo, badge, emblem, insignia, or icon, use a clean centered graphic-design composition rather than an editorial scene.',
    'Do not reconstruct, imitate, or claim to reproduce an existing named brand or team mark from model memory.',
    'Do not add unrelated logos, UI chrome, or unrelated text.',
    'For unnamed people or animals, use an original, non-identifiable depiction.',
    'For a diagram, favor a clean visual layout and simple, legible labels only when essential.',
    '',
    'USER REQUEST:',
    objective,
  ].join('\n')
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

async function createVerifiedPeopleVisual(objective: string, references: readonly VerifiedPersonReference[]): Promise<{
  generated?: { b64: string; mime: ImageMime }
  attempts: number
  reasonCodes: readonly string[]
  error?: string
}> {
  let lastError = 'visual_people_generation_failed'
  let lastReasons: readonly string[] = []
  let attempts = 0

  for (let attempt = 0; attempt < MAX_PEOPLE_GENERATION_ATTEMPTS; attempt += 1) {
    attempts = attempt + 1
    const generated = await generateReferenceConditionedImage({
      prompt: peopleVisualPrompt(objective, references, attempt > 0),
      size: '1024x1024',
      references,
    })
    if (!generated.ok || !generated.b64 || !generated.mime) {
      lastError = generated.error || 'visual_people_generation_failed'
      lastReasons = ['reference_generation_failed']
      if (/not configured/i.test(lastError)) break
      continue
    }

    const verification = await verifyReferenceConditionedPeopleImage({
      generated: { b64: generated.b64, mime: generated.mime },
      references,
    })
    if (verification.ok) {
      return { generated: { b64: generated.b64, mime: generated.mime }, attempts: attempt + 1, reasonCodes: [] }
    }

    lastError = verification.error || 'visual_people_identity_verification_failed'
    lastReasons = verification.reasonCodes
    if (verification.reasonCodes.some((reason) => [
      'verification_runtime_unavailable',
      'verification_transport_failure',
      'verification_timeout',
      'verification_invalid_response',
      'verification_invalid_schema',
    ].includes(reason))) break
  }

  return { attempts, reasonCodes: lastReasons, error: lastError }
}

/** Concierge visual tool. Guests receive one metered inline trial; members also receive private durable storage. */
export async function POST(request: Request) {
  const access = await getAccess().catch(() => null)

  try {
    const body = await request.json().catch(() => ({}))
    const { objective } = readVisualObjective(body)
    const language = visualLanguage(objective)
    const intent = detectConciergeVisualIntent(objective)
    if (!intent) {
      return NextResponse.json({
        error: 'visual_request_not_recognised',
        goal_completion: blockedGoal([], ['visual_intent'], 'ask_user'),
      }, { status: 400 })
    }
    const guestTrial = !access?.userId

    let b64: string
    let mime: ImageMime
    let verifiedReference: VerifiedReferenceVisual | null = null
    let verifiedPeople: VerifiedPersonReference[] = []
    let peopleGenerationAttempts = 0
    let personReferenceAttempts = 0

    if (intent.mode === 'reference-mark') {
      verifiedReference = await resolveVerifiedReferenceVisual(intent.referenceQuery || '')
      if (!verifiedReference) {
        return NextResponse.json({
          error: 'visual_reference_not_verified',
          reply: unverifiedReferenceReply(language),
          source: 'concierge-visual-reference-unverified',
          execution_allowed: false,
          external_action_taken: false,
          goal_completion: blockedGoal(
            ['verified_reference_lookup_exhausted'],
            ['reference_mark'],
            'ask_user',
          ),
        }, { status: 422 })
      }
      if (guestTrial && !(await reserveGuestVisualTrial(request))) return guestTrialLimitResponse(language)
      b64 = verifiedReference.b64
      mime = verifiedReference.mime
    } else if (intent.mode === 'reference-people') {
      const requestedPeople = [...(intent.referencePeople || [])].slice(0, 4)
      const resolutions = await Promise.all(requestedPeople.map((person) => resolveVerifiedPersonReferenceWithRecovery(person)))
      personReferenceAttempts = resolutions.reduce((total, resolution) => total + resolution.attempts, 0)
      const unresolvedPeople = requestedPeople.filter((_, index) => !resolutions[index]?.reference)

      if (!requestedPeople.length || unresolvedPeople.length > 0) {
        const unresolved = unresolvedPeople.length > 0 ? unresolvedPeople : ['named_people_not_detected']
        return NextResponse.json({
          error: 'visual_person_reference_not_verified',
          reply: unverifiedPeopleReply(language, unresolvedPeople),
          source: 'concierge-visual-people-reference-unverified',
          execution_allowed: false,
          external_action_taken: false,
          requested_people: requestedPeople,
          unresolved_people: unresolvedPeople,
          reference_lookup_attempts: personReferenceAttempts,
          goal_completion: blockedGoal(
            ['verified_reference_search_exhausted'],
            unresolved.map((person) => person === 'named_people_not_detected' ? person : `reference:${person}`),
            'ask_user',
            { attempts: personReferenceAttempts },
          ),
        }, { status: 422 })
      }

      verifiedPeople = resolutions.map((resolution) => resolution.reference) as VerifiedPersonReference[]
      if (guestTrial && !(await reserveGuestVisualTrial(request))) return guestTrialLimitResponse(language)
      const generated = await createVerifiedPeopleVisual(objective, verifiedPeople)
      peopleGenerationAttempts = generated.attempts
      if (!generated.generated) {
        return NextResponse.json({
          error: 'visual_people_identity_verification_failed',
          reply: peopleVerificationFailureReply(language),
          source: 'concierge-visual-people-verification-failed',
          execution_allowed: false,
          external_action_taken: false,
          requested_people: requestedPeople,
          reason_codes: generated.reasonCodes,
          goal_completion: blockedGoal(
            ['identity_references_verified', 'visual_identity_verification_failed'],
            ['identity_preservation'],
            'ask_user',
            { attempts: personReferenceAttempts + peopleGenerationAttempts },
          ),
        }, { status: 422 })
      }
      b64 = generated.generated.b64
      mime = generated.generated.mime
    } else {
      if (guestTrial && !(await reserveGuestVisualTrial(request))) return guestTrialLimitResponse(language)
      const generated: ReferenceConditionedImageResult = await createPlatformImagePort().generate({ prompt: visualPrompt(objective), size: '1024x1024' })
      if (!generated.ok || !generated.b64) {
        return NextResponse.json({
          error: generated.error || 'visual_generation_unavailable',
          goal_completion: blockedGoal([], ['visual_generation'], 'wait'),
        }, { status: 503 })
      }
      b64 = generated.b64
      mime = imageMimeType(generated.b64)
    }

    const filename = intent.filename.replace(/png$/i, extensionFor(mime))
    if (guestTrial) {
      const dataUrl = `data:${mime};base64,${b64}`
      const isPeopleVisual = verifiedPeople.length > 0
      return NextResponse.json({
        reply: isPeopleVisual ? peopleReply(language) : verifiedReference ? referenceReply(language) : generatedReply(language),
        source: isPeopleVisual ? 'concierge-visual-reference-people-guest-trial' : verifiedReference ? 'concierge-visual-reference-guest-trial' : 'concierge-visual-guest-trial',
        visual: { previewUrl: dataUrl, downloadUrl: dataUrl, filename, alt: objective },
        trial: { kind: 'anonymous_visual', remaining: 0, signup_required_for_more: true },
        execution_allowed: true,
        external_action_taken: false,
        external_retrieval_used: Boolean(verifiedReference || isPeopleVisual),
        synthetic_media: isPeopleVisual,
        identity_reference_used: isPeopleVisual,
        identity_verification_passed: isPeopleVisual,
        generation_attempts: isPeopleVisual ? peopleGenerationAttempts : undefined,
        reference_lookup_attempts: isPeopleVisual ? personReferenceAttempts : undefined,
        goal_completion: completedGoal(
          isPeopleVisual
            ? ['identity_references_verified', 'visual_identity_verification_passed', 'visual_delivered_inline']
            : verifiedReference
              ? ['reference_verified', 'visual_delivered_inline']
              : ['visual_generated', 'visual_delivered_inline'],
          { attempts: isPeopleVisual ? personReferenceAttempts + peopleGenerationAttempts : 1 },
        ),
      })
    }

    const workspace = createSupabaseBuilderWorkspace(access.userId!)
    if (!workspace) {
      return NextResponse.json({
        error: 'visual_storage_unavailable',
        goal_completion: partialGoal(
          ['visual_generated'],
          ['durable_visual_storage'],
          'wait',
        ),
      }, { status: 503 })
    }

    const workspaceId = crypto.randomUUID()
    await workspace.ensureWorkspace(workspaceId)
    await workspace.writeFile(workspaceId, filename, `artifact-image-base64:${mime}:${b64}`)

    const isPeopleVisual = verifiedPeople.length > 0
    return NextResponse.json({
      reply: isPeopleVisual ? peopleReply(language) : verifiedReference ? referenceReply(language) : generatedReply(language),
      source: isPeopleVisual ? 'concierge-visual-reference-people' : verifiedReference ? 'concierge-visual-reference' : 'concierge-visual',
      workspaceId,
      files: [filename],
      execution_allowed: true,
      external_action_taken: false,
      external_retrieval_used: Boolean(verifiedReference || isPeopleVisual),
      synthetic_media: isPeopleVisual,
      identity_reference_used: isPeopleVisual,
      identity_verification_passed: isPeopleVisual,
      generation_attempts: isPeopleVisual ? peopleGenerationAttempts : undefined,
      reference_lookup_attempts: isPeopleVisual ? personReferenceAttempts : undefined,
      goal_completion: completedGoal(
        isPeopleVisual
          ? ['identity_references_verified', 'visual_identity_verification_passed', 'visual_saved']
          : verifiedReference
            ? ['reference_verified', 'visual_saved']
            : ['visual_generated', 'visual_saved'],
        { attempts: isPeopleVisual ? personReferenceAttempts + peopleGenerationAttempts : 1 },
      ),
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
    })
  } catch (error) {
    if (isVisualObjectiveError(error)) {
      console.warn('[visual_objective_rejected]', {
        code: error.code,
        source: error.source,
        observedLength: error.observedLength,
        maxLength: error.maxLength,
      })
      return NextResponse.json({
        error: error.code,
        reply: error.code === 'visual_objective_required'
          ? 'Describe the visual you want to create.'
          : `Visual instructions can be up to ${error.maxLength.toLocaleString('en-US')} characters. Shorten the request and try again.`,
        source: 'concierge-visual-objective-rejected',
        execution_allowed: false,
        external_action_taken: false,
        objective_source: error.source,
        observed_length: error.observedLength,
        max_length: error.maxLength,
        goal_completion: blockedGoal([], ['valid_visual_objective'], 'ask_user'),
      }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : 'visual_request_failed'
    const status = /^visual_request/.test(message) ? 400 : 502
    return NextResponse.json({
      error: message,
      goal_completion: blockedGoal([], ['visual_request'], status === 400 ? 'ask_user' : 'wait'),
    }, { status })
  }
}
