'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type SupportedLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type LocalizedText = Readonly<Record<SupportedLanguage, string>>
type PreviewProject = Readonly<{
  id: string
  glyph: string
  name: LocalizedText
  description: LocalizedText
  foundation: LocalizedText
  href?: string
}>

const TEXT = {
  heading: { en: uiText('generatedUi.u_cc020dcbc17a9d5f'), es: 'Proyectos estratégicos — vista previa', pt: 'Projetos estratégicos — prévia', pl: 'Projekty strategiczne — podgląd', ru: 'Стратегические проекты — предварительный обзор' },
  intro: { en: uiText('generatedUi.u_4accfddb346999aa'), es: 'Iniciativas visibles de la hoja de ruta. Solo vista previa: no implica preparación comercial, ejecución en producción ni disponibilidad de licencia.', pt: 'Iniciativas visíveis do roteiro. Apenas prévia: não indica prontidão comercial, execução em produção nem disponibilidade para licenciamento.', pl: 'Widoczne inicjatywy z mapy rozwoju. Tylko podgląd: nie oznacza gotowości handlowej, wykonania produkcyjnego ani dostępności licencji.', ru: 'Видимые инициативы дорожной карты. Только предварительный обзор: это не означает коммерческую готовность, работу в продакшене или доступность лицензирования.' },
  badge: { en: uiText('generatedUi.u_324b134f57c70c72'), es: 'Vista previa', pt: 'Prévia', pl: 'Podgląd', ru: 'Предпросмотр' },
  foundation: { en: uiText('generatedUi.u_df42a4d5d3537666'), es: 'Base', pt: 'Base', pl: 'Podstawa', ru: 'Основа' },
  details: { en: uiText('generatedUi.u_ca7becad527f2400'), es: 'Explorar implementación real →', pt: 'Explorar implementação real →', pl: 'Zobacz rzeczywistą implementację →', ru: 'Открыть реальную реализацию →' },
} satisfies Record<string, LocalizedText>

