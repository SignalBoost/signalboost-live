// saas/lib/cos-marketing-sales/salesOutreachManager.ts
// Mock-safe outreach planning router. It prepares an owner-reviewable cadence;
// it does not send, publish, or contact anyone directly.

import type { CosLocale, FollowUpMilestone, LeadCapture, OutreachDispatchRecord, OutreachPlan, OutreachStep } from './types'
import { checkDomainContactLimit } from './contactLimiter'

const SUBJECTS: Record<CosLocale, string[]> = {
  en: ['Your quick website/data signal', 'A short multilingual brief for your team', 'Interactive demo proposal'],
  es: ['Tu señal rápida de sitio/datos', 'Un breve resumen multilingüe para tu equipo', 'Propuesta de demo interactiva'],
  'pt-BR': ['Seu sinal rápido de site/dados', 'Um breve resumo multilíngue para sua equipe', 'Proposta de demo interativa'],
  pl: ['Szybki sygnał strony/danych', 'Krótki wielojęzyczny brief dla zespołu', 'Propozycja interaktywnego demo'],
  ru: ['Быстрый сигнал по сайту/данным', 'Краткий многоязычный бриф для команды', 'Предложение интерактивного demo'],
}

const BODY: Record<CosLocale, string[]> = {
  en: [
    'We prepared a quick public signal you can review without sharing private access.',
    'Here is a short brief explaining the opportunity in business language for your team.',
    'If useful, the next step is a short interactive demo focused on your site, outreach, and conversion workflow.',
  ],
  es: [
    'Preparamos una señal pública rápida que puedes revisar sin compartir acceso privado.',
    'Aquí tienes un breve resumen que explica la oportunidad en lenguaje de negocio para tu equipo.',
    'Si te sirve, el siguiente paso es una demo interactiva corta enfocada en tu sitio, outreach y conversión.',
  ],
  'pt-BR': [
    'Preparamos um sinal público rápido que você pode revisar sem compartilhar acesso privado.',
    'Aqui está um breve resumo explicando a oportunidade em linguagem de negócios para sua equipe.',
    'Se fizer sentido, o próximo passo é uma demo interativa curta focada no seu site, outreach e conversão.',
  ],
  pl: [
    'Przygotowaliśmy szybki publiczny sygnał, który można sprawdzić bez udostępniania prywatnego dostępu.',
    'Oto krótki brief opisujący możliwość językiem biznesowym dla Twojego zespołu.',
    'Jeżeli to pomocne, następnym krokiem jest krótkie interaktywne demo skupione na stronie, outreachu i konwersji.',
  ],
  ru: [
    'Мы подготовили быстрый публичный сигнал, который можно проверить без приватного доступа.',
    'Вот краткий бриф, объясняющий возможность бизнес-языком для вашей команды.',
    'Если это полезно, следующий шаг — короткое интерактивное demo по сайту, outreach и конверсии.',
  ],
}

const CADENCE: Array<{ dayOffset: number; milestone: FollowUpMilestone }> = [
  { dayOffset: 0, milestone: 'personalized_audit_link' },
  { dayOffset: 3, milestone: 'multilingual_brief' },
  { dayOffset: 7, milestone: 'interactive_demo_offer' },
]

function normalizeLocale(locale?: string): CosLocale {
  if (locale === 'es' || locale === 'pt-BR' || locale === 'pl' || locale === 'ru') return locale
  return 'en'
}

function leadWithDefaults(input: Partial<LeadCapture> & { email: string }): LeadCapture {
  const now = new Date().toISOString()
  const domain = input.domain || input.email.split('@').pop()?.toLowerCase() || 'unknown'
  return {
    id: input.id || crypto.randomUUID(),
    email: input.email.toLowerCase(),
    name: input.name,
    company: input.company,
    domain,
    source: input.source || 'manual_import',
    status: input.status || 'new',
    locale: normalizeLocale(input.locale),
    country: input.country,
    tags: input.tags || [],
    score: input.score ?? 0,
    notes: input.notes,
    followUpMilestones: input.followUpMilestones || [],
    createdAt: input.createdAt || now,
    updatedAt: now,
    workspaceId: input.workspaceId,
  }
}

export class SalesOutreachManager {
  createValueDropCadence(params: {
    lead: Partial<LeadCapture> & { email: string }
    history?: OutreachDispatchRecord[]
  }): OutreachPlan {
    const lead = leadWithDefaults(params.lead)
    const locale = normalizeLocale(lead.locale)
    const domainThrottle = checkDomainContactLimit({ recipientEmail: lead.email, history: params.history || [] })
    const subjects = SUBJECTS[locale] || SUBJECTS.en
    const bodies = BODY[locale] || BODY.en

    const cadence: OutreachStep[] = CADENCE.map((item, index) => ({
      id: crypto.randomUUID(),
      milestone: item.milestone,
      channel: 'email',
      dayOffset: item.dayOffset,
      status: domainThrottle.allowed ? 'requires_owner_approval' : 'blocked_by_domain_throttle',
      subject: subjects[index] || subjects[0] || 'SignalBoost follow-up',
      body: bodies[index] || bodies[0] || 'Owner approval is required before any external action.',
      reason: domainThrottle.allowed ? 'Owner approval required before any external action.' : domainThrottle.reason,
    }))

    return {
      lead: { ...lead, status: domainThrottle.allowed ? 'warming' : 'tagged' },
      domainThrottle,
      cadence,
      nextAction: domainThrottle.allowed ? 'Review and approve Step 1 before any contact is made.' : 'Wait for the domain contact window to reset or manually review the lead.',
      requiresApproval: true,
    }
  }
}

export const salesOutreachManager = new SalesOutreachManager()
