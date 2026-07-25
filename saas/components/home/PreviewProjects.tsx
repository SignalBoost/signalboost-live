'use client'

import { useI18n } from '@/components/i18n/I18nProvider'

type SupportedLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type LocalizedText = Readonly<Record<SupportedLanguage, string>>

type PreviewProject = Readonly<{
  id: string
  glyph: string
  name: LocalizedText
  description: LocalizedText
  foundation: LocalizedText
}>

const TEXT = {
  heading: {
    en: 'Strategic projects — preview',
    es: 'Proyectos estratégicos — vista previa',
    pt: 'Projetos estratégicos — prévia',
    pl: 'Projekty strategiczne — podgląd',
    ru: 'Стратегические проекты — предварительный обзор',
  },
  intro: {
    en: 'Visible roadmap initiatives. Preview only: not a claim of commercial readiness, production execution, or availability for licensing.',
    es: 'Iniciativas visibles de la hoja de ruta. Solo vista previa: no implica preparación comercial, ejecución en producción ni disponibilidad de licencia.',
    pt: 'Iniciativas visíveis do roteiro. Apenas prévia: não indica prontidão comercial, execução em produção nem disponibilidade para licenciamento.',
    pl: 'Widoczne inicjatywy z mapy rozwoju. Tylko podgląd: nie oznacza gotowości handlowej, wykonania produkcyjnego ani dostępności licencji.',
    ru: 'Видимые инициативы дорожной карты. Только предварительный обзор: это не означает коммерческую готовность, работу в продакшене или доступность лицензирования.',
  },
  badge: {
    en: 'Preview', es: 'Vista previa', pt: 'Prévia', pl: 'Podgląd', ru: 'Предпросмотр',
  },
  foundation: {
    en: 'Foundation', es: 'Base', pt: 'Base', pl: 'Podstawa', ru: 'Основа',
  },
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
    id: 'governed-socket', glyph: '⌁',
    name: { en: 'Governed Socket / Agent Gateway', es: 'Socket Gobernado / Puerta de Agentes', pt: 'Socket Governado / Gateway de Agentes', pl: 'Zarządzane Gniazdo / Brama Agentów', ru: 'Управляемый шлюз агентов' },
    description: { en: 'Normalizes many agent and tool protocols into one governed request with consistent policy, approval, execution, and audit.', es: 'Normaliza múltiples protocolos en una solicitud gobernada con política, aprobación, ejecución y auditoría coherentes.', pt: 'Normaliza vários protocolos em uma solicitação governada com política, aprovação, execução e auditoria consistentes.', pl: 'Normalizuje wiele protokołów do jednego zarządzanego żądania ze spójną polityką, akceptacją i audytem.', ru: 'Нормализует разные протоколы в единый управляемый запрос с общей политикой, одобрением и аудитом.' },
    foundation: { en: 'MCP, A2A and protocol adapter registry', es: 'MCP, A2A y registro de adaptadores', pt: 'MCP, A2A e registro de adaptadores', pl: 'MCP, A2A i rejestr adapterów', ru: 'MCP, A2A и реестр адаптеров' },
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
    description: { en: 'Three setup paths for every provider: governed AI infrastructure PR, complete manual setup, and optional Browser Agent assistance.', es: 'Tres rutas para cada proveedor: PR de infraestructura con IA, configuración manual completa y asistencia opcional del agente.', pt: 'Três caminhos para cada provedor: PR de infraestrutura com IA, configuração manual completa e assistência opcional.', pl: 'Trzy ścieżki dla każdego dostawcy: PR infrastruktury AI, pełna konfiguracja ręczna i opcjonalny agent.', ru: 'Три пути настройки: управляемый AI PR, полная ручная настройка и опциональная помощь браузерного агента.' },
    foundation: { en: 'AI, manual and Browser Agent onboarding doctrine', es: 'Doctrina de incorporación por IA, manual y agente', pt: 'Doutrina de integração por IA, manual e agente', pl: 'Doktryna wdrażania przez AI, ręcznie i przez agenta', ru: 'Доктрина настройки через AI, вручную и браузерным агентом' },
  },
  {
    id: 'robotics-protocol-adapters', glyph: '⌖',
    name: { en: 'Robotics Protocol Adapters', es: 'Adaptadores de Protocolos Robóticos', pt: 'Adaptadores de Protocolos Robóticos', pl: 'Adaptery Protokołów Robotycznych', ru: 'Адаптеры робототехнических протоколов' },
    description: { en: 'Supervisory command governance for physical agents while real-time stabilization and safety remain on the robot or autopilot.', es: 'Gobierno de comandos supervisores para agentes físicos, manteniendo el control y la seguridad en tiempo real en el robot.', pt: 'Governança de comandos supervisórios para agentes físicos, mantendo controle e segurança em tempo real no robô.', pl: 'Nadzorcze zarządzanie poleceniami dla agentów fizycznych, z kontrolą czasu rzeczywistego pozostającą na robocie.', ru: 'Управление командами физическим агентам, при этом управление реального времени остаётся на роботе или автопилоте.' },
    foundation: { en: 'MAVLink and ROS 2 adapters through the Agent Gateway', es: 'Adaptadores MAVLink y ROS 2 mediante Agent Gateway', pt: 'Adaptadores MAVLink e ROS 2 pelo Agent Gateway', pl: 'Adaptery MAVLink i ROS 2 przez Agent Gateway', ru: 'Адаптеры MAVLink и ROS 2 через Agent Gateway' },
  },
])