const PROJECTS: readonly PreviewProject[] = Object.freeze([
  {
    id: 'portable-product-platform', glyph: '▦',
    name: { en: 'Portable Product Platform', es: 'Plataforma de Productos Portátiles', pt: 'Plataforma de Produtos Portáteis', pl: 'Platforma Produktów Przenośnych', ru: 'Платформа переносимых продуктов' },
    description: { en: 'Host-neutral cores, replaceable host adapters, buyer-owned providers, and clean-host validation for commercial modules.', es: 'Núcleos independientes del host, adaptadores reemplazables, proveedores del comprador y validación en un host limpio.', pt: 'Núcleos independentes do host, adaptadores substituíveis, provedores do comprador e validação em host limpo.', pl: 'Rdzenie niezależne od hosta, wymienne adaptery, dostawcy kupującego i walidacja na czystym hoście.', ru: 'Независимые от хоста ядра, сменные адаптеры, провайдеры покупателя и проверка на чистом хосте.' },
    foundation: { en: 'Portable manifests, core/host doctrine, readiness and dependency graph', es: 'Manifiestos portátiles, doctrina núcleo/host, preparación y dependencias', pt: 'Manifestos portáteis, doutrina core/host, prontidão e dependências', pl: 'Manifesty, doktryna core/host, gotowość i graf zależności', ru: 'Манифесты, разделение core/host, готовность и граф зависимостей' },
  },
  {
    id: 'universal-provider-framework', glyph: '⇄',
    name: { en: 'Universal Provider Framework', es: 'Marco Universal de Proveedores', pt: 'Framework Universal de Provedores', pl: 'Uniwersalna Struktura Dostawców', ru: 'Универсальная платформа провайдеров' },
    description: { en: 'One provider-neutral contract for capabilities, health, authentication, versions, risk, evidence, webhooks, and schedules.', es: 'Un contrato neutral para capacidades, salud, autenticación, versiones, riesgo, evidencia, webhooks y programación.', pt: 'Um contrato neutro para capacidades, saúde, autenticação, versões, risco, evidências, webhooks e agendamentos.', pl: 'Jeden neutralny kontrakt dla możliwości, kondycji, uwierzytelniania, wersji, ryzyka, dowodów i harmonogramów.', ru: 'Единый нейтральный контракт для возможностей, состояния, аутентификации, версий, рисков, доказательств и расписаний.' },
    foundation: { en: 'Mission 002 provider framework', es: 'Framework de proveedores de la Misión 002', pt: 'Framework de provedores da Missão 002', pl: 'Framework dostawców Misji 002', ru: 'Фреймворк провайдеров Mission 002' },
  },
  {
    id: 'governed-socket', glyph: '⌁', href: '/products/agent-gateway',
    name: { en: 'Governed Socket / Agent Gateway', es: 'Socket Gobernado / Puerta de Agentes', pt: 'Socket Governado / Gateway de Agentes', pl: 'Zarządzane Gniazdo / Brama Agentów', ru: 'Управляемый шлюз агентов' },
    description: { en: 'Connect agents, enterprise applications, APIs, automation, robots, and industrial systems through one governed gateway with policy, approvals, runtime coordination, Provider Hub diagnostics, and immutable evidence.', es: 'Conecta agentes, aplicaciones, APIs, automatización, robots y sistemas industriales mediante un gateway gobernado con políticas, aprobaciones, runtime, diagnósticos y evidencia inmutable.', pt: 'Conecte agentes, aplicações, APIs, automação, robôs e sistemas industriais por um gateway governado com políticas, aprovações, runtime, diagnósticos e evidências imutáveis.', pl: 'Łącz agentów, aplikacje, API, automatyzację, roboty i systemy przemysłowe przez jedną zarządzaną bramę z politykami, akceptacją, runtime, diagnostyką i niezmiennymi dowodami.', ru: 'Подключайте агентов, приложения, API, автоматизацию, роботов и промышленные системы через единый управляемый шлюз с политиками, одобрениями, runtime, диагностикой и неизменяемыми доказательствами.' },
    foundation: { en: 'MCP, A2A, REST/OpenAPI, MQTT, MAVLink, ROS 2, OPC UA, cluster runtime, Provider Hub, runtime health, and governance evidence', es: 'MCP, A2A, REST/OpenAPI, MQTT, MAVLink, ROS 2, OPC UA, runtime de clúster, Provider Hub, salud y evidencia', pt: 'MCP, A2A, REST/OpenAPI, MQTT, MAVLink, ROS 2, OPC UA, runtime de cluster, Provider Hub, saúde e evidências', pl: 'MCP, A2A, REST/OpenAPI, MQTT, MAVLink, ROS 2, OPC UA, runtime klastra, Provider Hub, zdrowie i dowody', ru: 'MCP, A2A, REST/OpenAPI, MQTT, MAVLink, ROS 2, OPC UA, кластерный runtime, Provider Hub, здоровье и доказательства' },
  },
  {
    id: 'enterprise-autonomy-engine', glyph: '◇',
    name: { en: 'Enterprise Autonomy Engine', es: 'Motor de Autonomía Empresarial', pt: 'Motor de Autonomia Empresarial', pl: 'Silnik Autonomii Przedsiębiorstwa', ru: 'Движок корпоративной автономии' },
    description: { en: 'A portable pre-COS intelligence layer for observations, world state, prediction, risk, candidate plans, and governed decisions.', es: 'Capa portátil previa a COS para observaciones, estado, predicción, riesgo, planes candidatos y decisiones gobernadas.', pt: 'Camada portátil pré-COS para observações, estado, previsão, risco, planos candidatos e decisões governadas.', pl: 'Przenośna warstwa przed COS dla obserwacji, stanu, prognoz, ryzyka, planów i decyzji.', ru: 'Переносимый слой до COS для наблюдений, состояния, прогнозов, рисков, планов и управляемых решений.' },
    foundation: { en: 'Deterministic, tenant-scoped EAE contracts', es: 'Contratos EAE deterministas y por inquilino', pt: 'Contratos EAE determinísticos e por locatário', pl: 'Deterministyczne kontrakty EAE z izolacją tenantów', ru: 'Детерминированные EAE-контракты с изоляцией арендаторов' },
  },
  {
    id: 'browser-provider-layer', glyph: '▣',
    name: { en: 'Browser Provider Abstraction Layer', es: 'Capa de Abstracción de Proveedores de Navegador', pt: 'Camada de Abstração de Provedores de Navegador', pl: 'Warstwa Abstrakcji Dostawców Przeglądarki', ru: 'Слой абстракции браузерных провайдеров' },
    description: { en: 'Provider-neutral browser capabilities, policy metadata, selectors, evidence profiles, health, and versioned adapters.', es: 'Capacidades de navegador neutrales, metadatos de política, selectores, evidencia, salud y adaptadores versionados.', pt: 'Capacidades de navegador neutras, metadados de política, seletores, evidências, saúde e adaptadores versionados.', pl: 'Neutralne możliwości przeglądarki, polityki, selektory, profile dowodów, kondycja i wersjonowane adaptery.', ru: 'Нейтральные браузерные возможности, политики, селекторы, профили доказательств, состояние и адаптеры.' },
    foundation: { en: 'Canonical BPAL registry and read-only provider diagnostics', es: 'Registro BPAL y diagnósticos de solo lectura', pt: 'Registro BPAL e diagnósticos somente leitura', pl: 'Rejestr BPAL i diagnostyka tylko do odczytu', ru: 'Реестр BPAL и диагностика только для чтения' },
  },
  {
    id: 'multi-provider-onboarding', glyph: '＋',
    name: { en: 'Multi-Provider Onboarding', es: 'Incorporación de Múltiples Proveedores', pt: 'Integração de Múltiplos Provedores', pl: 'Wdrażanie Wielu Dostawców', ru: 'Подключение множества провайдеров' },
    description: { en: 'Four governed paths for every provider: Direct configuration, Governed AI infrastructure PR, Browser Agent assistance, and provider-guided configuration.', es: 'Cuatro rutas gobernadas: configuración directa, PR de infraestructura de IA gobernada, asistencia de Browser Agent y configuración guiada por el proveedor.', pt: 'Quatro caminhos governados: configuração direta, PR de infraestrutura de IA governada, assistência do Browser Agent e configuração guiada pelo provedor.', pl: 'Cztery zarządzane ścieżki: konfiguracja bezpośrednia, zarządzany PR infrastruktury AI, pomoc Browser Agent i konfiguracja prowadzona przez dostawcę.', ru: 'Четыре управляемых пути: прямая настройка, управляемый AI infrastructure PR, помощь Browser Agent и настройка по инструкциям провайдера.' },
    foundation: { en: 'Provider-specific templates using the shared Direct configuration → Governed AI infrastructure PR → Browser Agent assistance → provider-guided configuration model.', es: 'Plantillas específicas con el modelo configuración directa → PR gobernado → Browser Agent → configuración guiada.', pt: 'Templates específicos com o modelo configuração direta → PR governado → Browser Agent → configuração guiada.', pl: 'Szablony oparte na modelu konfiguracja bezpośrednia → zarządzany PR → Browser Agent → konfiguracja prowadzona.', ru: 'Шаблоны по модели прямая настройка → управляемый PR → Browser Agent → настройка по инструкции.' },
  },
  {
    id: 'multi-ai-project-consultation', glyph: '◈',
    name: { en: 'Multi-AI Project Consultation Workspace', es: 'Espacio de Consulta de Proyectos con Múltiples IA', pt: 'Espaço de Consulta de Projetos com Múltiplas IAs', pl: 'Przestrzeń Konsultacji Projektów z Wieloma AI', ru: 'Рабочее пространство для консультаций нескольких ИИ' },
    description: { en: 'A shared project room where selected AI providers review the same context, respond side by side, critique chosen answers, and help produce one saved decision.', es: 'Una sala de proyecto compartida donde proveedores de IA seleccionados revisan el mismo contexto, responden en paralelo, critican respuestas elegidas y ayudan a guardar una decisión final.', pt: 'Uma sala de projeto compartilhada onde provedores de IA selecionados analisam o mesmo contexto, respondem lado a lado, criticam respostas escolhidas e ajudam a salvar uma decisão final.', pl: 'Wspólna przestrzeń projektu, w której wybrani dostawcy AI analizują ten sam kontekst, odpowiadają obok siebie, oceniają wybrane odpowiedzi i pomagają zapisać ostateczną decyzję.', ru: 'Общее пространство проекта, где выбранные поставщики ИИ анализируют один контекст, отвечают параллельно, критикуют выбранные ответы и помогают сохранить итоговое решение.' },
    foundation: { en: 'Provider Hub templates, buyer-supplied API keys, normalized responses, project memory, audit records, and cost controls', es: 'Plantillas de Provider Hub, claves API del usuario, respuestas normalizadas, memoria del proyecto, auditoría y control de costos', pt: 'Templates do Provider Hub, chaves de API do usuário, respostas normalizadas, memória do projeto, auditoria e controle de custos', pl: 'Szablony Provider Hub, klucze API użytkownika, znormalizowane odpowiedzi, pamięć projektu, audyt i kontrola kosztów', ru: 'Шаблоны Provider Hub, API-ключи пользователя, нормализованные ответы, память проекта, аудит и контроль затрат' },
  },
  {
    id: 'robotics-protocol-adapters', glyph: '⌖',
    name: { en: 'Robotics Protocol Adapters', es: 'Adaptadores de Protocolos Robóticos', pt: 'Adaptadores de Protocolos Robóticos', pl: 'Adaptery Protokołów Robotycznych', ru: 'Адаптеры робототехнических протоколов' },
    description: { en: 'Supervisory command governance for physical agents while real-time stabilization and safety remain on the robot or autopilot.', es: 'Gobierno de comandos supervisores para agentes físicos, manteniendo el control y la seguridad en tiempo real en el robot.', pt: 'Governança de comandos supervisórios para agentes físicos, mantendo controle e segurança em tempo real no robô.', pl: 'Nadzorcze zarządzanie poleceniami dla agentów fizycznych, z kontrolą czasu rzeczywistego pozostającą na robocie.', ru: 'Управление командами физическим агентам, при этом управление реального времени остаётся на роботе или автопилоте.' },
    foundation: { en: 'MAVLink and ROS 2 adapters through the Agent Gateway', es: 'Adaptadores MAVLink y ROS 2 mediante Agent Gateway', pt: 'Adaptadores MAVLink e ROS 2 pelo Agent Gateway', pl: 'Adaptery MAVLink i ROS 2 przez Agent Gateway', ru: 'Адаптеры MAVLink и ROS 2 через Agent Gateway' },
  },
])

