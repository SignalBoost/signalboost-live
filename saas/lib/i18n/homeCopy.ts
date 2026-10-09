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
  de: {
    'home.hero.marquee': 'Prüfen · Erstellen · Bewerten · Senden',
    'home.hero.title': 'Jedes Repository prüfen. Jede Schwachstelle zurückverfolgen. Jede Kontrolle zuordnen.',
    'home.hero.subtitle':
      'SignalBoost prüft Ihre Repositories und Ihre Infrastruktur kontinuierlich, verfolgt Schwachstellen bis zu ihrem Ursprung zurück und ordnet Ihre Sicherheitslage SOC 2, ISO 27001, NIST und CIS zu – automatisch.',
    'home.features.audit': 'Repository-Audits',
  },
  fr: {
    'home.hero.marquee': 'Auditer · Créer · Évaluer · Diffuser',
    'home.hero.title': 'Auditez chaque dépôt. Tracez chaque vulnérabilité. Cartographiez chaque contrôle.',
    'home.hero.subtitle':
      'SignalBoost audite en continu vos dépôts et votre infrastructure, remonte les vulnérabilités jusqu’à leur source et associe votre posture à SOC 2, ISO 27001, NIST et CIS — automatiquement.',
    'home.features.audit': 'Audits de dépôts',
  },
  it: {
    'home.hero.marquee': 'Verifica · Crea · Recensisci · Trasmetti',
    'home.hero.title': 'Verifica ogni repository. Traccia ogni vulnerabilità. Mappa ogni controllo.',
    'home.hero.subtitle':
      'SignalBoost verifica continuamente i tuoi repository e la tua infrastruttura, traccia le vulnerabilità fino all’origine e mappa la tua postura su SOC 2, ISO 27001, NIST e CIS, in modo automatico.',
    'home.features.audit': 'Audit dei repository',
  },
  ja: {
    'home.hero.marquee': '監査 · 構築 · レビュー · 配信',
    'home.hero.title': 'すべてのリポジトリを監査。すべての脆弱性を追跡。すべての統制をマッピング。',
    'home.hero.subtitle':
      'SignalBoostはリポジトリとインフラを継続的に監査し、脆弱性を発生源まで追跡し、セキュリティ体制をSOC 2、ISO 27001、NIST、CISに自動でマッピングします。',
    'home.features.audit': 'リポジトリ監査',
  },
  ko: {
    'home.hero.marquee': '감사 · 구축 · 리뷰 · 배포',
    'home.hero.title': '모든 저장소를 감사하고, 모든 취약점을 추적하고, 모든 통제 항목을 매핑하세요.',
    'home.hero.subtitle':
      'SignalBoost는 저장소와 인프라를 지속적으로 감사하고, 취약점을 근원까지 추적하며, 보안 태세를 SOC 2, ISO 27001, NIST, CIS에 자동으로 매핑합니다.',
    'home.features.audit': '저장소 감사',
  },
  ar: {
    'home.hero.marquee': 'تدقيق · بناء · مراجعة · بث',
    'home.hero.title': 'دقّق كل مستودع. تتبّع كل ثغرة. اربط كل ضابط رقابي.',
    'home.hero.subtitle':
      'يدقّق SignalBoost باستمرار مستودعاتك وبنيتك التحتية، ويتتبّع الثغرات حتى مصدرها، ويربط وضعك الأمني بمعايير SOC 2 وISO 27001 وNIST وCIS — تلقائيًا.',
    'home.features.audit': 'تدقيق المستودعات',
  },
}
