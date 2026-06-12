'use client'

// saas/app/hub/page.tsx
// SignalBoost Hub Console — Phase 1A static prototype (HMI redesign).
// Mock data only. No live API calls, no write operations. Safe by design.
// Card pattern: Color band (icon + title + plain-language role) → Status → Simple details → Expandable advanced details → Action button.

import { useState } from 'react'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<string, Record<Lang, string>> = {
  title:        { en: 'SignalBoost Hub Console', es: 'Consola Hub de SignalBoost', pt: 'Console Hub da SignalBoost', pl: 'Konsola Hub SignalBoost', ru: 'Консоль Hub SignalBoost' },
  subtitle:     { en: 'Unified operations for data, payments and deployment', es: 'Operaciones unificadas de datos, pagos y despliegue', pt: 'Operações unificadas de dados, pagamentos e implantação', pl: 'Zunifikowane operacje danych, płatności i wdrożeń', ru: 'Единое управление данными, платежами и развёртыванием' },
  phaseBadge:   { en: 'Phase 1A · Mock data', es: 'Fase 1A · Datos de prueba', pt: 'Fase 1A · Dados fictícios', pl: 'Faza 1A · Dane testowe', ru: 'Фаза 1A · Тестовые данные' },
  systemHealth: { en: 'System health', es: 'Estado del sistema', pt: 'Saúde do sistema', pl: 'Stan systemu', ru: 'Состояние системы' },
  yourData:     { en: 'Your Data', es: 'Tus Datos', pt: 'Seus Dados', pl: 'Twoje Dane', ru: 'Ваши данные' },
  yourPayments: { en: 'Your Payments', es: 'Tus Pagos', pt: 'Seus Pagamentos', pl: 'Twoje Płatności', ru: 'Ваши платежи' },
  yourWebsite:  { en: 'Your Website', es: 'Tu Sitio Web', pt: 'Seu Site', pl: 'Twoja Strona', ru: 'Ваш сайт' },
  yourTeam:     { en: 'Your Team', es: 'Tu Equipo', pt: 'Sua Equipe', pl: 'Twój Zespół', ru: 'Ваша команда' },
  manageData:   { en: 'Manage your data & accounts.', es: 'Gestiona tus datos y cuentas.', pt: 'Gerencie seus dados e contas.', pl: 'Zarządzaj danymi i kontami.', ru: 'Управляйте данными и аккаунтами.' },
  managePay:    { en: 'Manage your payments & plans.', es: 'Gestiona tus pagos y planes.', pt: 'Gerencie seus pagamentos e planos.', pl: 'Zarządzaj płatnościami i planami.', ru: 'Управляйте платежами и тарифами.' },
  manageHost:   { en: 'Manage your hosting & versions.', es: 'Gestiona tu alojamiento y versiones.', pt: 'Gerencie sua hospedagem e versões.', pl: 'Zarządzaj hostingiem i wersjami.', ru: 'Управляйте хостингом и версиями.' },
  manageTeam:   { en: 'Manage roles & activity history.', es: 'Gestiona roles e historial de actividad.', pt: 'Gerencie funções e histórico de atividade.', pl: 'Zarządzaj rolami i historią aktywności.', ru: 'Управляйте ролями и историей действий.' },
  statusDb:     { en: 'Database is online', es: 'Base de datos en línea', pt: 'Banco de dados online', pl: 'Baza danych działa', ru: 'База данных в сети' },
  statusPay:    { en: 'Payments connected', es: 'Pagos conectados', pt: 'Pagamentos conectados', pl: 'Płatności połączone', ru: 'Платежи подключены' },
  statusHost:   { en: 'Hosting active', es: 'Alojamiento activo', pt: 'Hospedagem ativa', pl: 'Hosting aktywny', ru: 'Хостинг активен' },
  statusRoles:  { en: 'Roles assigned', es: 'Roles asignados', pt: 'Funções atribuídas', pl: 'Role przypisane', ru: 'Роли назначены' },
  openSupabase: { en: 'Open Supabase Settings', es: 'Abrir Configuración de Supabase', pt: 'Abrir Configurações do Supabase', pl: 'Otwórz Ustawienia Supabase', ru: 'Открыть настройки Supabase' },
  openStripe:   { en: 'Open Stripe Plans', es: 'Abrir Planes de Stripe', pt: 'Abrir Planos da Stripe', pl: 'Otwórz Plany Stripe', ru: 'Открыть тарифы Stripe' },
  openVercel:   { en: 'Open Vercel Settings', es: 'Abrir Configuración de Vercel', pt: 'Abrir Configurações da Vercel', pl: 'Otwórz Ustawienia Vercel', ru: 'Открыть настройки Vercel' },
  openTeam:     { en: 'Open Team Activity', es: 'Abrir Actividad del Equipo', pt: 'Abrir Atividade da Equipe', pl: 'Otwórz Aktywność Zespołu', ru: 'Открыть активность команды' },
  showDetails:  { en: 'Show details', es: 'Mostrar detalles', pt: 'Mostrar detalhes', pl: 'Pokaż szczegóły', ru: 'Показать детали' },
  hideDetails:  { en: 'Hide details', es: 'Ocultar detalles', pt: 'Ocultar detalhes', pl: 'Ukryj szczegóły', ru: 'Скрыть детали' },
  projectUrl:   { en: 'Project URL', es: 'URL del proyecto', pt: 'URL do projeto', pl: 'URL projektu', ru: 'URL проекта' },
  anonKey:      { en: 'Public anon key', es: 'Clave anónima pública', pt: 'Chave anônima pública', pl: 'Publiczny klucz anon', ru: 'Публичный anon-ключ' },
  apiHealth:    { en: 'Health check', es: 'Chequeo de salud', pt: 'Verificação de saúde', pl: 'Kontrola stanu', ru: 'Проверка состояния' },
  healthy:      { en: 'Healthy', es: 'Saludable', pt: 'Saudável', pl: 'Sprawne', ru: 'Исправно' },
  webhooks:     { en: 'Webhook subscriptions', es: 'Suscripciones de webhooks', pt: 'Assinaturas de webhooks', pl: 'Subskrypcje webhooków', ru: 'Подписки вебхуков' },
  active:       { en: 'Active', es: 'Activo', pt: 'Ativo', pl: 'Aktywny', ru: 'Активен' },
  failing:      { en: 'Failing', es: 'Fallando', pt: 'Falhando', pl: 'Błędy', ru: 'Сбои' },
  settingsCount:{ en: 'settings', es: 'ajustes', pt: 'configurações', pl: 'ustawień', ru: 'настроек' },
  envVars:      { en: 'Variable names (values hidden)', es: 'Nombres de variables (valores ocultos)', pt: 'Nomes de variáveis (valores ocultos)', pl: 'Nazwy zmiennych (wartości ukryte)', ru: 'Имена переменных (значения скрыты)' },
  timeline:     { en: 'Activity timeline', es: 'Línea de actividad', pt: 'Linha de atividade', pl: 'Oś aktywności', ru: 'Лента активности' },
  alerts:       { en: 'Alerts', es: 'Alertas', pt: 'Alertas', pl: 'Alerty', ru: 'Оповещения' },
  alertStripe:  { en: 'Stripe Price ID mismatch: Launch plan differs from configuration.', es: 'Discrepancia de Price ID en Stripe: el plan Launch difiere de la configuración.', pt: 'Divergência de Price ID na Stripe: o plano Launch difere da configuração.', pl: 'Niezgodność Price ID w Stripe: plan Launch różni się od konfiguracji.', ru: 'Несовпадение Price ID в Stripe: план Launch отличается от конфигурации.' },
  alertEnv:     { en: 'Settings differ between environments.', es: 'Los ajustes difieren entre entornos.', pt: 'As configurações diferem entre ambientes.', pl: 'Ustawienia różnią się między środowiskami.', ru: 'Настройки различаются между окружениями.' },
  review:       { en: 'Check now', es: 'Revisar', pt: 'Verificar', pl: 'Sprawdź', ru: 'Проверить' },
  phaseNote:    { en: 'Connects in Phase 1B (read-only API). Nothing executes in this prototype.', es: 'Se conecta en la Fase 1B (API de solo lectura). Nada se ejecuta en este prototipo.', pt: 'Conecta na Fase 1B (API somente leitura). Nada é executado neste protótipo.', pl: 'Połączenie w Fazie 1B (API tylko do odczytu). Nic nie jest wykonywane w tym prototypie.', ru: 'Подключение в Фазе 1B (API только для чтения). В этом прототипе ничего не выполняется.' },
  roleBilling:  { en: 'Billing Admin', es: 'Admin de Facturación', pt: 'Admin de Cobrança', pl: 'Admin Rozliczeń', ru: 'Админ биллинга' },
  roleDev:      { en: 'Developer', es: 'Desarrollador', pt: 'Desenvolvedor', pl: 'Programista', ru: 'Разработчик' },
  roleTeam:     { en: 'Team Member', es: 'Miembro del Equipo', pt: 'Membro da Equipe', pl: 'Członek Zespołu', ru: 'Участник команды' },
  perMonth:     { en: '/mo', es: '/mes', pt: '/mês', pl: '/mies.', ru: '/мес' },
  futureTitle:  { en: 'Provider slots ready', es: 'Espacios de proveedor listos', pt: 'Slots de provedores prontos', pl: 'Gotowe miejsca na dostawców', ru: 'Слоты для провайдеров готовы' },
  futureNote:   { en: 'Each new provider is one card. Planned for the AI expansion phase.', es: 'Cada nuevo proveedor es una tarjeta. Planificado para la fase de expansión de IA.', pt: 'Cada novo provedor é um cartão. Planejado para a fase de expansão de IA.', pl: 'Każdy nowy dostawca to jedna karta. Zaplanowane na fazę ekspansji AI.', ru: 'Каждый новый провайдер — одна карта. Запланировано на фазу расширения ИИ.' },
}

