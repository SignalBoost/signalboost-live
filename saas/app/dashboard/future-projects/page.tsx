// saas/app/dashboard/future-projects/page.tsx
'use client'

import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

type ProjectCopy = {
  eyebrow: string
  title: string
  subtitle: string
  status: string
  badge: string
  projectTitle: string
  projectSummary: string
  goalTitle: string
  goal: string
  agentsTitle: string
  agents: Array<{ name: string; description: string }>
  humanTitle: string
  humanSteps: string[]
  automationTitle: string
  automationSteps: string[]
  boundaryTitle: string
  boundary: string
  futureTitle: string
  future: string
}

type FutureIdeaCopy = {
  status: string
  badge: string
  title: string
  summary: string
  reasonTitle: string
  reason: string
  firstVersionTitle: string
  firstVersion: string[]
  decisionTitle: string
  decision: string
}

const COPY: Record<Language, ProjectCopy> = {
  en: {
    eyebrow: uiText('generatedUi.u_92375f997ffe65ab'),
    title: uiText('generatedUi.u_04d04dbee162ea6d'),
    subtitle: uiText('generatedUi.u_1a89fd23594015a9'),
    status: 'Concept — future build',
    badge: uiText('generatedUi.u_e69601364bdac76e'),
    projectTitle: uiText('generatedUi.u_3be08ed96f555110'),
    projectSummary: uiText('generatedUi.u_9fe55e4439773677'),
    goalTitle: uiText('generatedUi.u_cdbf6975e8a35b0d'),
    goal: uiText('generatedUi.u_bfdba87b5cf21a45'),
    agentsTitle: uiText('generatedUi.u_b3f38e2fe92276b3'),
    agents: [
      { name: uiText('generatedUi.u_9075c530f34fd906'), description: uiText('generatedUi.u_4051a2d2412f543c') },
      { name: uiText('generatedUi.u_1708af0ba3272ae0'), description: uiText('generatedUi.u_74e6b1edda1dfbbd') },
      { name: uiText('generatedUi.u_adca0ebb1ca7cd39'), description: uiText('generatedUi.u_72238b44d1ca378f') },
      { name: uiText('generatedUi.u_f0f3047a6f7c9840'), description: uiText('generatedUi.u_7eb81fdd60d4e6f5') },
    ],
    humanTitle: uiText('generatedUi.u_cb730300340b979f'),
    humanSteps: [uiText('generatedUi.u_ffd7ab156583edd2'), uiText('generatedUi.u_638faa3ad9ba8f0b'), uiText('generatedUi.u_726f32ce8699fdfe'), uiText('generatedUi.u_36efbfb046708215')],
    automationTitle: uiText('generatedUi.u_2c7fbd8dcaf4348e'),
    automationSteps: [uiText('generatedUi.u_0e5ec72a83292ed8'), uiText('generatedUi.u_5b42b455dca44044'), uiText('generatedUi.u_39de626bb0bd42fc'), uiText('generatedUi.u_c16f0537966ff2e5'), uiText('generatedUi.u_509329ae163bd070'), uiText('generatedUi.u_922786d6d93f8a93')],
    boundaryTitle: uiText('generatedUi.u_06422ea030934819'),
    boundary: uiText('generatedUi.u_5d38a63e69c6704d'),
    futureTitle: uiText('generatedUi.u_49a7d09f0847dabc'),
    future: uiText('generatedUi.u_6ba36aa8182c1157'),
  },
  es: {
    eyebrow: 'Hoja de ruta',
    title: 'Proyectos futuros',
    subtitle: 'Conceptos considerados para el desarrollo futuro de SignalBoost. Estos proyectos todavía no son funciones activas de producción.',
    status: 'Concepto — desarrollo futuro',
    badge: 'FUTURO',
    projectTitle: 'Gateway de conexión de plataformas con IA',
    projectSummary: 'Un sistema con gateway guiado, copiloto de navegador, agente OAuth y automatización de plataformas para ayudar a conectar servicios como Facebook, Instagram, Reddit, TikTok, LinkedIn, YouTube, Telegram y WeChat.',
    goalTitle: 'Objetivo',
    goal: 'Reducir la configuración al mínimo paso de aprobación humana requerido y después automatizar el trabajo permitido mediante APIs oficiales y tokens gestionados de forma segura.',
    agentsTitle: 'Agentes propuestos',
    agents: [
      { name: 'Agente Gateway', description: 'Coordina la incorporación, explica requisitos y guía al usuario por cada etapa de conexión.' },
      { name: 'Copiloto de navegador', description: 'Guía al usuario por las pantallas del proveedor, destaca la siguiente acción y explica errores sin eludir controles de seguridad.' },
      { name: 'Agente OAuth', description: 'Gestiona el intercambio, almacenamiento cifrado, validación de permisos, renovación, salud de conexión y webhooks compatibles después de la aprobación.' },
      { name: 'Agente de automatización', description: 'Usa APIs aprobadas para publicar, programar, recopilar analítica, gestionar comentarios, apoyar outreach y ejecutar flujos permitidos.' },
    ],
    humanTitle: 'Límite de aprobación humana',
    humanSteps: ['Iniciar sesión con el proveedor', 'Completar CAPTCHA, verificación de identidad o 2FA', 'Aceptar términos del proveedor o desarrollador', 'Pulsar Permitir o Conceder acceso cuando se requiera consentimiento'],
    automationTitle: 'Lo que SignalBoost podría automatizar después',
    automationSteps: ['Validar y renovar tokens', 'Comprobar permisos y salud de conexión', 'Configurar webhooks compatibles', 'Publicar y programar contenido', 'Recopilar analítica y comentarios', 'Ejecutar campañas y flujos de outreach permitidos'],
    boundaryTitle: 'Límite de seguridad y políticas',
    boundary: 'El proyecto debe usar autorización y APIs oficiales. No debe automatizar credenciales, eludir CAPTCHA o 2FA, suplantar el consentimiento ni evadir restricciones de la plataforma.',
    futureTitle: 'Nota de planificación',
    future: 'Antes de implementarlo, cada proveedor requerirá una revisión separada porque los pasos de aprobación, duración de tokens, permisos, revisión de aplicaciones y automatizaciones permitidas varían.',
  },
  pt: {
    eyebrow: 'Roteiro',
    title: 'Projetos futuros',
    subtitle: 'Conceitos considerados para o desenvolvimento futuro do SignalBoost. Estes projetos ainda não são recursos ativos de produção.',
    status: 'Conceito — desenvolvimento futuro',
    badge: 'FUTURO',
    projectTitle: 'Gateway de conexão de plataformas com IA',
    projectSummary: 'Um sistema com gateway guiado, copiloto de navegador, agente OAuth e automação de plataformas para ajudar usuários a conectar Facebook, Instagram, Reddit, TikTok, LinkedIn, YouTube, Telegram e WeChat.',
    goalTitle: 'Objetivo',
    goal: 'Reduzir a configuração ao menor passo obrigatório de aprovação humana e depois automatizar o trabalho permitido por APIs oficiais e tokens gerenciados com segurança.',
    agentsTitle: 'Agentes propostos',
    agents: [
      { name: 'Agente Gateway', description: 'Coordena o onboarding, explica requisitos e conduz o usuário por cada etapa da conexão.' },
      { name: 'Copiloto de navegador', description: 'Guia o usuário pelas telas do provedor, destaca a próxima ação e explica erros sem contornar controles de segurança.' },
      { name: 'Agente OAuth', description: 'Gerencia troca, armazenamento criptografado, validação de escopos, renovação, saúde da conexão e webhooks suportados após a aprovação.' },
      { name: 'Agente de automação', description: 'Usa APIs aprovadas para publicar, agendar, coletar análises, gerenciar comentários, apoiar outreach e executar fluxos permitidos.' },
    ],
    humanTitle: 'Limite de aprovação humana',
    humanSteps: ['Entrar no provedor', 'Concluir CAPTCHA, verificação de identidade ou 2FA', 'Aceitar termos do provedor ou desenvolvedor', 'Clicar em Permitir ou Conceder acesso quando o consentimento for exigido'],
    automationTitle: 'O que o SignalBoost poderia automatizar depois',
    automationSteps: ['Validar e renovar tokens', 'Verificar escopos e saúde da conexão', 'Configurar webhooks suportados', 'Publicar e agendar conteúdo', 'Coletar análises e comentários', 'Executar campanhas e fluxos de outreach permitidos'],
    boundaryTitle: 'Limite de segurança e políticas',
    boundary: 'O projeto deve usar autorização e APIs oficiais. Não deve automatizar credenciais, contornar CAPTCHA ou 2FA, representar consentimento do usuário ou evitar restrições da plataforma.',
    futureTitle: 'Nota de planejamento',
    future: 'Antes da implementação, cada provedor precisará de uma análise separada porque aprovação, duração de tokens, escopos, revisão de aplicativos e automações permitidas variam por plataforma.',
  },
  pl: {
    eyebrow: 'Plan rozwoju',
    title: 'Przyszłe projekty',
    subtitle: 'Koncepcje rozważane do przyszłego rozwoju SignalBoost. Nie są to jeszcze aktywne funkcje produkcyjne.',
    status: 'Koncepcja — przyszła realizacja',
    badge: 'PRZYSZŁOŚĆ',
    projectTitle: 'Bramka połączeń platformowych AI',
    projectSummary: 'System obejmujący prowadzoną bramkę, asystenta przeglądarki, agenta OAuth i automatyzację platform, pomagający łączyć Facebook, Instagram, Reddit, TikTok, LinkedIn, YouTube, Telegram i WeChat.',
    goalTitle: 'Cel',
    goal: 'Ograniczyć konfigurację do najmniejszego wymaganego kroku zatwierdzenia przez człowieka, a następnie automatyzować dozwolone działania przez oficjalne API i bezpiecznie zarządzane tokeny.',
    agentsTitle: 'Proponowani agenci',
    agents: [
      { name: 'Agent Gateway', description: 'Koordynuje onboarding, wyjaśnia wymagania i prowadzi użytkownika przez kolejne etapy połączenia.' },
      { name: 'Asystent przeglądarki', description: 'Prowadzi przez ekrany dostawcy, wskazuje następny krok i wyjaśnia błędy bez omijania zabezpieczeń.' },
      { name: 'Agent OAuth', description: 'Po zatwierdzeniu obsługuje wymianę tokenów, szyfrowane przechowywanie, zakresy, odświeżanie, stan połączenia i obsługiwane webhooki.' },
      { name: 'Agent automatyzacji platformy', description: 'Korzysta z zatwierdzonych API do publikacji, planowania, analityki, komentarzy, outreachu i dozwolonych procesów.' },
    ],
    humanTitle: 'Granica zatwierdzenia przez człowieka',
    humanSteps: ['Zalogowanie się u dostawcy', 'Ukończenie CAPTCHA, weryfikacji tożsamości lub 2FA', 'Akceptacja warunków dostawcy lub programu deweloperskiego', 'Kliknięcie Zezwól lub Przyznaj dostęp, gdy wymagana jest zgoda'],
    automationTitle: 'Co SignalBoost mógłby automatyzować później',
    automationSteps: ['Walidacja i odświeżanie tokenów', 'Sprawdzanie zakresów i stanu połączenia', 'Konfiguracja obsługiwanych webhooków', 'Publikowanie i planowanie treści', 'Pobieranie analityki i komentarzy', 'Prowadzenie dozwolonych kampanii i outreachu'],
    boundaryTitle: 'Granica bezpieczeństwa i zasad',
    boundary: 'Projekt musi używać oficjalnej autoryzacji i API. Nie może automatyzować wpisywania danych logowania, omijać CAPTCHA lub 2FA, udawać zgody użytkownika ani obchodzić ograniczeń platform.',
    futureTitle: 'Uwaga planistyczna',
    future: 'Przed wdrożeniem każdy dostawca wymaga osobnej analizy, ponieważ różnią się zatwierdzenia, ważność tokenów, zakresy, przegląd aplikacji i dozwolone automatyzacje.',
  },
  ru: {
    eyebrow: 'План развития',
    title: 'Будущие проекты',
    subtitle: 'Концепции для будущего развития SignalBoost. Эти проекты пока не являются активными производственными функциями.',
    status: 'Концепция — будущая разработка',
    badge: 'БУДУЩЕЕ',
    projectTitle: 'Шлюз подключения платформ с ИИ',
    projectSummary: 'Система из управляемого шлюза, браузерного помощника, OAuth-агента и агента автоматизации для подключения Facebook, Instagram, Reddit, TikTok, LinkedIn, YouTube, Telegram и WeChat.',
    goalTitle: 'Цель',
    goal: 'Свести настройку к минимальному обязательному подтверждению человеком, а затем автоматизировать разрешённую работу через официальные API и безопасно управляемые токены.',
    agentsTitle: 'Предлагаемые агенты',
    agents: [
      { name: 'Gateway Agent', description: 'Координирует подключение, объясняет требования и ведёт пользователя по этапам.' },
      { name: 'Браузерный помощник', description: 'Проводит по экранам провайдера, показывает следующий шаг и объясняет ошибки без обхода защиты.' },
      { name: 'OAuth-агент', description: 'После подтверждения управляет обменом и защищённым хранением токенов, областями доступа, обновлением, состоянием подключения и поддерживаемыми вебхуками.' },
      { name: 'Агент автоматизации', description: 'Использует одобренные API для публикации, планирования, аналитики, комментариев, outreach и разрешённых процессов.' },
    ],
    humanTitle: 'Граница подтверждения человеком',
    humanSteps: ['Войти на платформу провайдера', 'Пройти CAPTCHA, проверку личности или 2FA', 'Принять условия провайдера или разработчика', 'Нажать Разрешить или Предоставить доступ, когда требуется согласие'],
    automationTitle: 'Что SignalBoost сможет автоматизировать после этого',
    automationSteps: ['Проверять и обновлять токены', 'Проверять области доступа и состояние подключения', 'Настраивать поддерживаемые вебхуки', 'Публиковать и планировать контент', 'Собирать аналитику и комментарии', 'Запускать разрешённые кампании и outreach-процессы'],
    boundaryTitle: 'Граница безопасности и правил',
    boundary: 'Проект должен использовать официальную авторизацию и API. Он не должен автоматизировать ввод учётных данных, обходить CAPTCHA или 2FA, подменять согласие пользователя или обходить ограничения платформ.',
    futureTitle: 'Примечание по планированию',
    future: 'До реализации для каждого провайдера потребуется отдельная проверка: различаются этапы одобрения, срок действия токенов, области доступа, проверка приложений и разрешённая автоматизация.',
  },
  de: {
    eyebrow: 'Roadmap',
    title: 'Zukünftige Projekte',
    subtitle: 'Konzepte, die für die künftige Entwicklung von SignalBoost in Betracht gezogen werden. Diese Projekte sind noch keine aktiven Produktionsfunktionen.',
    status: 'Konzept – zukünftige Entwicklung',
    badge: 'ZUKUNFT',
    projectTitle: 'Verbindungs-Gateway für KI-Plattformen',
    projectSummary: 'Ein geführtes Gateway, ein Browser-Copilot, ein OAuth-Agent und ein Plattform-Automatisierungssystem, das Benutzern hilft, Dienste wie Facebook, Instagram, Reddit, TikTok, LinkedIn, YouTube, Telegram und WeChat zu verbinden.',
    goalTitle: 'Ziel',
    goal: 'Reduzieren Sie die Plattformeinrichtung auf den kleinstmöglichen erforderlichen Genehmigungsschritt durch einen Menschen und automatisieren Sie dann unterstützte Arbeiten über offizielle APIs und sicher verwaltete Tokens.',
    agentsTitle: 'Vorgeschlagene Agenten',
    agents: [
      { name: 'Gateway-Agent', description: 'Koordiniert das Onboarding, erklärt Anforderungen und führt den Benutzer durch jede Verbindungsphase.' },
      { name: 'Browser-Copilot', description: 'Führt den Benutzer durch die Anbieterbildschirme, hebt die nächste Aktion hervor und erklärt Fehler, ohne Sicherheitskontrollen zu umgehen.' },
      { name: 'OAuth-Agent', description: 'Übernimmt nach der Genehmigung Token-Austausch, verschlüsselte Speicherung, Scope-Validierung, Aktualisierung, Verbindungszustand und die unterstützte Webhook-Einrichtung.' },
      { name: 'Plattform-Automatisierungsagent', description: 'Nutzt genehmigte APIs, um zu veröffentlichen, zu planen, Analysedaten zu erfassen, Kommentare zu verwalten, Outreach zu unterstützen und zulässige Workflows auszuführen.' },
    ],
    humanTitle: 'Grenze der menschlichen Genehmigung',
    humanSteps: ['Beim Anbieter anmelden', 'CAPTCHA, Identitätsprüfungen oder 2FA abschließen', 'Anbieter- oder Entwicklerbedingungen akzeptieren', 'Klicken Sie auf „Zulassen“ oder „Zugriff gewähren“, wenn eine Einwilligung erforderlich ist'],
    automationTitle: 'Was SignalBoost anschließend automatisieren könnte',
    automationSteps: ['Tokens validieren und aktualisieren', 'Berechtigungsumfänge und Verbindungsstatus prüfen', 'Unterstützte Webhooks konfigurieren', 'Inhalte veröffentlichen und planen', 'Analysen und Kommentare sammeln', 'Zulässige Kampagnen und Outreach-Workflows ausführen'],
    boundaryTitle: 'Sicherheits- und Richtliniengrenze',
    boundary: 'Das Projekt muss die offizielle Autorisierung und die APIs des Anbieters verwenden. Es darf weder die Eingabe von Anmeldedaten automatisieren, CAPTCHA oder 2FA umgehen, die Zustimmung von Nutzern vortäuschen noch Plattformbeschränkungen umgehen.',
    futureTitle: 'Planungsnotiz',
    future: 'Vor der Implementierung benötigt jeder Anbieter eine separate Funktionsprüfung, da Genehmigungsschritte, Token-Laufzeiten, Scopes, App-Review-Anforderungen und zulässige Automatisierung je nach Plattform unterschiedlich sind.',
  },
  fr: {
    eyebrow: 'Feuille de route',
    title: 'Projets futurs',
    subtitle: 'Concepts envisagés pour le développement futur de SignalBoost. Ces projets ne sont pas encore des fonctionnalités de production actives.',
    status: 'Concept — développement futur',
    badge: 'AVENIR',
    projectTitle: 'Passerelle de connexion aux plateformes d’IA',
    projectSummary: 'Une passerelle guidée, un copilote de navigateur, un agent OAuth et un système d’automatisation de plateforme qui aident les utilisateurs à connecter des services tels que Facebook, Instagram, Reddit, TikTok, LinkedIn, YouTube, Telegram et WeChat.',
    goalTitle: 'Objectif',
    goal: 'Réduisez la configuration de la plateforme à la plus petite étape d’approbation humaine requise, puis automatisez les tâches prises en charge via les API officielles et des jetons gérés de manière sécurisée.',
    agentsTitle: 'Agents proposés',
    agents: [
      { name: 'Agent passerelle', description: 'Coordonne l’intégration, explique les prérequis et guide l’utilisateur à chaque étape de connexion.' },
      { name: 'Copilote de navigateur', description: 'Guide l\'utilisateur à travers les écrans du fournisseur, met en évidence l\'action suivante et explique les erreurs sans contourner les contrôles de sécurité.' },
      { name: 'Agent OAuth', description: 'Gère, après approbation, l\'échange de jetons, le stockage chiffré, la validation des scopes, l\'actualisation, l\'état de la connexion et la configuration des webhooks pris en charge.' },
      { name: 'Agent d\'automatisation de la plateforme', description: 'Utilise des API approuvées pour publier, planifier, collecter des analyses, gérer les commentaires, soutenir la prospection et exécuter les workflows autorisés.' },
    ],
    humanTitle: 'Limite d’approbation humaine',
    humanSteps: ['Se connecter avec le fournisseur', 'Effectuer les CAPTCHA, vérifications d’identité ou 2FA', 'Accepter les conditions du fournisseur ou du développeur', 'Cliquez sur Autoriser ou Accorder l’accès lorsqu’un consentement est requis'],
    automationTitle: 'Ce que SignalBoost pourrait automatiser ensuite',
    automationSteps: ['Valider et actualiser les jetons', 'Vérifier les portées et l’état de la connexion', 'Configurer les webhooks pris en charge', 'Publier et planifier du contenu', 'Collecter les analyses et les commentaires', 'Exécuter les campagnes et workflows de prospection autorisés'],
    boundaryTitle: 'Limite de sécurité et de politique',
    boundary: 'Le projet doit utiliser l’autorisation et les API officielles du fournisseur. Il ne doit pas automatiser la saisie d’identifiants, contourner les CAPTCHA ou la 2FA, usurper le consentement de l’utilisateur ni éluder les restrictions de la plateforme.',
    futureTitle: 'Note de planification',
    future: 'Avant la mise en œuvre, chaque fournisseur nécessitera un examen distinct de ses capacités, car les étapes d\'approbation, la durée de vie des jetons, les scopes, les exigences de revue d\'application et l\'automatisation autorisée diffèrent selon la plateforme.',
  },
  it: {
    eyebrow: 'Roadmap',
    title: 'Progetti futuri',
    subtitle: 'Concept presi in considerazione per lo sviluppo futuro di SignalBoost. Questi progetti non sono ancora funzionalità di produzione attive.',
    status: 'Concept — sviluppo futuro',
    badge: 'FUTURO',
    projectTitle: 'Gateway di connessione alle piattaforme AI',
    projectSummary: 'Un gateway guidato, un copilota per il browser, un agente OAuth e un sistema di automazione della piattaforma che aiuta gli utenti a collegare servizi come Facebook, Instagram, Reddit, TikTok, LinkedIn, YouTube, Telegram e WeChat.',
    goalTitle: 'Obiettivo',
    goal: 'Riduci la configurazione della piattaforma al minimo passaggio di approvazione umana richiesto, poi automatizza le attività supportate tramite API ufficiali e token gestiti in modo sicuro.',
    agentsTitle: 'Agenti proposti',
    agents: [
      { name: 'Agente gateway', description: 'Coordina l’onboarding, spiega i requisiti e guida l’utente attraverso ogni fase di connessione.' },
      { name: 'Copilota del browser', description: 'Guida l\'utente attraverso le schermate del provider, evidenzia l\'azione successiva e spiega gli errori senza aggirare i controlli di sicurezza.' },
      { name: 'Agente OAuth', description: 'Gestisce, dopo l\'approvazione, scambio dei token, archiviazione crittografata, convalida degli scope, aggiornamento, stato della connessione e configurazione dei webhook supportati.' },
      { name: 'Agente di automazione della piattaforma', description: 'Utilizza API approvate per pubblicare, programmare, raccogliere analisi, gestire commenti, supportare l’outreach ed eseguire i flussi di lavoro consentiti.' },
    ],
    humanTitle: 'Confine di approvazione umana',
    humanSteps: ['Accedi con il provider', 'Completa CAPTCHA, verifiche d’identità o 2FA', 'Accetta i termini del provider o dello sviluppatore', 'Fai clic su Consenti o Concedi accesso quando è richiesto il consenso'],
    automationTitle: 'Cosa SignalBoost potrebbe automatizzare in seguito',
    automationSteps: ['Convalida e aggiorna i token', 'Controlla gli ambiti e lo stato della connessione', 'Configura i webhook supportati', 'Pubblica e pianifica contenuti', 'Raccogli analisi e commenti', 'Esegui campagne e flussi di outreach consentiti'],
    boundaryTitle: 'Limite di sicurezza e policy',
    boundary: 'Il progetto deve usare l’autorizzazione e le API ufficiali del provider. Non deve automatizzare l’inserimento delle credenziali, aggirare CAPTCHA o 2FA, simulare il consenso dell’utente né eludere le restrizioni della piattaforma.',
    futureTitle: 'Nota di pianificazione',
    future: 'Prima dell\'implementazione, ogni provider richiederà una revisione separata delle funzionalità, perché fasi di approvazione, durata dei token, scope, requisiti di revisione delle app e automazione consentita variano a seconda della piattaforma.',
  },
  ja: {
    eyebrow: 'ロードマップ',
    title: '今後のプロジェクト',
    subtitle: '今後の SignalBoost 開発で検討中のコンセプトです。これらのプロジェクトはまだ本番環境の機能として稼働していません。',
    status: 'コンセプト — 今後の開発',
    badge: '将来',
    projectTitle: 'AI プラットフォーム接続ゲートウェイ',
    projectSummary: 'ガイド付きゲートウェイ、ブラウザコパイロット、OAuth エージェント、プラットフォーム自動化システムにより、Facebook、Instagram、Reddit、TikTok、LinkedIn、YouTube、Telegram、WeChat などのサービスの接続を支援します。',
    goalTitle: '目標',
    goal: 'プラットフォームの設定を必要最小限の人による承認ステップに絞り込み、対応する作業は公式APIと安全に管理されたトークンで自動化します。',
    agentsTitle: '提案されたエージェント',
    agents: [
      { name: 'ゲートウェイエージェント', description: 'オンボーディングを調整し、要件を説明して、ユーザーを各接続段階へ導きます。' },
      { name: 'ブラウザーコパイロット', description: 'セキュリティ制御を回避することなく、プロバイダー画面を通じてユーザーを案内し、次のアクションを強調表示し、エラーを説明します。' },
      { name: 'OAuth エージェント', description: '承認後、トークン交換、暗号化ストレージ、スコープ検証、更新、接続状態、およびサポートされている Webhook の設定を処理します。' },
      { name: 'プラットフォーム自動化エージェント', description: '承認済みの API を使用して、公開、スケジュール設定、分析データの収集、コメント管理、アウトリーチ支援、許可されたワークフローの実行を行います。' },
    ],
    humanTitle: '人による承認の境界',
    humanSteps: ['プロバイダーでサインイン', 'CAPTCHA、本人確認、または 2FA を完了', 'プロバイダーまたは開発者の規約に同意', '同意が求められたら［許可］または［アクセスを許可］をクリックしてください'],
    automationTitle: 'その後 SignalBoost が自動化できること',
    automationSteps: ['トークンを検証して更新', 'スコープと接続状態を確認', '対応する Webhook を設定', 'コンテンツの公開と予約', '分析データとコメントを収集', '許可されたキャンペーンとアウトリーチワークフローを実行'],
    boundaryTitle: '安全とポリシーの境界',
    boundary: 'プロジェクトはプロバイダーの公式な認可と API を使用する必要があります。認証情報の入力の自動化、CAPTCHA や 2FA の回避、ユーザー同意のなりすまし、プラットフォーム制限の回避を行ってはなりません。',
    futureTitle: '計画メモ',
    future: '実装前に、プロバイダーごとに個別の機能レビューが必要です。承認手順、トークンの有効期間、スコープ、アプリ審査の要件、許可される自動化はプラットフォームによって異なるためです。',
  },
  ko: {
    eyebrow: '로드맵',
    title: '향후 프로젝트',
    subtitle: '향후 SignalBoost 개발을 위해 검토 중인 콘셉트입니다. 이 프로젝트들은 아직 활성화된 프로덕션 기능이 아닙니다.',
    status: '콘셉트 — 향후 개발',
    badge: '미래',
    projectTitle: 'AI 플랫폼 연결 게이트웨이',
    projectSummary: 'Facebook, Instagram, Reddit, TikTok, LinkedIn, YouTube, Telegram, WeChat 등의 서비스 연결을 돕는 가이드형 게이트웨이, 브라우저 코파일럿, OAuth 에이전트 및 플랫폼 자동화 시스템입니다.',
    goalTitle: '목표',
    goal: '플랫폼 설정을 필요한 최소한의 사람 승인 단계로 줄인 다음, 지원되는 작업은 공식 API와 안전하게 관리되는 토큰으로 자동화하세요.',
    agentsTitle: '제안된 에이전트',
    agents: [
      { name: '게이트웨이 에이전트', description: '온보딩을 조정하고 요구 사항을 설명하며 사용자를 각 연결 단계로 안내합니다.' },
      { name: '브라우저 코파일럿', description: '보안 제어를 우회하지 않고 공급자 화면 전반에서 사용자를 안내하고, 다음 작업을 강조 표시하며, 오류를 설명합니다.' },
      { name: 'OAuth 에이전트', description: '승인 후 토큰 교환, 암호화된 저장, 범위 검증, 갱신, 연결 상태 및 지원되는 웹훅 설정을 처리합니다.' },
      { name: '플랫폼 자동화 에이전트', description: '승인된 API를 사용해 게시, 예약, 분석 수집, 댓글 관리, 아웃리치 지원, 허용된 워크플로 실행을 수행합니다.' },
    ],
    humanTitle: '사람 승인 경계',
    humanSteps: ['공급자로 로그인', 'CAPTCHA, 신원 확인 또는 2FA 완료', '공급자 또는 개발자 약관 동의', '동의가 필요한 경우 허용 또는 액세스 권한 부여를 클릭하세요'],
    automationTitle: '이후 SignalBoost가 자동화할 수 있는 작업',
    automationSteps: ['토큰 검증 및 갱신', '범위 및 연결 상태 확인', '지원되는 웹훅 구성', '콘텐츠 게시 및 예약', '분석 및 댓글 수집', '허용된 캠페인 및 아웃리치 워크플로 실행'],
    boundaryTitle: '안전 및 정책 경계',
    boundary: '프로젝트는 공급자의 공식 인증 및 API를 사용해야 합니다. 자격 증명 입력을 자동화하거나, CAPTCHA 또는 2FA를 우회하거나, 사용자 동의를 가장하거나, 플랫폼 제한을 회피해서는 안 됩니다.',
    futureTitle: '계획 메모',
    future: '구현 전에 공급자마다 별도의 기능 검토가 필요합니다. 승인 단계, 토큰 수명, 범위, 앱 심사 요구 사항, 허용되는 자동화가 플랫폼마다 다르기 때문입니다.',
  },
  ar: {
    eyebrow: 'خارطة الطريق',
    title: 'المشاريع المستقبلية',
    subtitle: 'مفاهيم قيد الدراسة لتطوير SignalBoost مستقبلًا. هذه المشاريع ليست ميزات إنتاج نشطة بعد.',
    status: 'مفهوم — تطوير مستقبلي',
    badge: 'المستقبل',
    projectTitle: 'بوابة الاتصال بمنصات الذكاء الاصطناعي',
    projectSummary: 'بوابة موجَّهة ومساعد متصفح ووكيل OAuth ونظام أتمتة للمنصة يساعد المستخدمين على ربط خدمات مثل Facebook وInstagram وReddit وTikTok وLinkedIn وYouTube وTelegram وWeChat.',
    goalTitle: 'الهدف',
    goal: 'اختصر إعداد المنصة إلى أصغر خطوة موافقة بشرية مطلوبة، ثم أتمت العمل المدعوم عبر واجهات API الرسمية والرموز المُدارة بأمان.',
    agentsTitle: 'الوكلاء المقترحون',
    agents: [
      { name: 'وكيل البوابة', description: 'ينسّق الإعداد الأولي، ويشرح المتطلبات، وينقل المستخدم عبر كل مرحلة من مراحل الاتصال.' },
      { name: 'مساعد المتصفح', description: 'يرشد المستخدم عبر شاشات المزوّد، ويُبرز الإجراء التالي، ويشرح الأخطاء دون تجاوز ضوابط الأمان.' },
      { name: 'وكيل OAuth', description: 'يتولى بعد الموافقة تبادل الرموز، والتخزين المشفّر، والتحقق من النطاقات، والتحديث، وسلامة الاتصال، وإعداد خطافات الويب المدعومة.' },
      { name: 'وكيل أتمتة المنصة', description: 'يستخدم واجهات API معتمدة للنشر والجدولة وجمع التحليلات وإدارة التعليقات ودعم التواصل وتشغيل مسارات العمل المسموح بها.' },
    ],
    humanTitle: 'حدود الموافقة البشرية',
    humanSteps: ['تسجيل الدخول عبر المزوّد', 'إكمال CAPTCHA أو عمليات التحقق من الهوية أو 2FA', 'قبول شروط المزوّد أو المطوّر', 'انقر على «السماح» أو «منح الوصول» عند طلب الموافقة'],
    automationTitle: 'ما يمكن أن يؤتمته SignalBoost بعد ذلك',
    automationSteps: ['التحقق من الرموز المميزة وتحديثها', 'التحقق من النطاقات وسلامة الاتصال', 'تهيئة خطافات الويب المدعومة', 'نشر المحتوى وجدولته', 'جمع التحليلات والتعليقات', 'تشغيل الحملات ومسارات عمل التواصل المسموح بها'],
    boundaryTitle: 'حدود السلامة والسياسة',
    boundary: 'يجب أن يستخدم المشروع التفويض الرسمي وواجهات API الرسمية للمزوّد. ولا يجوز له أتمتة إدخال بيانات الاعتماد، أو تجاوز CAPTCHA أو 2FA، أو انتحال موافقة المستخدم، أو التحايل على قيود المنصة.',
    futureTitle: 'ملاحظة تخطيط',
    future: 'قبل التنفيذ، سيحتاج كل مزوّد إلى مراجعة منفصلة للقدرات، لأن خطوات الموافقة ومدة صلاحية الرموز والنطاقات ومتطلبات مراجعة التطبيقات والأتمتة المسموح بها تختلف من منصة إلى أخرى.',
  },
}

