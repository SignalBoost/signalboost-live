// saas/app/dashboard/future-projects/page.tsx
'use client'

import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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

const COPY: Record<Language, ProjectCopy> = {
  en: {
    eyebrow: uiCopy('u_4b7b33393789fa3a'),
    title: uiCopy('u_bfe47b027cd9d4f5'),
    subtitle: uiCopy('u_c9873455a6e56fca'),
    status: uiCopy('u_29350f7d0c31d482'),
    badge: uiCopy('u_007b587bd1f25f90'),
    projectTitle: uiCopy('u_9e0e6ffff0239104'),
    projectSummary: uiCopy('u_b6482117f691ec26'),
    goalTitle: uiCopy('u_26b79e2a1771b2d9'),
    goal: uiCopy('u_f6de81b3db5e6807'),
    agentsTitle: uiCopy('u_c8ed56ae0e9afd27'),
    agents: [
      { name: uiCopy('u_0bf08d27bef329f7'), description: uiCopy('u_1375ea1a06f87ada') },
      { name: uiCopy('u_d7c5073f2ead611c'), description: uiCopy('u_e35442921c86c023') },
      { name: uiCopy('u_3c4b96a8d0d2ef42'), description: uiCopy('u_08e2b7aa5f454811') },
      { name: uiCopy('u_fa44f58210cbe855'), description: uiCopy('u_f130184ce656dddc') },
    ],
    humanTitle: uiCopy('u_54f6dfe4204614cd'),
    humanSteps: [uiCopy('u_117ede1fbd8089cb'), uiCopy('u_ea6be5ac8484c46f'), uiCopy('u_a870adbe8244e539'), uiCopy('u_fdb930e7401e6774')],
    automationTitle: uiCopy('u_9d34d44e76f8a304'),
    automationSteps: [uiCopy('u_95bb1ff426703c4d'), uiCopy('u_a36975177ef1caee'), uiCopy('u_bc7a7d9c6e47f5c1'), uiCopy('u_17ea756b9bdc6169'), uiCopy('u_93cb75e58e69fed3'), uiCopy('u_7e929c5c056a5e31')],
    boundaryTitle: uiCopy('u_85291f9ba3f9e608'),
    boundary: uiCopy('u_f4b3bffb06cce810'),
    futureTitle: uiCopy('u_db5740a5c31d893b'),
    future: uiCopy('u_41eaa0f4093da201'),
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

export default function FutureProjectsPage() {
  const { lang } = useI18n()
  const copy = COPY[(lang as Language) in COPY ? (lang as Language) : 'en']

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
    </main>
  )
}
