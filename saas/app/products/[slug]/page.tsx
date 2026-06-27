'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type ProductSlug =
  | 'audit-center'
  | 'cybersecurity-center'
  | 'identity-secrets'
  | 'console-hub'
  | 'pr-cockpit'
  | 'admin-cockpit'
  | 'marketing-sales'
  | 'promote-business'
  | 'outreach'
  | 'calendar'
  | 'spreadsheets'
  | 'video-studio'

type Product = {
  icon: string
  accent: string
  workspaceHref: string
  titles: Record<Lang, string>
  summaries: Record<Lang, string>
  bullets: Record<Lang, string[]>
}

const CTA: Record<Lang, { back: string; kicker: string; included: string; gated: string; continue: string; pricing: string; notFound: string; notFoundBody: string }> = {
  en: { back: 'SignalBoost', kicker: 'Product window', included: 'What you get', gated: 'Usage requires signup/login. Visitors can review the product before entering the workspace.', continue: 'Continue to SignalBoost', pricing: 'View pricing', notFound: 'Product not found', notFoundBody: 'This product page is not available yet.' },
  es: { back: 'SignalBoost', kicker: 'Vista del producto', included: 'Lo que incluye', gated: 'El uso requiere registro/login. Los visitantes pueden revisar el producto antes de entrar al workspace.', continue: 'Continuar a SignalBoost', pricing: 'Ver precios', notFound: 'Producto no encontrado', notFoundBody: 'Esta página de producto aún no está disponible.' },
  pt: { back: 'SignalBoost', kicker: 'Vitrine do produto', included: 'O que está incluído', gated: 'O uso requer cadastro/login. Visitantes podem revisar o produto antes de entrar no workspace.', continue: 'Continuar para o SignalBoost', pricing: 'Ver preços', notFound: 'Produto não encontrado', notFoundBody: 'Esta página de produto ainda não está disponível.' },
  pl: { back: 'SignalBoost', kicker: 'Okno produktu', included: 'Co otrzymujesz', gated: 'Użycie wymaga rejestracji/logowania. Odwiedzający mogą zobaczyć produkt przed wejściem do workspace.', continue: 'Kontynuuj do SignalBoost', pricing: 'Zobacz ceny', notFound: 'Nie znaleziono produktu', notFoundBody: 'Ta strona produktu nie jest jeszcze dostępna.' },
  ru: { back: 'SignalBoost', kicker: 'Витрина продукта', included: 'Что входит', gated: 'Для использования требуется регистрация/вход. Посетители могут изучить продукт перед входом в workspace.', continue: 'Продолжить в SignalBoost', pricing: 'Посмотреть цены', notFound: 'Продукт не найден', notFoundBody: 'Эта страница продукта пока недоступна.' },
}

