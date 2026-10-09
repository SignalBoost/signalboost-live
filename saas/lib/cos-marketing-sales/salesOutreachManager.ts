// saas/lib/cos-marketing-sales/salesOutreachManager.ts
// Mock-safe outreach planning router. It prepares an owner-reviewable cadence;
// it does not send, publish, or contact anyone directly.

import type { CosLocale, FollowUpMilestone, LeadCapture, OutreachDispatchRecord, OutreachPlan, OutreachStep } from './types.ts'
import { checkDomainContactLimit } from './contactLimiter.ts'

const SUBJECTS: Record<CosLocale, string[]> = {
  en: ['Your quick website/data signal', 'A short multilingual brief for your team', 'Interactive demo proposal'],
  es: ['Tu señal rápida de sitio/datos', 'Un breve resumen multilingüe para tu equipo', 'Propuesta de demo interactiva'],
  'pt-BR': ['Seu sinal rápido de site/dados', 'Um breve resumo multilíngue para sua equipe', 'Proposta de demo interativa'],
  pl: ['Szybki sygnał strony/danych', 'Krótki wielojęzyczny brief dla zespołu', 'Propozycja interaktywnego demo'],
  ru: ['Быстрый сигнал по сайту/данным', 'Краткий многоязычный бриф для команды', 'Предложение интерактивного demo'],
  de: ['Ihr schnelles Website-/Daten-Signal', 'Ein kurzes mehrsprachiges Briefing für Ihr Team', 'Vorschlag für eine interaktive Demo'],
  fr: ['Votre signal rapide site/données', 'Un bref résumé multilingue pour votre équipe', 'Proposition de démo interactive'],
  it: ['Il tuo segnale rapido sito/dati', 'Un breve riepilogo multilingue per il tuo team', 'Proposta di demo interattiva'],
  ja: ['Webサイト/データのクイックシグナル', 'チーム向けの短い多言語ブリーフ', 'インタラクティブデモのご提案'],
  ko: ['웹사이트/데이터 빠른 신호', '팀을 위한 간단한 다국어 브리핑', '인터랙티브 데모 제안'],
  ar: ['مؤشرك السريع للموقع/البيانات', 'موجز قصير متعدد اللغات لفريقك', 'مقترح عرض توضيحي تفاعلي'],
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
  de: [
    'Wir haben ein schnelles öffentliches Signal vorbereitet, das Sie prüfen können, ohne privaten Zugang zu teilen.',
    'Hier ist eine kurze Übersicht, die die Chance in geschäftlicher Sprache für Ihr Team erläutert.',
    'Falls hilfreich, wäre der nächste Schritt eine kurze interaktive Demo zu Ihrer Website, Ihrem Outreach und Ihrem Conversion-Workflow.',
  ],
  fr: [
    'Nous avons préparé un signal public rapide que vous pouvez consulter sans partager d’accès privé.',
    'Voici une courte note qui présente l\'opportunité en langage métier pour votre équipe.',
    'Si cela vous est utile, la prochaine étape est une courte démo interactive centrée sur votre site, votre prospection et votre parcours de conversion.',
  ],
  it: [
    'Abbiamo preparato un segnale pubblico rapido che puoi esaminare senza condividere accessi privati.',
    'Ecco un breve documento che spiega l\'opportunità in linguaggio di business per il tuo team.',
    'Se ti è utile, il passo successivo è una breve demo interattiva incentrata sul tuo sito, sull\'outreach e sul flusso di conversione.',
  ],
  ja: [
    '非公開のアクセス権を共有せずに確認できる、公開情報に基づくクイックシグナルをご用意しました。',
    'チーム向けに、この機会をビジネスの言葉で説明した簡潔な概要をご用意しました。',
    'ご関心があれば、次のステップとして、貴社のサイト、アウトリーチ、コンバージョンのワークフローに焦点を当てた短いインタラクティブデモをご案内します。',
  ],
  ko: [
    '비공개 액세스를 공유하지 않고도 검토할 수 있는 빠른 공개 신호를 준비했습니다.',
    '팀을 위해 이 기회를 비즈니스 언어로 설명한 간단한 요약을 준비했습니다.',
    '도움이 된다면, 다음 단계로 귀사의 사이트, 아웃리치, 전환 워크플로에 초점을 맞춘 짧은 인터랙티브 데모를 진행하세요.',
  ],
  ar: [
    'أعددنا مؤشرًا عامًا سريعًا يمكنك مراجعته دون مشاركة أي وصول خاص.',
    'إليك ملخصًا موجزًا يشرح الفرصة بلغة الأعمال لفريقك.',
    'إذا كان ذلك مفيدًا، فالخطوة التالية هي عرض تفاعلي قصير يركّز على موقعك والتواصل وسير عمل التحويل.',
  ],
}

const CADENCE: Array<{ dayOffset: number; milestone: FollowUpMilestone }> = [
  { dayOffset: 0, milestone: 'personalized_audit_link' },
  { dayOffset: 3, milestone: 'multilingual_brief' },
  { dayOffset: 7, milestone: 'interactive_demo_offer' },
]

function normalizeLocale(locale?: string): CosLocale {
  if (locale === 'es' || locale === 'pt-BR' || locale === 'pl' || locale === 'ru' || locale === 'de' || locale === 'fr' || locale === 'it' || locale === 'ja' || locale === 'ko' || locale === 'ar') return locale
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
      subject: subjects[index] || subjects[0] || 'Follow-up',
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
