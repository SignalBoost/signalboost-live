// saas/lib/cos-marketing-sales/translationBlocks.ts
// Translation block contract for COS Marketing + Sales.
// Generated scripts, outreach copy, and product copy should move through these
// key-based blocks before rendering or before external audio/email providers.

import type { CosLocale } from './types'

export type CosCopyNamespace = 'audio' | 'outreach' | 'schema' | 'ui' | 'error'

export type CosCopyKey =
  | 'cos.audio.title.fiveMinuteTechBrief'
  | 'cos.audio.segment.intro'
  | 'cos.audio.segment.hostDialogue'
  | 'cos.audio.segment.explanation'
  | 'cos.audio.segment.midRollSignalBoostPro'
  | 'cos.audio.segment.cta'
  | 'cos.audio.segment.outro'
  | 'cos.outreach.subject.auditSignal'
  | 'cos.outreach.body.auditSignal'
  | 'cos.outreach.subject.securityBrief'
  | 'cos.outreach.body.securityBrief'
  | 'cos.error.rawTextOrSecurityBriefRequired'

export type CosTranslationVariables = Record<string, string | number | boolean>

export type CosTranslationBlock = {
  key: CosCopyKey
  namespace: CosCopyNamespace
  locale: CosLocale
  variables: CosTranslationVariables
  fallbackText: string
}

export const COS_AUDIO_COPY_KEYS: CosCopyKey[] = [
  'cos.audio.title.fiveMinuteTechBrief',
  'cos.audio.segment.intro',
  'cos.audio.segment.hostDialogue',
  'cos.audio.segment.explanation',
  'cos.audio.segment.midRollSignalBoostPro',
  'cos.audio.segment.cta',
  'cos.audio.segment.outro',
]