const PRODUCTS: Record<ProductSlug, Product> = {
  'audit-center': {
    icon: '📋', accent: '#a78bfa', workspaceHref: '/dashboard/audit',
    titles: { en: 'Audit Center', es: 'Centro de Auditoría', pt: 'Centro de Auditoria', pl: 'Centrum Audytu', ru: 'Audit Center' },
    summaries: { en: 'Run readiness reviews, collect evidence, and turn findings into owner-approved improvement plans.', es: 'Ejecuta revisiones de preparación, reúne evidencia y convierte hallazgos en planes aprobados.', pt: 'Execute revisões de prontidão, reúna evidências e transforme constatações em planos aprovados.', pl: 'Uruchamiaj przeglądy gotowości, zbieraj dowody i zmieniaj wyniki w zatwierdzone plany.', ru: 'Проводите readiness reviews, собирайте evidence и превращайте findings в утверждённые планы.' },
    bullets: { en: ['Readiness checks', 'Evidence and report workflow', 'Owner-approved remediation planning'], es: ['Revisiones de preparación', 'Flujo de evidencia e informes', 'Planificación aprobada por propietario'], pt: ['Verificações de prontidão', 'Fluxo de evidências e relatórios', 'Planejamento aprovado pelo proprietário'], pl: ['Kontrole gotowości', 'Workflow dowodów i raportów', 'Planowanie napraw z akceptacją'], ru: ['Readiness checks', 'Evidence/report workflow', 'Планирование с утверждением владельца'] },
  },
  'cybersecurity-center': {
    icon: '🛡️', accent: '#1af0ff', workspaceHref: '/dashboard/cybersecurity',
    titles: { en: 'Cybersecurity Center', es: 'Centro de Ciberseguridad', pt: 'Centro de Cibersegurança', pl: 'Centrum Cyberbezpieczeństwa', ru: 'Cybersecurity Center' },
    summaries: { en: 'Monitor public and dependency risk signals, review alerts, and prepare safe fix plans.', es: 'Monitorea señales públicas y riesgos de dependencias, revisa alertas y prepara planes seguros.', pt: 'Monitore sinais públicos e riscos de dependências, revise alertas e prepare planos seguros.', pl: 'Monitoruj sygnały publiczne i ryzyko zależności, przeglądaj alerty i przygotuj bezpieczne plany.', ru: 'Отслеживайте публичные сигналы и dependency risk, проверяйте alerts и готовьте safe fix plans.' },
    bullets: { en: ['Dependency and public web signals', 'Alert inbox', 'Human-approved remediation'], es: ['Señales web y dependencias', 'Bandeja de alertas', 'Remediación aprobada'], pt: ['Sinais web e dependências', 'Caixa de alertas', 'Remediação aprovada'], pl: ['Sygnały web i zależności', 'Skrzynka alertów', 'Naprawy z akceptacją'], ru: ['Web/dependency signals', 'Alert inbox', 'Human-approved remediation'] },
  },
  'identity-secrets': {
    icon: '🔑', accent: '#f59e0b', workspaceHref: '/hub/audit/identity',
    titles: { en: 'Identity & Secrets', es: 'Identidad y Secretos', pt: 'Identidade e Segredos', pl: 'Tożsamość i Sekrety', ru: 'Identity & Secrets' },
    summaries: { en: 'Review identity, access, service accounts, keys, and secret-risk areas from one audit path.', es: 'Revisa identidad, acceso, cuentas de servicio, claves y riesgos de secretos.', pt: 'Revise identidade, acesso, contas de serviço, chaves e riscos de segredos.', pl: 'Przeglądaj tożsamość, dostęp, konta usługowe, klucze i ryzyka sekretów.', ru: 'Проверяйте identity, access, service accounts, keys и secret-risk areas.' },
    bullets: { en: ['Identity review', 'Service-account/key checklist', 'Secret-risk workflow'], es: ['Revisión de identidad', 'Checklist de cuentas y claves', 'Flujo de secretos'], pt: ['Revisão de identidade', 'Checklist de contas e chaves', 'Fluxo de segredos'], pl: ['Przegląd tożsamości', 'Checklist kont i kluczy', 'Workflow sekretów'], ru: ['Identity review', 'Keys checklist', 'Secret-risk workflow'] },
  },
  'console-hub': {
    icon: '🎛️', accent: '#ffc300', workspaceHref: '/hub',
    titles: { en: 'Console Hub', es: 'Console Hub', pt: 'Console Hub', pl: 'Console Hub', ru: 'Console Hub' },
    summaries: { en: 'A central hub for connected providers, deployment context, infrastructure signals, and operational controls.', es: 'Hub central para proveedores conectados, despliegues, infraestructura y controles operativos.', pt: 'Hub central para provedores conectados, contexto de deploy, infraestrutura e controles.', pl: 'Centralny hub dla providerów, wdrożeń, infrastruktury i kontroli operacyjnych.', ru: 'Центральный hub для connected providers, deployments, infrastructure signals и controls.' },
    bullets: { en: ['Provider connections', 'Operational context', 'Approval-aware controls'], es: ['Conexiones de proveedores', 'Contexto operativo', 'Controles con aprobación'], pt: ['Conexões de provedores', 'Contexto operacional', 'Controles com aprovação'], pl: ['Połączenia providerów', 'Kontekst operacyjny', 'Kontrole z akceptacją'], ru: ['Provider connections', 'Operational context', 'Approval controls'] },
  },
  'pr-cockpit': {
    icon: '📋', accent: '#60a5fa', workspaceHref: '/dashboard/infrastructure',
    titles: { en: 'PR Cockpit', es: 'PR Cockpit', pt: 'PR Cockpit', pl: 'PR Cockpit', ru: 'PR Cockpit' },
    summaries: { en: 'Review proposed infrastructure and code changes before anything is committed or deployed.', es: 'Revisa cambios propuestos de infraestructura y código antes de commit o deploy.', pt: 'Revise mudanças propostas de infraestrutura e código antes de commit ou deploy.', pl: 'Przeglądaj proponowane zmiany infrastruktury i kodu przed commit/deploy.', ru: 'Проверяйте proposed infrastructure/code changes перед commit или deploy.' },
    bullets: { en: ['Human approval before change', 'PR-style review', 'Deployment-safe workflow'], es: ['Aprobación humana', 'Revisión tipo PR', 'Flujo seguro de deploy'], pt: ['Aprovação humana', 'Revisão estilo PR', 'Fluxo seguro de deploy'], pl: ['Akceptacja człowieka', 'Przegląd PR', 'Bezpieczny deploy'], ru: ['Human approval', 'PR review', 'Safe deployment workflow'] },
  },
  'admin-cockpit': {
    icon: '🛰️', accent: '#f87171', workspaceHref: '/admin',
    titles: { en: 'Owner/Admin Cockpit', es: 'Cockpit Admin', pt: 'Cockpit Admin', pl: 'Admin Cockpit', ru: 'Admin Cockpit' },
    summaries: { en: 'Owner-level command room for platform status, growth signals, roles, revenue, and internal operations.', es: 'Sala de mando para estado de plataforma, crecimiento, roles, ingresos y operaciones internas.', pt: 'Sala de comando para status da plataforma, crescimento, funções, receita e operações internas.', pl: 'Panel właściciela dla statusu platformy, wzrostu, ról, przychodów i operacji.', ru: 'Owner command room для platform status, growth, roles, revenue и operations.' },
    bullets: { en: ['Owner overview', 'Revenue and role visibility', 'Internal operating signals'], es: ['Vista owner', 'Ingresos y roles', 'Señales internas'], pt: ['Visão owner', 'Receita e funções', 'Sinais internos'], pl: ['Widok właściciela', 'Przychody i role', 'Sygnały operacyjne'], ru: ['Owner overview', 'Revenue/roles', 'Internal signals'] },
  },
  'marketing-sales': {
    icon: '📣', accent: '#fb7185', workspaceHref: '/admin/marketing-sales',
    titles: { en: 'Marketing + Sales Engine', es: 'Motor de Marketing + Ventas', pt: 'Motor de Marketing + Vendas', pl: 'Silnik Marketing + Sprzedaż', ru: 'Marketing + Sales Engine' },
    summaries: { en: 'Turn free tools, campaigns, audio, print, and outreach into owner-approved sales opportunities.', es: 'Convierte herramientas gratis, campañas, audio, print y outreach en oportunidades aprobadas.', pt: 'Transforme ferramentas grátis, campanhas, áudio, print e outreach em oportunidades aprovadas.', pl: 'Zmieniaj darmowe narzędzia, kampanie, audio, print i outreach w zatwierdzone okazje sprzedaży.', ru: 'Превращайте free tools, campaigns, audio, print и outreach в owner-approved opportunities.' },
    bullets: { en: ['Lead-magnet intake', 'Follow-up planning', 'Owner approval before outreach'], es: ['Captura de leads', 'Plan de seguimiento', 'Aprobación antes de outreach'], pt: ['Entrada de leads', 'Plano de follow-up', 'Aprovação antes de outreach'], pl: ['Lead intake', 'Plan follow-up', 'Akceptacja przed outreach'], ru: ['Lead intake', 'Follow-up planning', 'Owner approval'] },
  },
  'promote-business': {
    icon: '📢', accent: '#fb923c', workspaceHref: '/dashboard/promote',
    titles: { en: 'Promote Business', es: 'Promocionar negocio', pt: 'Promover negócio', pl: 'Promocja firmy', ru: 'Promote Business' },
    summaries: { en: 'Create business promotion assets and campaigns with clear approval steps before launch.', es: 'Crea assets y campañas de promoción con pasos claros de aprobación.', pt: 'Crie assets e campanhas de promoção com etapas claras de aprovação.', pl: 'Twórz materiały i kampanie promocyjne z jasnymi etapami akceptacji.', ru: 'Создавайте promotion assets и campaigns с approval steps.' },
    bullets: { en: ['Campaign concepts', 'Promotion copy', 'Launch-ready review'], es: ['Ideas de campaña', 'Copy promocional', 'Revisión antes de launch'], pt: ['Ideias de campanha', 'Copy promocional', 'Revisão antes do lançamento'], pl: ['Pomysły kampanii', 'Copy promocyjne', 'Przegląd przed startem'], ru: ['Campaign concepts', 'Promotion copy', 'Review before launch'] },
  },
  outreach: {
    icon: '🛸', accent: '#22d3ee', workspaceHref: '/dashboard/outreach',
    titles: { en: 'Outreach', es: 'Outreach', pt: 'Outreach', pl: 'Outreach', ru: 'Outreach' },
    summaries: { en: 'Plan contacts, messages, campaigns, and pipeline steps without sending anything before approval.', es: 'Planifica contactos, mensajes, campañas y pipeline sin enviar antes de aprobación.', pt: 'Planeje contatos, mensagens, campanhas e pipeline sem enviar antes da aprovação.', pl: 'Planuj kontakty, wiadomości, kampanie i pipeline bez wysyłki przed akceptacją.', ru: 'Планируйте contacts, messages, campaigns и pipeline без отправки до approval.' },
    bullets: { en: ['Campaign queue', 'Message planning', 'Approval-first outreach'], es: ['Cola de campañas', 'Plan de mensajes', 'Outreach con aprobación'], pt: ['Fila de campanhas', 'Plano de mensagens', 'Outreach com aprovação'], pl: ['Kolejka kampanii', 'Plan wiadomości', 'Outreach z akceptacją'], ru: ['Campaign queue', 'Message planning', 'Approval-first outreach'] },
  },
  calendar: {
    icon: '📅', accent: '#4ade80', workspaceHref: '/dashboard/calendar',
    titles: { en: 'Calendar', es: 'Calendario', pt: 'Calendário', pl: 'Kalendarz', ru: 'Calendar' },
    summaries: { en: 'Coordinate scheduled work, campaigns, and operating tasks in the SignalBoost workspace.', es: 'Coordina trabajo programado, campañas y tareas operativas.', pt: 'Coordene trabalho programado, campanhas e tarefas operacionais.', pl: 'Koordynuj pracę zaplanowaną, kampanie i zadania operacyjne.', ru: 'Координируйте scheduled work, campaigns и operating tasks.' },
    bullets: { en: ['Scheduling', 'Campaign timing', 'Workspace coordination'], es: ['Programación', 'Timing de campañas', 'Coordinación'], pt: ['Agendamento', 'Timing de campanhas', 'Coordenação'], pl: ['Planowanie', 'Timing kampanii', 'Koordynacja'], ru: ['Scheduling', 'Campaign timing', 'Coordination'] },
  },
  spreadsheets: {
    icon: '📑', accent: '#4ade80', workspaceHref: '/dashboard/spreadsheets',
    titles: { en: 'Spreadsheets', es: 'Hojas de cálculo', pt: 'Planilhas', pl: 'Arkusze', ru: 'Spreadsheets' },
    summaries: { en: 'Work with lists, leads, models, and structured business data inside the workspace.', es: 'Trabaja con listas, leads, modelos y datos estructurados.', pt: 'Trabalhe com listas, leads, modelos e dados estruturados.', pl: 'Pracuj z listami, leadami, modelami i danymi strukturalnymi.', ru: 'Работайте со списками, leads, models и structured business data.' },
    bullets: { en: ['Lead lists', 'Working tables', 'Structured business data'], es: ['Listas de leads', 'Tablas de trabajo', 'Datos estructurados'], pt: ['Listas de leads', 'Tabelas de trabalho', 'Dados estruturados'], pl: ['Listy leadów', 'Tabele robocze', 'Dane strukturalne'], ru: ['Lead lists', 'Working tables', 'Structured data'] },
  },
  'video-studio': {
    icon: '🎬', accent: '#f472b6', workspaceHref: '/dashboard/video',
    titles: { en: 'Video Studio', es: 'Video Studio', pt: 'Video Studio', pl: 'Video Studio', ru: 'Video Studio' },
    summaries: { en: 'Create video assets, clips, captions, and campaign-ready visual content.', es: 'Crea videos, clips, subtítulos y contenido visual para campañas.', pt: 'Crie vídeos, clips, legendas e conteúdo visual para campanhas.', pl: 'Twórz video assets, klipy, napisy i treści wizualne do kampanii.', ru: 'Создавайте video assets, clips, captions и visual campaign content.' },
    bullets: { en: ['Video creation', 'Caption workflow', 'Campaign clips'], es: ['Creación de video', 'Subtítulos', 'Clips de campaña'], pt: ['Criação de vídeo', 'Legendas', 'Clips de campanha'], pl: ['Tworzenie video', 'Napisy', 'Klipy kampanii'], ru: ['Video creation', 'Captions', 'Campaign clips'] },
  },
}