function c(key: string, lang: Lang): string {
  const entry = COPY[key]
  if (!entry) return key
  return entry[lang] || entry.en
}

const LANGS: Lang[] = ['en', 'es', 'pt', 'pl', 'ru']

type Role = 'billing' | 'dev' | 'team'
type Scope = 'Production' | 'Preview' | 'Development'

const MOCK_TIERS = [
  { name: 'Free',    price: '$0',   id: 'price_MOCK_free_xxxxxx',   status: 'ok' },
  { name: 'Launch',  price: '$29',  id: 'price_MOCK_launch_xxxxxx', status: 'mismatch' },
  { name: 'Growth',  price: '$79',  id: 'price_MOCK_growth_xxxxxx', status: 'ok' },
  { name: 'Command', price: '$199', id: 'price_MOCK_command_xxxxx', status: 'ok' },
]

const MOCK_WEBHOOKS = [
  { event: 'checkout.session.completed', status: 'active' },
  { event: 'customer.subscription.updated', status: 'active' },
  { event: 'invoice.payment_failed', status: 'failing' },
]

const MOCK_SCOPES: { scope: Scope; vars: number; state: string }[] = [
  { scope: 'Production',  vars: 14, state: 'ok' },
  { scope: 'Preview',     vars: 13, state: 'warn' },
  { scope: 'Development', vars: 14, state: 'ok' },
]

