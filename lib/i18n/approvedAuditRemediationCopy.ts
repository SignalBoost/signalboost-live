// Exact translations for owner-approved Audit Console remediation findings.
// English remains the component fallback; these catalogs cover ES/PT/PL/RU.
const COPY: Record<string, Record<string, string>> = {
  es: {
    'No dead cards: every subsystem links here with state, root cause, routing mode, and approval gate.': 'Sin tarjetas inactivas: cada subsistema se enlaza aquí con su estado, causa raíz, modo de enrutamiento y control de aprobación.',
    'Raw performance, regional reach, and milestone-ready notifications': 'Rendimiento sin procesar, alcance regional y notificaciones listas para hitos',
  },
  pt: {
    'No dead cards: every subsystem links here with state, root cause, routing mode, and approval gate.': 'Sem cartões inativos: cada subsistema está vinculado aqui com estado, causa raiz, modo de roteamento e controle de aprovação.',
    'Raw performance, regional reach, and milestone-ready notifications': 'Desempenho bruto, alcance regional e notificações prontas para marcos',
  },
  pl: {
    'No dead cards: every subsystem links here with state, root cause, routing mode, and approval gate.': 'Brak martwych kart: każdy podsystem jest tutaj połączony ze stanem, przyczyną źródłową, trybem routingu i bramką zatwierdzania.',
    'Raw performance, regional reach, and milestone-ready notifications': 'Surowe wyniki, zasięg regionalny i powiadomienia gotowe na kamienie milowe',
  },
  ru: {
    'No dead cards: every subsystem links here with state, root cause, routing mode, and approval gate.': 'Без неработающих карточек: каждая подсистема связана здесь с состоянием, первопричиной, режимом маршрутизации и шлюзом одобрения.',
    'Raw performance, regional reach, and milestone-ready notifications': 'Исходные показатели, региональный охват и уведомления о готовности к ключевым этапам',
  },
}

export function approvedAuditRemediationText(lang: string, fallback: string): string | null {
  return COPY[lang]?.[fallback] ?? null
}