function activeLang(lang: string): Lang {
  return (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang
}

function slugFromParam(raw: unknown): ProductSlug | null {
  const value = Array.isArray(raw) ? raw[0] : String(raw || '')
  return Object.prototype.hasOwnProperty.call(PRODUCTS, value) ? value as ProductSlug : null
}

export default function ProductWindowPage() {
  const params = useParams()
  const { lang } = useI18n()
  const langCode = activeLang(lang)
  const copy = CTA[langCode]
  const slug = slugFromParam(params?.slug)
  const product = slug ? PRODUCTS[slug] : null

  if (!product) {
    return <main className="min-h-screen bg-slate-950 px-5 py-10 text-white"><section className="mx-auto max-w-4xl"><Link href="/" className="text-sm font-semibold text-cyan-200 hover:text-white">← {copy.back}</Link><div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8"><h1 className="text-4xl font-black">{copy.notFound}</h1><p className="mt-3 text-slate-300">{copy.notFoundBody}</p></div></section></main>
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <section className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm font-semibold text-cyan-200 hover:text-white">← {copy.back}</Link>
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-cyan-950/30">
          <span className="inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]" style={{ borderColor: `${product.accent}66`, background: `${product.accent}18`, color: product.accent }}>{copy.kicker}</span>
          <div className="mt-6 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-5xl">{product.icon}</div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-white md:text-6xl">{product.titles[langCode]}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{product.summaries[langCode]}</p>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm font-semibold text-cyan-50 md:max-w-xs">{copy.gated}</div>
          </div>

          <section className="mt-8 rounded-3xl border border-white/10 bg-slate-950/50 p-6">
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{copy.included}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {product.bullets[langCode].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <span className="text-2xl">✓</span>
                  <p className="mt-3 text-sm font-bold leading-6 text-slate-100">{item}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={product.workspaceHref} className="rounded-xl bg-cyan-300 px-5 py-3 text-center font-black text-slate-950 transition hover:bg-white">{copy.continue}</Link>
            <Link href="/pricing" className="rounded-xl border border-white/10 px-5 py-3 text-center font-black text-white transition hover:border-cyan-300/50 hover:text-cyan-100">{copy.pricing}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