export const COS_COPY_FALLBACKS: Record<CosCopyKey, Record<CosLocale, string>> = {
  'cos.audio.title.fiveMinuteTechBrief': {
    en: 'Five-minute tech brief',
    es: 'Resumen tecnológico de cinco minutos',
    'pt-BR': 'Resumo técnico de cinco minutos',
    pl: 'Pięciominutowy brief technologiczny',
    ru: 'Пятиминутный технологический бриф',
  },
  'cos.audio.segment.intro': {
    en: 'Today we are looking at {topic} and what it means for practical business growth.',
    es: 'Hoy revisamos {topic} y lo que significa para el crecimiento práctico del negocio.',
    'pt-BR': 'Hoje analisamos {topic} e o que isso significa para crescimento prático do negócio.',
    pl: 'Dzisiaj omawiamy {topic} i jego znaczenie dla praktycznego wzrostu firmy.',
    ru: 'Сегодня мы рассматриваем {topic} и его значение для практического роста бизнеса.',
  },
  'cos.audio.segment.hostDialogue': {
    en: '{brief}',
    es: '{brief}',
    'pt-BR': '{brief}',
    pl: '{brief}',
    ru: '{brief}',
  },
  'cos.audio.segment.explanation': {
    en: 'The important point is not only the finding, but the next approved action the owner can take.',
    es: 'Lo importante no es solo el hallazgo, sino la próxima acción aprobada que el propietario puede tomar.',
    'pt-BR': 'O ponto importante não é apenas a constatação, mas a próxima ação aprovada que o proprietário pode tomar.',
    pl: 'Ważny jest nie tylko wynik, ale następne zatwierdzone działanie właściciela.',
    ru: 'Важно не только замечание, но и следующий утверждённый шаг владельца.',
  },
  'cos.audio.segment.midRollSignalBoostPro': {
    en: 'Mid-roll: SignalBoost Pro at $199 per month helps teams turn scans, briefs, and outreach ideas into approved action plans.',
    es: 'Mid-roll: SignalBoost Pro por 199 dólares al mes ayuda a convertir revisiones, briefs e ideas de outreach en planes aprobados.',
    'pt-BR': 'Mid-roll: O SignalBoost Pro por 199 dólares por mês ajuda equipes a transformar scans, briefs e ideias de outreach em planos aprovados.',
    pl: 'Mid-roll: SignalBoost Pro za 199 dolarów miesięcznie pomaga zespołom zmieniać skany, briefy i pomysły outreach w zatwierdzone plany.',
    ru: 'Mid-roll: SignalBoost Pro за 199 долларов в месяц помогает командам превращать scans, briefs и outreach ideas в утверждённые планы.',
  },
  'cos.audio.segment.cta': {
    en: 'The next step is to review the signal, approve the best fix, and turn it into outreach or a customer-facing improvement.',
    es: 'El siguiente paso es revisar la señal, aprobar la mejor corrección y convertirla en outreach o mejora para el cliente.',
    'pt-BR': 'O próximo passo é revisar o sinal, aprovar a melhor correção e transformá-la em outreach ou melhoria para o cliente.',
    pl: 'Następny krok to sprawdzić sygnał, zatwierdzić najlepszą poprawkę i zmienić ją w outreach albo ulepszenie dla klienta.',
    ru: 'Следующий шаг — проверить сигнал, утвердить лучшее исправление и превратить его в outreach или улучшение для клиента.',
  },
  'cos.audio.segment.outro': {
    en: 'That is the quick brief. Keep the workflow practical, measurable, and owner-approved.',
    es: 'Ese fue el resumen rápido. Mantén el flujo práctico, medible y aprobado por el propietario.',
    'pt-BR': 'Esse foi o resumo rápido. Mantenha o fluxo prático, mensurável e aprovado pelo proprietário.',
    pl: 'To był krótki brief. Proces powinien być praktyczny, mierzalny i zatwierdzany przez właściciela.',
    ru: 'Это был короткий бриф. Рабочий процесс должен быть практичным, измеримым и утверждённым владельцем.',
  },
  'cos.outreach.subject.auditSignal': {
    en: 'A quick SignalBoost audit signal for {company}',
    es: 'Una señal rápida de auditoría SignalBoost para {company}',
    'pt-BR': 'Um sinal rápido de auditoria SignalBoost para {company}',
    pl: 'Szybki sygnał audytu SignalBoost dla {company}',
    ru: 'Быстрый audit signal SignalBoost для {company}',
  },
  'cos.outreach.body.auditSignal': {
    en: 'We found a practical signal worth reviewing. Nothing changes without approval.',
    es: 'Encontramos una señal práctica que vale la pena revisar. Nada cambia sin aprobación.',
    'pt-BR': 'Encontramos um sinal prático que vale a pena revisar. Nada muda sem aprovação.',
    pl: 'Znaleźliśmy praktyczny sygnał wart przeglądu. Nic nie zmienia się bez akceptacji.',
    ru: 'Мы нашли практический сигнал для проверки. Ничего не меняется без утверждения.',
  },
  'cos.outreach.subject.securityBrief': {
    en: 'Localized security brief for {company}',
    es: 'Brief de seguridad localizado para {company}',
    'pt-BR': 'Brief de segurança localizado para {company}',
    pl: 'Lokalny brief bezpieczeństwa dla {company}',
    ru: 'Локализованный security brief для {company}',
  },
  'cos.outreach.body.securityBrief': {
    en: 'This brief turns the signal into an owner-approved next step.',
    es: 'Este brief convierte la señal en un próximo paso aprobado por el propietario.',
    'pt-BR': 'Este brief transforma o sinal em um próximo passo aprovado pelo proprietário.',
    pl: 'Ten brief zmienia sygnał w następny krok zatwierdzony przez właściciela.',
    ru: 'Этот brief превращает сигнал в следующий шаг с утверждением владельца.',
  },
  'cos.error.rawTextOrSecurityBriefRequired': {
    en: 'rawText or securityBrief is required.',
    es: 'rawText o securityBrief es obligatorio.',
    'pt-BR': 'rawText ou securityBrief é obrigatório.',
    pl: 'rawText albo securityBrief jest wymagane.',
    ru: 'Требуется rawText или securityBrief.',
  },
}

function normalizeLocale(locale?: string): CosLocale {
  if (locale === 'es' || locale === 'pt-BR' || locale === 'pl' || locale === 'ru') return locale
  return 'en'
}

function applyVariables(template: string, variables: CosTranslationVariables) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => String(variables[key] ?? ''))
}

export function buildCosTranslationBlock(params: {
  key: CosCopyKey
  namespace: CosCopyNamespace
  locale?: string
  variables?: CosTranslationVariables
}): CosTranslationBlock {
  const locale = normalizeLocale(params.locale)
  const variables = params.variables || {}
  const fallback = COS_COPY_FALLBACKS[params.key]?.[locale] || COS_COPY_FALLBACKS[params.key]?.en || params.key
  return {
    key: params.key,
    namespace: params.namespace,
    locale,
    variables,
    fallbackText: applyVariables(fallback, variables),
  }
}

export function resolveCosTranslationBlock(block: CosTranslationBlock, dictionary?: Record<string, string>) {
  const dictionaryValue = dictionary?.[block.key]
  return applyVariables(dictionaryValue || block.fallbackText, block.variables)
}