function safeLanguage(value: string): SupportedLanguage { return value === 'es' || value === 'pt' || value === 'pl' || value === 'ru' ? value : 'en' }

export function PreviewProjects() {
  const { lang } = useI18n()
  const language = safeLanguage(lang)

  return (
    <section className="preview-zone" aria-labelledby="preview-projects-heading">
      <div className="preview-head"><div><span className="preview-label" id="preview-projects-heading">{TEXT.heading[language]}</span><p>{TEXT.intro[language]}</p></div><span className="preview-count">{PROJECTS.length} {TEXT.badge[language].toLowerCase()}</span></div>
      <div className="preview-grid">
        {PROJECTS.map((project) => {
          const card = <article className={`preview-card${project.href ? ' preview-card-live' : ''}`}><div className="preview-card-top"><span className="preview-icon" aria-hidden="true">{project.glyph}</span><span className="preview-badge">{TEXT.badge[language]}</span></div><h3>{project.name[language]}</h3><p>{project.description[language]}</p><small><b>{TEXT.foundation[language]}:</b> {project.foundation[language]}</small>{project.href ? <strong className="preview-action">{TEXT.details[language]}</strong> : null}</article>
          return project.href ? <Link className="preview-link" href={project.href} key={project.id}>{card}</Link> : <div key={project.id}>{card}</div>
        })}
      </div>
      <style jsx>{`
        .preview-zone{display:flex;flex-direction:column;gap:10px;padding-top:2px}.preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}.preview-head>div{max-width:820px}.preview-label{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#aeb6ff}.preview-head p{margin:5px 0 0;color:#8f9bb0;font-size:11px;line-height:1.45}.preview-count{display:inline-flex;align-items:center;border:1px solid rgba(139,140,255,.35);background:rgba(98,96,210,.12);color:#c8c9ff;border-radius:999px;padding:5px 10px;font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.preview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.preview-link{display:block;color:inherit;text-decoration:none}.preview-card{display:flex;flex-direction:column;gap:6px;min-width:0;height:100%;padding:14px;border-radius:16px;border:1px dashed rgba(139,140,255,.35);background:linear-gradient(145deg,rgba(24,25,52,.72),rgba(8,10,24,.78));box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}.preview-card-live{border-style:solid;border-color:rgba(34,211,238,.42);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.preview-card-live:hover{transform:translateY(-2px);border-color:rgba(34,211,238,.85);box-shadow:0 14px 38px rgba(8,145,178,.16),inset 0 1px 0 rgba(255,255,255,.05)}.preview-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.preview-icon{display:grid;place-items:center;width:29px;height:29px;border-radius:9px;border:1px solid rgba(139,140,255,.55);color:#b8b9ff;font-size:14px}.preview-badge{border:1px solid currentColor;color:#b7b8ff;border-radius:999px;padding:3px 7px;font-size:8.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.preview-card h3{margin:2px 0 0;color:#f4f4ff;font-size:13.5px}.preview-card p{margin:0;color:#a0a8bc;font-size:11px;line-height:1.4}.preview-card small{margin-top:auto;padding-top:8px;border-top:1px solid rgba(255,255,255,.07);color:#8994aa;font-size:9.5px;line-height:1.4}.preview-card small b{color:#b7b8d6}.preview-action{padding-top:3px;color:#8be9f6;font-size:10px;letter-spacing:.02em}@media(max-width:560px){.preview-grid{grid-template-columns:1fr}}
      `}</style>
    </section>
  )
}