const MOCK_ENV_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'OPENAI_API_KEY', 'GITHUB_WRITE_TOKEN']

const MOCK_AUDIT: { time: string; actor: string; action: string; roles: Role[] }[] = [
  { time: '12 Jun · 14:32', actor: 'owner', action: 'Updated Stripe price for Launch plan', roles: ['billing'] },
  { time: '12 Jun · 13:05', actor: 'ai-chief', action: 'Committed redesign to preview branch', roles: ['dev'] },
  { time: '12 Jun · 11:48', actor: 'owner', action: 'Rotated OPENAI_API_KEY in Production', roles: ['dev', 'billing'] },
  { time: '11 Jun · 19:21', actor: 'system', action: 'Daily opportunity scan completed', roles: ['team', 'dev', 'billing'] },
  { time: '11 Jun · 16:02', actor: 'owner', action: 'Merged preview branch into production', roles: ['dev'] },
]

type Tone = { strong: string; soft: string; border: string }
const TONES: Record<string, Tone> = {
  green:  { strong: '#10b981', soft: 'rgba(16,185,129,.16)',  border: 'rgba(16,185,129,.45)' },
  blue:   { strong: '#3b82f6', soft: 'rgba(59,130,246,.16)',  border: 'rgba(59,130,246,.45)' },
  purple: { strong: '#8b5cf6', soft: 'rgba(139,92,246,.16)',  border: 'rgba(139,92,246,.45)' },
  gray:   { strong: '#94a3b8', soft: 'rgba(148,163,184,.14)', border: 'rgba(148,163,184,.4)' },
}

const cardStyle: React.CSSProperties = { background: 'linear-gradient(160deg, rgba(15,23,42,.72), rgba(3,7,18,.86))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 18px 48px rgba(0,0,0,.42)', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }
const bodyStyle: React.CSSProperties = { padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }
const labelStyle: React.CSSProperties = { fontSize: 10.5, letterSpacing: '.13em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 11px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, fontSize: 13 }
const monoStyle: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, color: 'rgba(255,255,255,.78)' }

