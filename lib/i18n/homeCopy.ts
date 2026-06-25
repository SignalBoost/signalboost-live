// saas/lib/i18n/homeCopy.ts
// Localized copy for the homepage hero (security / auditing pivot).
// Flat dotted-path keys consumed by lib/i18n/t.ts as a fallback source,
// exactly like DASHBOARD_COPY / PLATFORM_COPY / SUITE_COPY / WORKSPACE_COPY.
// Appended as its own namespace — no existing keys are touched.

type FlatCopy = Record<string, string>

export const HOME_COPY: Record<string, FlatCopy> = {
  en: {
    'home.hero.marquee': 'Audit · Build · Review · Broadcast',
    'home.hero.title': 'Audit every repo. Trace every vulnerability. Map every control.',
    'home.hero.subtitle':
      'SignalBoost continuously audits your repositories and infrastructure, traces vulnerabilities to their source, and maps your posture to SOC 2, ISO 27001, NIST, and CIS — automatically.',
    'home.features.audit': 'Repository audits',
  },
  es: {
    'home.hero.marquee': 'Auditar · Crear · Reseñar · Difundir',
    'home.hero.title': 'Audita cada repositorio. Rastrea cada vulnerabilidad. Mapea cada control.',
    'home.hero.subtitle':
      'SignalBoost audita continuamente tus repositorios e infraestructura, rastrea las vulnerabilidades hasta su origen y mapea tu postura a SOC 2, ISO 27001, NIST y CIS — automáticamente.',
    'home.features.audit': 'Auditoría de repositorios',
  },
  pt: {
    'home.hero.marquee': 'Auditar · Criar · Avaliar · Transmitir',
    'home.hero.title': 'Audite cada repositório. Rastreie cada vulnerabilidade. Mapeie cada controle.',
    'home.hero.subtitle':
      'A SignalBoost audita continuamente seus repositórios e infraestrutura, rastreia as vulnerabilidades até a origem e mapeia sua postura para SOC 2, ISO 27001, NIST e CIS — automaticamente.',
    'home.features.audit': 'Auditoria de repositórios',
  },
  pl: {
    'home.hero.marquee': 'Audyt · Tworzenie · Recenzja · Transmisja',
    'home.hero.title': 'Audytuj każde repozytorium. Śledź każdą podatność. Mapuj każdą kontrolę.',
    'home.hero.subtitle':
      'SignalBoost nieprzerwanie audytuje Twoje repozytoria i infrastrukturę, śledzi podatności do ich źródła i mapuje Twój stan zgodności do SOC 2, ISO 27001, NIST i CIS — automatycznie.',
    'home.features.audit': 'Audyt repozytoriów',
  },
  ru: {
    'home.hero.marquee': 'Аудит · Создание · Обзор · Трансляция',
    'home.hero.title': 'Аудит каждого репозитория. Отслеживание каждой уязвимости. Карта каждого контроля.',
    'home.hero.subtitle':
      'SignalBoost непрерывно проверяет ваши репозитории и инфраструктуру, отслеживает уязвимости до источника и сопоставляет ваше состояние с SOC 2, ISO 27001, NIST и CIS — автоматически.',
    'home.features.audit': 'Аудит репозиториев',
  },
}