const MULTI_AI_COPY: Record<Language, FutureIdeaCopy> = {
  en: {
    status: 'Idea saved for later review',
    badge: uiText('generatedUi.u_3e43ac1f41f78189'),
    title: uiText('generatedUi.u_a18420fbf2cd5aff'),
    summary: uiText('generatedUi.u_e5541868cbeb9c12'),
    reasonTitle: uiText('generatedUi.u_4ba544e3e9f5102d'),
    reason: uiText('generatedUi.u_e5fbbfecc0691fe7'),
    firstVersionTitle: uiText('generatedUi.u_c6915b58ed251d92'),
    firstVersion: [uiText('generatedUi.u_4e6ee4c0cd3cc706'), uiText('generatedUi.u_990089ee759098d2'), uiText('generatedUi.u_6691238233f294fb'), uiText('generatedUi.u_44812d789cd925cf'), uiText('generatedUi.u_a652291fa265ee80'), uiText('generatedUi.u_d0a6f7e8f25a9f85')],
    decisionTitle: uiText('generatedUi.u_3f7639b491e6946b'),
    decision: uiText('generatedUi.u_9bf481bfff002a15'),
  },
  es: {
    status: 'Idea guardada para revisión futura',
    badge: 'POSPUESTO',
    title: 'Espacio de Consulta de Proyectos con Múltiples IA',
    summary: 'Una sala de proyecto compartida donde OpenAI, Anthropic, Gemini y otros proveedores seleccionados revisen el mismo contexto, respondan en paralelo, critiquen respuestas y ayuden a guardar una decisión final.',
    reasonTitle: 'Por qué existe esta idea',
    reason: 'Durante el desarrollo, el propietario consulta con frecuencia varios sistemas de IA y traslada manualmente contexto y recomendaciones entre servicios separados. Este espacio organizaría ese flujo interno real en un solo lugar.',
    firstVersionTitle: 'Primera versión posible',
    firstVersion: ['Contexto y archivos compartidos del proyecto', 'Enviar una pregunta a proveedores seleccionados', 'Respuestas en paralelo', 'Pedir a un proveedor que critique otra respuesta', 'Crear y guardar una recomendación combinada', 'Mostrar proveedor, modelo, uso, costo e historial de auditoría'],
    decisionTitle: 'Decisión actual',
    decision: 'No tratarlo como desarrollo activo ni como producto comercial probado. Revisarlo más adelante como herramienta interna de productividad y decidir después si el uso justifica convertirlo en producto.',
  },
  pt: {
    status: 'Ideia salva para análise futura',
    badge: 'ADIADO',
    title: 'Espaço de Consulta de Projetos com Múltiplas IAs',
    summary: 'Uma sala de projeto compartilhada onde OpenAI, Anthropic, Gemini e outros provedores selecionados analisem o mesmo contexto, respondam lado a lado, critiquem respostas e ajudem a salvar uma decisão final.',
    reasonTitle: 'Por que esta ideia existe',
    reason: 'Durante o desenvolvimento, o proprietário consulta com frequência vários sistemas de IA e transfere manualmente contexto e recomendações entre serviços separados. Este espaço organizaria esse fluxo interno real em um só lugar.',
    firstVersionTitle: 'Possível primeira versão',
    firstVersion: ['Contexto e arquivos compartilhados do projeto', 'Enviar uma pergunta aos provedores selecionados', 'Respostas lado a lado', 'Pedir a um provedor para criticar outra resposta', 'Criar e salvar uma recomendação combinada', 'Mostrar provedor, modelo, uso, custo e histórico de auditoria'],
    decisionTitle: 'Decisão atual',
    decision: 'Não tratar como desenvolvimento ativo nem como produto comercial comprovado. Rever mais tarde como ferramenta interna de produtividade e decidir depois se o uso justifica transformá-la em produto.',
  },
  pl: {
    status: 'Pomysł zapisany do późniejszej oceny',
    badge: 'ODŁOŻONE',
    title: 'Przestrzeń Konsultacji Projektów z Wieloma AI',
    summary: 'Wspólna przestrzeń projektu, w której OpenAI, Anthropic, Gemini i inni wybrani dostawcy analizują ten sam kontekst, odpowiadają obok siebie, oceniają odpowiedzi i pomagają zapisać końcową decyzję.',
    reasonTitle: 'Dlaczego powstał ten pomysł',
    reason: 'Podczas tworzenia projektów właściciel często konsultuje się z kilkoma systemami AI i ręcznie przenosi kontekst oraz rekomendacje między osobnymi usługami. Ta przestrzeń uporządkowałaby ten rzeczywisty wewnętrzny proces.',
    firstVersionTitle: 'Możliwa pierwsza wersja',
    firstVersion: ['Wspólny kontekst i pliki projektu', 'Wysłanie jednego pytania do wybranych dostawców', 'Odpowiedzi obok siebie', 'Ocena odpowiedzi jednego AI przez inne', 'Utworzenie i zapisanie wspólnej rekomendacji', 'Dostawca, model, użycie, koszt i historia audytu'],
    decisionTitle: 'Obecna decyzja',
    decision: 'Nie traktować jako aktywnej budowy ani sprawdzonego produktu komercyjnego. Wrócić do pomysłu później jako wewnętrznego narzędzia produktywności i dopiero wtedy ocenić zasadność komercjalizacji.',
  },
  ru: {
    status: 'Идея сохранена для будущего рассмотрения',
    badge: 'ОТЛОЖЕНО',
    title: 'Рабочее пространство для консультаций нескольких ИИ',
    summary: 'Общая проектная комната, где OpenAI, Anthropic, Gemini и другие выбранные поставщики анализируют один контекст, отвечают параллельно, критикуют ответы и помогают сохранить итоговое решение.',
    reasonTitle: 'Почему появилась эта идея',
    reason: 'При разработке проектов владелец часто консультируется с несколькими системами ИИ и вручную переносит контекст и рекомендации между отдельными сервисами. Это пространство организует такой реальный внутренний процесс в одном месте.',
    firstVersionTitle: 'Возможная первая версия',
    firstVersion: ['Общий контекст и файлы проекта', 'Один вопрос выбранным поставщикам', 'Параллельные ответы', 'Критика одного ответа другим ИИ', 'Создание и сохранение общей рекомендации', 'Поставщик, модель, использование, стоимость и журнал аудита'],
    decisionTitle: 'Текущее решение',
    decision: 'Не считать активной разработкой или подтверждённым коммерческим продуктом. Вернуться к идее позже как к внутреннему инструменту SignalBoost и затем решить, оправдывает ли использование коммерциализацию.',
  },
  de: {
    status: 'Idee zur späteren Prüfung gespeichert',
    badge: 'ZURÜCKGESTELLT',
    title: 'Multi-KI-Projektberatungs-Workspace',
    summary: 'Ein gemeinsamer Projektraum, in dem OpenAI, Anthropic, Gemini und andere ausgewählte KI-Anbieter denselben Projektkontext prüfen, nebeneinander antworten, ausgewählte Antworten kritisieren und bei der Vorbereitung einer gespeicherten Entscheidung helfen können.',
    reasonTitle: 'Warum es diese Idee gibt',
    reason: 'Während der Projektentwicklung konsultiert der Inhaber oft mehrere KI-Systeme und überträgt Kontext und Empfehlungen manuell zwischen getrennten Diensten. Dieser Arbeitsbereich würde diesen realen internen Workflow an einem Ort bündeln.',
    firstVersionTitle: 'Mögliche erste Version',
    firstVersion: ['Gemeinsamer Projektkontext und Dateien', 'Eine Frage an ausgewählte Anbieter senden', 'Antworten nebeneinander', 'Einen Anbieter die Antwort eines anderen bewerten lassen', 'Kombinierte Empfehlung erstellen und speichern', 'Anbieter, Modell, Nutzung, Kosten und Audit-Verlauf anzeigen'],
    decisionTitle: 'Aktuelle Entscheidung',
    decision: 'Behandeln Sie dies nicht als aktive Entwicklung oder als bewährtes kommerzielles Produkt. Greifen Sie es später als internes SignalBoost-Produktivitätstool wieder auf und entscheiden Sie dann, ob eine breitere Nutzung eine Produktisierung rechtfertigt.',
  },
  fr: {
    status: 'Idée enregistrée pour un examen ultérieur',
    badge: 'REPORTÉ',
    title: 'Espace de consultation de projet multi-IA',
    summary: 'Un espace projet partagé où OpenAI, Anthropic, Gemini et d’autres fournisseurs d’IA sélectionnés peuvent examiner le même contexte de projet, répondre côte à côte, critiquer des réponses sélectionnées et aider à préparer une décision enregistrée.',
    reasonTitle: 'Pourquoi cette idée existe',
    reason: 'Pendant le développement du projet, le propriétaire consulte souvent plusieurs systèmes d’IA et transfère manuellement le contexte et les recommandations entre des services distincts. Cet espace de travail organiserait ce workflow interne réel en un seul endroit.',
    firstVersionTitle: 'Première version possible',
    firstVersion: ['Contexte et fichiers partagés du projet', 'Envoyer une question aux fournisseurs sélectionnés', 'Réponses côte à côte', 'Demander à un fournisseur de critiquer la réponse d’un autre', 'Créer et enregistrer une recommandation combinée', 'Afficher le fournisseur, le modèle, l’utilisation, le coût et l’historique d’audit'],
    decisionTitle: 'Décision actuelle',
    decision: 'Ne considérez pas ceci comme un développement actif ni comme un produit commercial éprouvé. Réexaminez-le plus tard en tant qu\'outil de productivité interne à SignalBoost, puis décidez si un usage plus large justifie sa productisation.',
  },
  it: {
    status: 'Idea salvata per una revisione futura',
    badge: 'RINVIATO',
    title: 'Spazio di consulenza progetti multi-AI',
    summary: 'Una stanza di progetto condivisa in cui OpenAI, Anthropic, Gemini e altri provider AI selezionati possono esaminare lo stesso contesto di progetto, rispondere fianco a fianco, criticare le risposte selezionate e aiutare a preparare un’unica decisione salvata.',
    reasonTitle: 'Perché esiste questa idea',
    reason: 'Durante lo sviluppo del progetto, il proprietario consulta spesso diversi sistemi AI e trasferisce manualmente contesto e raccomandazioni tra servizi separati. Questo spazio di lavoro organizzerebbe quel flusso di lavoro interno reale in un unico posto.',
    firstVersionTitle: 'Possibile prima versione',
    firstVersion: ['Contesto e file di progetto condivisi', 'Invia una domanda ai provider selezionati', 'Risposte affiancate', 'Chiedi a un provider di valutare la risposta di un altro', 'Crea e salva una raccomandazione combinata', 'Mostra provider, modello, utilizzo, costo e cronologia di audit'],
    decisionTitle: 'Decisione attuale',
    decision: 'Non considerarlo uno sviluppo attivo né un prodotto commerciale collaudato. Riprendilo in seguito come strumento di produttività interno di SignalBoost, poi decidi se un utilizzo più ampio ne giustifica la trasformazione in prodotto.',
  },
  ja: {
    status: '後で確認するためにアイデアを保存しました',
    badge: '延期',
    title: 'マルチ AI プロジェクト相談ワークスペース',
    summary: 'OpenAI、Anthropic、Gemini などの選択したAIプロバイダーが同じプロジェクトコンテキストを確認し、並べて回答し、選択した回答を批評し、保存される1つの意思決定の準備を支援できる共有プロジェクトルームです。',
    reasonTitle: 'このアイデアの背景',
    reason: 'プロジェクト開発中、オーナーは複数のAIシステムに相談し、別々のサービス間でコンテキストや推奨事項を手作業で受け渡すことがよくあります。このワークスペースは、その実際の社内ワークフローを1か所にまとめます。',
    firstVersionTitle: '最初のバージョン案',
    firstVersion: ['共有プロジェクトのコンテキストとファイル', '選択したプロバイダーに1つの質問を送信', '回答の並列比較', 'あるプロバイダーに別のプロバイダーの回答を批評させる', '統合レコメンデーションを作成して保存', 'プロバイダー、モデル、使用量、コスト、監査履歴を表示'],
    decisionTitle: '現在の決定',
    decision: 'これをアクティブな開発や実績のある商用製品として扱わないでください。後で SignalBoost の社内生産性ツールとして見直し、より広い利用が製品化に値するかを判断してください。',
  },
  ko: {
    status: '나중에 검토할 수 있도록 아이디어를 저장했습니다',
    badge: '연기됨',
    title: '멀티 AI 프로젝트 상담 워크스페이스',
    summary: 'OpenAI, Anthropic, Gemini 및 기타 선택한 AI 공급자가 동일한 프로젝트 컨텍스트를 검토하고, 나란히 답변하고, 선택한 응답을 비평하며, 저장될 하나의 결정을 준비하도록 돕는 공유 프로젝트 공간입니다.',
    reasonTitle: '이 아이디어가 존재하는 이유',
    reason: '프로젝트 개발 중 소유자는 여러 AI 시스템에 자문하고 별도의 서비스 간에 컨텍스트와 권장 사항을 수동으로 옮기는 경우가 많습니다. 이 워크스페이스는 그러한 실제 내부 워크플로를 한곳에 정리합니다.',
    firstVersionTitle: '가능한 첫 번째 버전',
    firstVersion: ['공유 프로젝트 컨텍스트 및 파일', '선택한 공급자에게 질문 하나 보내기', '응답 나란히 보기', '한 공급자에게 다른 공급자의 응답을 평가하도록 요청', '통합 권장 사항 생성 및 저장', '공급자, 모델, 사용량, 비용 및 감사 기록 표시'],
    decisionTitle: '현재 결정',
    decision: '이를 진행 중인 개발이나 검증된 상용 제품으로 취급하지 마세요. 나중에 SignalBoost 내부 생산성 도구로 다시 검토한 후, 더 넓은 사용이 제품화를 정당화하는지 결정하세요.',
  },
  ar: {
    status: 'تم حفظ الفكرة لمراجعتها لاحقًا',
    badge: 'مؤجَّل',
    title: 'مساحة عمل لاستشارات المشاريع متعددة الذكاء الاصطناعي',
    summary: 'غرفة مشروع مشتركة يمكن فيها لـ OpenAI وAnthropic وGemini وغيرها من مزوّدي الذكاء الاصطناعي المختارين مراجعة سياق المشروع نفسه، والإجابة جنبًا إلى جنب، ونقد الردود المختارة، والمساعدة في إعداد قرار واحد محفوظ.',
    reasonTitle: 'لماذا توجد هذه الفكرة',
    reason: 'خلال تطوير المشروع، يستشير المالك غالبًا عدة أنظمة ذكاء اصطناعي وينقل السياق والتوصيات يدويًا بين خدمات منفصلة. ستنظّم مساحة العمل هذه سير العمل الداخلي الفعلي هذا في مكان واحد.',
    firstVersionTitle: 'نسخة أولى محتملة',
    firstVersion: ['سياق المشروع والملفات المشتركة', 'إرسال سؤال واحد إلى المزوّدين المحددين', 'الردود جنبًا إلى جنب', 'اطلب من مزوّد نقد إجابة مزوّد آخر', 'إنشاء توصية مجمّعة وحفظها', 'عرض المزوّد والنموذج والاستخدام والتكلفة وسجل التدقيق'],
    decisionTitle: 'القرار الحالي',
    decision: 'لا تتعامل مع هذا على أنه تطوير نشط أو منتج تجاري مُثبت. أعد النظر فيه لاحقًا كأداة إنتاجية داخلية لـ SignalBoost، ثم قرّر ما إذا كان الاستخدام الأوسع يبرّر تحويله إلى منتج.',
  },
}