function Dot({ tone }: { tone: 'green' | 'yellow' | 'red' }) {
  const color = tone === 'green' ? '#22c55e' : tone === 'yellow' ? '#ffc300' : '#ef4444'
  return <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}`, display: 'inline-block', flexShrink: 0 }} />
}

function Band({ tone, icon, title, plain, sub }: { tone: Tone; icon: string; title: string; plain: string; sub: string }) {
  return (
    <div style={{ padding: '14px 16px 12px', background: `linear-gradient(135deg, ${tone.soft}, rgba(3,7,18,.0))`, borderBottom: `1px solid ${tone.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: tone.soft, border: `1px solid ${tone.border}`, flexShrink: 0 }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>{title}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: tone.strong }}>{plain}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.55)' }}>{sub}</div>
        </div>
      </div>
    </div>
  )
}

function Status({ text }: { text: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: '#22c55e' }}><span>✅</span>{text}</div>
}

function ActionButton({ tone, label, href }: { tone: Tone; label: string; href: string }) {
  return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="hub-btn" style={{ marginTop: 'auto', display: 'block', textAlign: 'center', padding: '10px 14px', borderRadius: 11, border: `1px solid ${tone.border}`, background: tone.soft, color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>{label}</a>
}

function DetailsToggle({ open, onClick, lang }: { open: boolean; onClick: () => void; lang: Lang }) {
  return <button onClick={onClick} className="hub-chip" style={{ alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.7)' }}>{open ? '▴ ' + c('hideDetails', lang) : '▾ ' + c('showDetails', lang)}</button>
}

export default function HubConsolePage() {
  const [lang, setLang] = useState<Lang>('en')
  const [role, setRole] = useState<Role>('billing')
  const [scope, setScope] = useState<Scope>('Production')
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }))
  const audit = MOCK_AUDIT.filter(e => e.roles.includes(role))
  const roleLabel: Record<Role, string> = { billing: c('roleBilling', lang), dev: c('roleDev', lang), team: c('roleTeam', lang) }
  const selectedScope = MOCK_SCOPES.find(s => s.scope === scope) || MOCK_SCOPES[0]

  return (
    <div className="hub-root" style={{ minHeight: '100vh', background: 'radial-gradient(1100px 500px at 80% -10%, rgba(26,240,255,.10), transparent 60%), radial-gradient(900px 480px at 0% 110%, rgba(255,195,0,.07), transparent 55%), linear-gradient(180deg, #0b1220 0%, #030712 100%)', color: '#fff', padding: '18px clamp(14px, 1.6vw, 34px) 14px', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      <style>{`.hub-card{transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;} .hub-card:hover{transform:translateY(-3px); box-shadow:0 24px 60px rgba(0,0,0,.55);} .hub-chip{transition:background .15s ease, color .15s ease, border-color .15s ease; cursor:pointer;} .hub-chip:hover{border-color:rgba(255,195,0,.6);} .hub-btn{transition:filter .15s ease, transform .12s ease; cursor:pointer;} .hub-btn:hover{transform:translateY(-1px); filter:brightness(1.25);} .hub-panel::-webkit-scrollbar{width:8px;} .hub-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:8px;} .hub-panel::-webkit-scrollbar-track{background:transparent;} @media (min-width:1100px){ .hub-root{height:calc(100vh - 80px);min-height:0;overflow:hidden;} .hub-frame{display:flex;flex-direction:column;height:100%;min-height:0;} .hub-main{flex:1;min-height:0;grid-auto-rows:minmax(0,1fr);} .hub-panel{overflow-y:auto;min-height:0;} }`}</style>

      <div className="hub-frame" style={{ width: '100%' }}>
      {/* ── Header row ─────────────────────────────────────────────── */}
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 800, letterSpacing: '-.02em', background: 'linear-gradient(90deg, #fff 30%, #1af0ff 75%, #ffc300 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{c('title', lang)}</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,.55)' }}>{c('subtitle', lang)} · <span style={{ color: '#ffc300' }}>{c('phaseBadge', lang)}</span></p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {LANGS.map(l => (
              <button key={l} onClick={() => setLang(l)} className="hub-chip" style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', background: lang === l ? 'rgba(26,240,255,.16)' : 'rgba(255,255,255,.04)', border: lang === l ? '1px solid rgba(26,240,255,.5)' : '1px solid rgba(255,255,255,.12)', color: lang === l ? '#1af0ff' : 'rgba(255,255,255,.6)' }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)' }}>
            <span style={labelStyle}>{c('systemHealth', lang)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone="green" /> Supabase</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone="green" /> Stripe</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone="yellow" /> Vercel</span>
          </div>
        </div>
      </header>

      {/* ── Alerts ─────────────────────────────────────────────────── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div className="hub-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.09)' }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13 }}>{c('alertStripe', lang)}</span>
          <button onClick={() => setOpenNote(openNote === 'stripe' ? null : 'stripe')} className="hub-btn" style={{ padding: '6px 13px', borderRadius: 9, border: '1px solid rgba(239,68,68,.5)', background: 'rgba(239,68,68,.14)', color: '#fca5a5', fontSize: 12.5, fontWeight: 700 }}>{c('review', lang)}</button>
          {openNote === 'stripe' && <div style={{ flexBasis: '100%', fontSize: 12.5, color: 'rgba(255,255,255,.6)' }}>{c('phaseNote', lang)}</div>}
        </div>
        <div className="hub-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(255,195,0,.45)', background: 'rgba(255,195,0,.07)' }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13 }}>{c('alertEnv', lang)}</span>
          <button onClick={() => setOpenNote(openNote === 'env' ? null : 'env')} className="hub-btn" style={{ padding: '6px 13px', borderRadius: 9, border: '1px solid rgba(255,195,0,.5)', background: 'rgba(255,195,0,.12)', color: '#ffc300', fontSize: 12.5, fontWeight: 700 }}>{c('review', lang)}</button>
          {openNote === 'env' && <div style={{ flexBasis: '100%', fontSize: 12.5, color: 'rgba(255,255,255,.6)' }}>{c('phaseNote', lang)}</div>}
        </div>
      </section>

      {/* ── Provider cards ─────────────────────────────────────────── */}
      <main className="hub-main" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(295px, 1fr))', gap: 14 }}>

        {/* Supabase — Your Data */}
        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.green} icon="🗄️" title="Supabase" plain={c('yourData', lang)} sub={c('manageData', lang)} />
          <div style={bodyStyle}>
            <Status text={c('statusDb', lang)} />
            <DetailsToggle open={!!open.supa} onClick={() => toggle('supa')} lang={lang} />
            {open.supa && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('projectUrl', lang)}</span><span style={monoStyle}>https://mock-project.supabase.co</span></div>
                <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('anonKey', lang)}</span><span style={monoStyle}>eyJh••••••••••3kQ</span></div>
                <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('apiHealth', lang)}</span><span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Dot tone="green" /><span style={{ color: '#22c55e', fontWeight: 600 }}>{c('healthy', lang)}</span></span></div>
              </div>
            )}
            <ActionButton tone={TONES.green} label={c('openSupabase', lang)} href="https://supabase.com/dashboard/project/qpblefwtnbivuusxmabv" />
          </div>
        </section>

        {/* Stripe — Your Payments */}
        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.blue} icon="💳" title="Stripe" plain={c('yourPayments', lang)} sub={c('managePay', lang)} />
          <div style={bodyStyle}>
            <Status text={c('statusPay', lang)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {MOCK_TIERS.map(t => (
                <div key={t.name} style={{ ...rowStyle, border: t.status === 'mismatch' ? '1px solid rgba(239,68,68,.55)' : rowStyle.border, background: t.status === 'mismatch' ? 'rgba(239,68,68,.08)' : rowStyle.background }}>
                  <span style={{ fontWeight: 700 }}>{t.name}</span>
                  <span style={{ color: '#ffc300', fontWeight: 800, fontSize: 14 }}>{t.price}<span style={{ color: 'rgba(255,255,255,.45)', fontWeight: 400, fontSize: 12 }}>{c('perMonth', lang)}</span></span>
                </div>
              ))}
            </div>
            <DetailsToggle open={!!open.stripe} onClick={() => toggle('stripe')} lang={lang} />
            {open.stripe && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={labelStyle}>{c('webhooks', lang)}</div>
                {MOCK_WEBHOOKS.map(w => (
                  <div key={w.event} style={rowStyle}>
                    <span style={monoStyle}>{w.event}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot tone={w.status === 'active' ? 'green' : 'red'} /><span style={{ color: w.status === 'active' ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: 12 }}>{w.status === 'active' ? c('active', lang) : c('failing', lang)}</span></span>
                  </div>
                ))}
                {MOCK_TIERS.map(t => (<div key={t.id} style={rowStyle}><span style={{ fontWeight: 600 }}>{t.name}</span><span style={monoStyle}>{t.id}</span></div>))}
              </div>
            )}
            <ActionButton tone={TONES.blue} label={c('openStripe', lang)} href="https://dashboard.stripe.com" />
          </div>
        </section>

        {/* Vercel — Your Website */}
        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.purple} icon="🌐" title="Vercel" plain={c('yourWebsite', lang)} sub={c('manageHost', lang)} />
          <div style={bodyStyle}>
            <Status text={c('statusHost', lang)} />
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {MOCK_SCOPES.map(s => (
                <button key={s.scope} onClick={() => setScope(s.scope)} className="hub-chip" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7, background: scope === s.scope ? TONES.purple.soft : 'rgba(255,255,255,.04)', border: scope === s.scope ? `1px solid ${TONES.purple.border}` : '1px solid rgba(255,255,255,.12)', color: scope === s.scope ? '#c4b5fd' : 'rgba(255,255,255,.6)' }}>{s.scope}<Dot tone={s.state === 'ok' ? 'green' : 'yellow'} /></button>
              ))}
            </div>
            <div style={{ ...rowStyle, justifyContent: 'flex-start', gap: 8 }}><span style={{ fontWeight: 700 }}>{selectedScope.scope}</span><span style={{ color: 'rgba(255,255,255,.55)' }}>· {selectedScope.vars} {c('settingsCount', lang)}</span></div>
            <DetailsToggle open={!!open.vercel} onClick={() => toggle('vercel')} lang={lang} />
            {open.vercel && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={labelStyle}>{c('envVars', lang)}</div>
                {MOCK_ENV_VARS.map(v => (<div key={v} style={rowStyle}><span style={monoStyle}>{v}</span><span style={{ ...monoStyle, color: 'rgba(255,255,255,.35)' }}>••••••••</span></div>))}
              </div>
            )}
            <ActionButton tone={TONES.purple} label={c('openVercel', lang)} href="https://vercel.com/dashboard" />
          </div>
        </section>

        {/* Governance — Your Team */}
        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.gray} icon="👥" title="Governance" plain={c('yourTeam', lang)} sub={c('manageTeam', lang)} />
          <div style={bodyStyle}>
            <Status text={c('statusRoles', lang)} />
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {(['billing', 'dev', 'team'] as Role[]).map(r => (
                <button key={r} onClick={() => setRole(r)} className="hub-chip" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: role === r ? 'rgba(255,195,0,.14)' : 'rgba(255,255,255,.04)', border: role === r ? '1px solid rgba(255,195,0,.55)' : '1px solid rgba(255,255,255,.12)', color: role === r ? '#ffc300' : 'rgba(255,255,255,.6)' }}>{roleLabel[r]}</button>
              ))}
            </div>
            <div style={labelStyle}>{c('timeline', lang)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(open.gov ? audit : audit.slice(0, 2)).map((e, i) => (
                <div key={i} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 10 }}><span style={{ ...monoStyle, color: '#1af0ff' }}>{e.time}</span><span style={{ ...monoStyle, color: 'rgba(255,255,255,.45)' }}>{e.actor}</span></div>
                  <div style={{ fontSize: 12.5 }}>{e.action}</div>
                </div>
              ))}
            </div>
            {audit.length > 2 && <DetailsToggle open={!!open.gov} onClick={() => toggle('gov')} lang={lang} />}
            <ActionButton tone={TONES.gray} label={c('openTeam', lang)} href="/admin/settings/roles" />
          </div>
        </section>

        {/* Provider expansion slot */}
        <section className="hub-panel" style={{ ...cardStyle, border: '1px dashed rgba(255,255,255,.18)', background: 'rgba(255,255,255,.02)', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 10, padding: 18, minHeight: 200 }}>
          <span style={{ fontSize: 26, opacity: .8 }}>➕</span>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,.85)' }}>{c('futureTitle', lang)}</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.45)', maxWidth: 260 }}>{c('futureNote', lang)}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['OpenAI', 'Anthropic', 'ElevenLabs'].map(p => (<span key={p} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(26,240,255,.25)', color: 'rgba(26,240,255,.7)', fontSize: 11.5 }}>{p}</span>))}
          </div>
        </section>

      </main>
      </div>
    </div>
  )
}
