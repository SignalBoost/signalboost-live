// saas/app/dashboard/future-projects/page.tsx
'use client'

import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru'

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
}

const MULTI_AI_COPY: Record<Language, FutureIdeaCopy> = {
  en: {
    status: 'Idea saved for later review',
    badge: 'DEFERRED',
    title: 'Multi-AI Project Consultation Workspace',
    summary: 'One shared project room where OpenAI, Anthropic, Gemini and other selected AI providers can review the same project context, answer side by side, critique selected responses and help prepare one saved decision.',
    reasonTitle: 'Why this idea exists',
    reason: 'During project development, the owner often consults several AI systems and manually carries context and recommendations between separate services. This workspace would organize that real internal workflow in one place.',
    firstVersionTitle: 'Possible first version',
    firstVersion: ['Shared project context and files', 'Send one question to selected providers', 'Side-by-side responses', 'Ask one provider to critique another response', 'Create and save a combined recommendation', 'Display provider, model, usage, cost and audit history'],
    decisionTitle: 'Current decision',
    decision: 'Do not treat this as an active build or a proven commercial product. Revisit it later as an internal SignalBoost productivity tool, then decide whether broader usage justifies productization.',
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
            <ul className="sb-body" style={{ paddingLeft: 20 }}>
              {copy.humanSteps.map(step => <li key={step} style={{ marginBottom: 8 }}>{step}</li>)}
            </ul>
          </section>
          <section>
            <h3 className="sb-h3">{copy.automationTitle}</h3>
            <ul className="sb-body" style={{ paddingLeft: 20 }}>
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
          <ul className="sb-body" style={{ paddingLeft: 20 }}>
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