function safeLanguage(value: string): SupportedLanguage {
  return value === 'es' || value === 'pt' || value === 'pl' || value === 'ru' ? value : 'en'
}

export function PreviewProjects() {
  const { lang } = useI18n()
  const language = safeLanguage(lang)

  return (
    <section className="preview-zone" aria-labelledby="preview-projects-heading">
      <div className="preview-head">
        <div>
          <span className="preview-label" id="preview-projects-heading">{TEXT.heading[language]}</span>
          <p>{TEXT.intro[language]}</p>
        </div>
        <span className="preview-count">{PROJECTS.length} {TEXT.badge[language].toLowerCase()}</span>
      </div>
      <div className="preview-grid">
        {PROJECTS.map((project) => (
          <article className="preview-card" key={project.id}>
            <div className="preview-card-top">
              <span className="preview-icon" aria-hidden="true">{project.glyph}</span>
              <span className="preview-badge">{TEXT.badge[language]}</span>
            </div>
            <h3>{project.name[language]}</h3>
            <p>{project.description[language]}</p>
            <small><b>{TEXT.foundation[language]}:</b> {project.foundation[language]}</small>
          </article>
        ))}
      </div>
      <style jsx>{`
        .preview-zone{display:flex;flex-direction:column;gap:10px;padding-top:2px}.preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}.preview-head>div{max-width:820px}.preview-label{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#aeb6ff}.preview-head p{margin:5px 0 0;color:#8f9bb0;font-size:11px;line-height:1.45}.preview-count{display:inline-flex;align-items:center;border:1px solid rgba(139,140,255,.35);background:rgba(98,96,210,.12);color:#c8c9ff;border-radius:999px;padding:5px 10px;font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.preview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.preview-card{display:flex;flex-direction:column;gap:6px;min-width:0;padding:14px;border-radius:16px;border:1px dashed rgba(139,140,255,.35);background:linear-gradient(145deg,rgba(24,25,52,.72),rgba(8,10,24,.78));box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}.preview-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.preview-icon{display:grid;place-items:center;width:29px;height:29px;border-radius:9px;border:1px solid rgba(139,140,255,.55);color:#b8b9ff;font-size:14px}.preview-badge{border:1px solid currentColor;color:#b7b8ff;border-radius:999px;padding:3px 7px;font-size:8.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.preview-card h3{margin:2px 0 0;color:#f4f4ff;font-size:13.5px}.preview-card p{margin:0;color:#a0a8bc;font-size:11px;line-height:1.4}.preview-card small{margin-top:auto;padding-top:8px;border-top:1px solid rgba(255,255,255,.07);color:#8994aa;font-size:9.5px;line-height:1.4}.preview-card small b{color:#b7b8d6}@media(max-width:560px){.preview-grid{grid-template-columns:1fr}}
      `}</style>
    </section>
  )
}