export default function FutureProjectsPage() {
  const { lang } = useI18n()
  const language = (lang as Language) in COPY ? (lang as Language) : 'en'
  const copy = COPY[language]
  const multiAi = MULTI_AI_COPY[language]

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 20px 64px', color: 'var(--text-primary)' }}>
      <header style={{ marginBottom: 24 }}>
        <div className="sb-eyebrow">{copy.eyebrow}</div>
        <h1 style={{ margin: '8px 0 10px', fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>{copy.title}</h1>
        <p className="sb-body" style={{ maxWidth: 760, margin: 0 }}>{copy.subtitle}</p>
      </header>

      <article className="sb-console" style={{ padding: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div className="sb-eyebrow">{copy.status}</div>
            <h2 style={{ margin: '8px 0 0', fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' }}>{copy.projectTitle}</h2>
          </div>
          <span style={{ border: '1px solid rgba(167,139,250,.5)', borderRadius: 999, padding: '7px 12px', color: '#c4b5fd', fontSize: 12, fontWeight: 800 }}>{copy.badge}</span>
        </div>

        <p className="sb-body" style={{ maxWidth: 900, marginTop: 18 }}>{copy.projectSummary}</p>

        <section style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 20, marginTop: 20 }}>
          <h3 className="sb-h3">{copy.goalTitle}</h3>
          <p className="sb-body">{copy.goal}</p>
        </section>

        <section style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 20, marginTop: 20 }}>
          <h3 className="sb-h3">{copy.agentsTitle}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
            {copy.agents.map(agent => (
              <div key={agent.name} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 16, background: 'rgba(255,255,255,.025)' }}>
                <strong>{agent.name}</strong>
                <p className="sb-body" style={{ marginBottom: 0 }}>{agent.description}</p>
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 18, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 20, marginTop: 20 }}>
          <section>
            <h3 className="sb-h3">{copy.humanTitle}</h3>
            <ul className="sb-body" style={{ paddingInlineStart: 20 }}>
              {copy.humanSteps.map(step => <li key={step} style={{ marginBottom: 8 }}>{step}</li>)}
            </ul>
          </section>
          <section>
            <h3 className="sb-h3">{copy.automationTitle}</h3>
            <ul className="sb-body" style={{ paddingInlineStart: 20 }}>
              {copy.automationSteps.map(step => <li key={step} style={{ marginBottom: 8 }}>{step}</li>)}
            </ul>
          </section>
        </div>

        <section style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 20, marginTop: 20 }}>
          <h3 className="sb-h3">{copy.boundaryTitle}</h3>
          <p className="sb-body">{copy.boundary}</p>
        </section>

        <section style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 20, marginTop: 20 }}>
          <h3 className="sb-h3">{copy.futureTitle}</h3>
          <p className="sb-body" style={{ marginBottom: 0 }}>{copy.future}</p>
        </section>
      </article>

      <article className="sb-console" style={{ padding: 24, marginTop: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div className="sb-eyebrow">{multiAi.status}</div>
            <h2 style={{ margin: '8px 0 0', fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' }}>{multiAi.title}</h2>
          </div>
          <span style={{ border: '1px solid rgba(167,139,250,.5)', borderRadius: 999, padding: '7px 12px', color: '#c4b5fd', fontSize: 12, fontWeight: 800 }}>{multiAi.badge}</span>
        </div>

        <p className="sb-body" style={{ maxWidth: 900, marginTop: 18 }}>{multiAi.summary}</p>

        <section style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 20, marginTop: 20 }}>
          <h3 className="sb-h3">{multiAi.reasonTitle}</h3>
          <p className="sb-body">{multiAi.reason}</p>
        </section>

        <section style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 20, marginTop: 20 }}>
          <h3 className="sb-h3">{multiAi.firstVersionTitle}</h3>
          <ul className="sb-body" style={{ paddingInlineStart: 20 }}>
            {multiAi.firstVersion.map(item => <li key={item} style={{ marginBottom: 8 }}>{item}</li>)}
          </ul>
        </section>

        <section style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 20, marginTop: 20 }}>
          <h3 className="sb-h3">{multiAi.decisionTitle}</h3>
          <p className="sb-body" style={{ marginBottom: 0 }}>{multiAi.decision}</p>
        </section>
      </article>
    </main>
  )
}
