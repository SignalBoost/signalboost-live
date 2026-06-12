'use client'

// saas/app/hub/page.tsx
// SignalBoost Hub Console — Phase 1B: live, read-only.
// Data comes from /api/hub/status (owner-gated). No write operations exist.
// Governance timeline remains sample data until an audit source ships.

import { useEffect, useState } from 'react'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<string, Record<Lang, string>> = {
  title:        { en: 'SignalBoost Hub Console', es: 'Consola Hub de SignalBoost', pt: 'Console Hub da SignalBoost', pl: 'Konsola Hub SignalBoost', ru: 'Консоль Hub SignalBoost' },
  subtitle:     { en: 'Unified operations for data, payments and deployment', es: 'Operaciones unificadas de datos, pagos y despliegue', pt: 'Operações unificadas de dados, pagamentos e implantação', pl: 'Zunifikowane operacje danych, płatności i wdrożeń', ru: 'Единое управление данными, платежами и развёртыванием' },
  phaseBadge:   { en: 'Phase 1B · Live, read-only', es: 'Fase 1B · En vivo, solo lectura', pt: 'Fase 1B · Ao vivo, somente leitura', pl: 'Faza 1B · Na żywo, tylko odczyt', ru: 'Фаза 1B · Живые данные, только чтение' },
  systemHealth: { en: 'System health', es: 'Estado del sistema', pt: 'Saúde do sistema', pl: 'Stan systemu', ru: 'Состояние системы' },
  refresh:      { en: 'Refresh', es: 'Actualizar', pt: 'Atualizar', pl: 'Odśwież', ru: 'Обновить' },
  loading:      { en: 'Loading live data…', es: 'Cargando datos en vivo…', pt: 'Carregando dados ao vivo…', pl: 'Ładowanie danych na żywo…', ru: 'Загрузка живых данных…' },
  loadError:    { en: 'Could not load live data. Try refresh.', es: 'No se pudieron cargar los datos. Intenta actualizar.', pt: 'Não foi possível carregar os dados. Tente atualizar.', pl: 'Nie udało się załadować danych. Spróbuj odświeżyć.', ru: 'Не удалось загрузить данные. Попробуйте обновить.' },
  yourData:     { en: 'Your Data', es: 'Tus Datos', pt: 'Seus Dados', pl: 'Twoje Dane', ru: 'Ваши данные' },
  yourPayments: { en: 'Your Payments', es: 'Tus Pagos', pt: 'Seus Pagamentos', pl: 'Twoje Płatności', ru: 'Ваши платежи' },
  yourWebsite:  { en: 'Your Website', es: 'Tu Sitio Web', pt: 'Seu Site', pl: 'Twoja Strona', ru: 'Ваш сайт' },
  yourTeam:     { en: 'Your Team', es: 'Tu Equipo', pt: 'Sua Equipe', pl: 'Twój Zespół', ru: 'Ваша команда' },
  manageData:   { en: 'Manage your data & accounts.', es: 'Gestiona tus datos y cuentas.', pt: 'Gerencie seus dados e contas.', pl: 'Zarządzaj danymi i kontami.', ru: 'Управляйте данными и аккаунтами.' },
  managePay:    { en: 'Manage your payments & plans.', es: 'Gestiona tus pagos y planes.', pt: 'Gerencie seus pagamentos e planos.', pl: 'Zarządzaj płatnościami i planami.', ru: 'Управляйте платежами и тарифами.' },
  manageHost:   { en: 'Manage your hosting & versions.', es: 'Gestiona tu alojamiento y versiones.', pt: 'Gerencie sua hospedagem e versões.', pl: 'Zarządzaj hostingiem i wersjami.', ru: 'Управляйте хостингом и версиями.' },
  manageTeam:   { en: 'Manage roles & activity history.', es: 'Gestiona roles e historial de actividad.', pt: 'Gerencie funções e histórico de atividade.', pl: 'Zarządzaj rolami i historią aktywności.', ru: 'Управляйте ролями и историей действий.' },
  statusDb:     { en: 'Database is online', es: 'Base de datos en línea', pt: 'Banco de dados online', pl: 'Baza danych działa', ru: 'База данных в сети' },
  statusDbDown: { en: 'Database problem', es: 'Problema con la base de datos', pt: 'Problema no banco de dados', pl: 'Problem z bazą danych', ru: 'Проблема с базой данных' },
  statusPay:    { en: 'Payments connected', es: 'Pagos conectados', pt: 'Pagamentos conectados', pl: 'Płatności połączone', ru: 'Платежи подключены' },
  statusPayDown:{ en: 'Payments problem', es: 'Problema con pagos', pt: 'Problema nos pagamentos', pl: 'Problem z płatnościami', ru: 'Проблема с платежами' },
  statusHost:   { en: 'Hosting connected', es: 'Alojamiento conectado', pt: 'Hospedagem conectada', pl: 'Hosting połączony', ru: 'Хостинг подключён' },
  statusNoToken:{ en: 'Not connected yet', es: 'Aún no conectado', pt: 'Ainda não conectado', pl: 'Jeszcze nie połączono', ru: 'Ещё не подключено' },
  tokenHint:    { en: 'Add a VERCEL_TOKEN environment variable to activate this card.', es: 'Agrega la variable de entorno VERCEL_TOKEN para activar esta tarjeta.', pt: 'Adicione a variável de ambiente VERCEL_TOKEN para ativar este cartão.', pl: 'Dodaj zmienną środowiskową VERCEL_TOKEN, aby aktywować tę kartę.', ru: 'Добавьте переменную окружения VERCEL_TOKEN, чтобы активировать эту карту.' },
  statusRoles:  { en: 'Roles assigned', es: 'Roles asignados', pt: 'Funções atribuídas', pl: 'Role przypisane', ru: 'Роли назначены' },
  openSupabase: { en: 'Open Supabase Settings', es: 'Abrir Configuración de Supabase', pt: 'Abrir Configurações do Supabase', pl: 'Otwórz Ustawienia Supabase', ru: 'Открыть настройки Supabase' },
  openStripe:   { en: 'Open Stripe Plans', es: 'Abrir Planes de Stripe', pt: 'Abrir Planos da Stripe', pl: 'Otwórz Plany Stripe', ru: 'Открыть тарифы Stripe' },
  openVercel:   { en: 'Open Vercel Settings', es: 'Abrir Configuración de Vercel', pt: 'Abrir Configurações da Vercel', pl: 'Otwórz Ustawienia Vercel', ru: 'Открыть настройки Vercel' },
  openTeam:     { en: 'Open Team Activity', es: 'Abrir Actividad del Equipo', pt: 'Abrir Atividade da Equipe', pl: 'Otwórz Aktywność Zespołu', ru: 'Открыть активность команды' },
  showDetails:  { en: 'Show details', es: 'Mostrar detalles', pt: 'Mostrar detalhes', pl: 'Pokaż szczegóły', ru: 'Показать детали' },
  hideDetails:  { en: 'Hide details', es: 'Ocultar detalles', pt: 'Ocultar detalhes', pl: 'Ukryj szczegóły', ru: 'Скрыть детали' },
  projectUrl:   { en: 'Project', es: 'Proyecto', pt: 'Projeto', pl: 'Projekt', ru: 'Проект' },
  anonKey:      { en: 'Public anon key', es: 'Clave anónima pública', pt: 'Chave anônima pública', pl: 'Publiczny klucz anon', ru: 'Публичный anon-ключ' },
  latency:      { en: 'Response time', es: 'Tiempo de respuesta', pt: 'Tempo de resposta', pl: 'Czas odpowiedzi', ru: 'Время ответа' },
  webhooks:     { en: 'Webhook subscriptions', es: 'Suscripciones de webhooks', pt: 'Assinaturas de webhooks', pl: 'Subskrypcje webhooków', ru: 'Подписки вебхуков' },
  events:       { en: 'events', es: 'eventos', pt: 'eventos', pl: 'zdarzeń', ru: 'событий' },
  priceIds:     { en: 'Price IDs', es: 'IDs de precios', pt: 'IDs de preços', pl: 'ID cen', ru: 'ID цен' },
  settingsCount:{ en: 'settings', es: 'ajustes', pt: 'configurações', pl: 'ustawień', ru: 'настроек' },
  envVars:      { en: 'Variable names (values hidden)', es: 'Nombres de variables (valores ocultos)', pt: 'Nomes de variáveis (valores ocultos)', pl: 'Nazwy zmiennych (wartości ukryte)', ru: 'Имена переменных (значения скрыты)' },
  timeline:     { en: 'Activity timeline (sample)', es: 'Línea de actividad (ejemplo)', pt: 'Linha de atividade (exemplo)', pl: 'Oś aktywności (przykład)', ru: 'Лента активности (пример)' },
  alerts:       { en: 'Alerts', es: 'Alertas', pt: 'Alertas', pl: 'Alerty', ru: 'Оповещения' },
  allClear:     { en: 'All systems in sync — no issues found.', es: 'Todos los sistemas sincronizados — sin problemas.', pt: 'Todos os sistemas sincronizados — nenhum problema.', pl: 'Wszystkie systemy zsynchronizowane — brak problemów.', ru: 'Все системы синхронизированы — проблем нет.' },
  fixStripe:    { en: 'Fix in Stripe', es: 'Corregir en Stripe', pt: 'Corrigir na Stripe', pl: 'Napraw w Stripe', ru: 'Исправить в Stripe' },
  fixVercel:    { en: 'Fix in Vercel', es: 'Corregir en Vercel', pt: 'Corrigir na Vercel', pl: 'Napraw w Vercel', ru: 'Исправить в Vercel' },
  roleBilling:  { en: 'Billing Admin', es: 'Admin de Facturación', pt: 'Admin de Cobrança', pl: 'Admin Rozliczeń', ru: 'Админ биллинга' },
  roleDev:      { en: 'Developer', es: 'Desarrollador', pt: 'Desenvolvedor', pl: 'Programista', ru: 'Разработчик' },
  roleTeam:     { en: 'Team Member', es: 'Miembro del Equipo', pt: 'Membro da Equipe', pl: 'Członek Zespołu', ru: 'Участник команды' },
  perInterval:  { en: '/', es: '/', pt: '/', pl: '/', ru: '/' },
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

type Tier = { name: string; priceId: string; amount: number; interval: string; mismatch: boolean }
type Webhook = { url: string; status: string; events: number }
type ScopeInfo = { scope: string; count: number; names: string[] }
type HubData = {
  generatedAt: string
  stripe: { ok: boolean; tiers: Tier[]; webhooks: Webhook[]; mismatches: string[]; error?: string }
  supabase: { ok: boolean; latencyMs: number; projectHost: string; anonKeyMasked: string; error?: string }
  vercel: { ok: boolean; configured: boolean; scopes: ScopeInfo[]; error?: string }
  alerts: { stripeMismatches: string[]; envSync: string[] }
}

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

function Status({ ok, text }: { ok: boolean; text: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: ok ? '#22c55e' : '#ffc300' }}><span>{ok ? '✅' : '⚠️'}</span>{text}</div>
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
  const [scopeIdx, setScopeIdx] = useState(0)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = async () => {
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch('/api/hub/status', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json()
      setData(json)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }))
  const audit = MOCK_AUDIT.filter(e => e.roles.includes(role))
  const roleLabel: Record<Role, string> = { billing: c('roleBilling', lang), dev: c('roleDev', lang), team: c('roleTeam', lang) }

  const supaOk = !!data?.supabase.ok
  const stripeOk = !!data?.stripe.ok
  const vercelConfigured = !!data?.vercel.configured
  const vercelOk = !!data?.vercel.ok
  const scopes = data?.vercel.scopes || []
  const selScope = scopes[scopeIdx] || null
  const redAlerts = data?.alerts.stripeMismatches || []
  const yellowAlerts = data?.alerts.envSync || []
  const noAlerts = !loading && !failed && redAlerts.length === 0 && yellowAlerts.length === 0

  return (
    <div className="hub-root" style={{ minHeight: '100vh', background: 'radial-gradient(1100px 500px at 80% -10%, rgba(26,240,255,.10), transparent 60%), radial-gradient(900px 480px at 0% 110%, rgba(255,195,0,.07), transparent 55%), linear-gradient(180deg, #0b1220 0%, #030712 100%)', color: '#fff', padding: '18px clamp(14px, 1.6vw, 34px) 14px', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      <style>{`.hub-card{transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;} .hub-card:hover{transform:translateY(-3px); box-shadow:0 24px 60px rgba(0,0,0,.55);} .hub-chip{transition:background .15s ease, color .15s ease, border-color .15s ease; cursor:pointer;} .hub-chip:hover{border-color:rgba(255,195,0,.6);} .hub-btn{transition:filter .15s ease, transform .12s ease; cursor:pointer;} .hub-btn:hover{transform:translateY(-1px); filter:brightness(1.25);} .hub-panel::-webkit-scrollbar{width:8px;} .hub-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:8px;} .hub-panel::-webkit-scrollbar-track{background:transparent;} @keyframes hubPulse{0%,100%{opacity:.45}50%{opacity:1}} .hub-loading{animation:hubPulse 1.4s ease infinite;} @media (min-width:1100px){ .hub-root{height:calc(100vh - 80px);min-height:0;overflow:hidden;} .hub-frame{display:flex;flex-direction:column;height:100%;min-height:0;} .hub-main{flex:1;min-height:0;grid-auto-rows:minmax(0,1fr);} .hub-panel{overflow-y:auto;min-height:0;} }`}</style>

      <div className="hub-frame" style={{ width: '100%' }}>
      {/* ── Header row ─────────────────────────────────────────────── */}
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 800, letterSpacing: '-.02em', background: 'linear-gradient(90deg, #fff 30%, #1af0ff 75%, #ffc300 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{c('title', lang)}</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,.55)' }}>{c('subtitle', lang)} · <span style={{ color: '#1af0ff' }}>{c('phaseBadge', lang)}</span></p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {LANGS.map(l => (
              <button key={l} onClick={() => setLang(l)} className="hub-chip" style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', background: lang === l ? 'rgba(26,240,255,.16)' : 'rgba(255,255,255,.04)', border: lang === l ? '1px solid rgba(26,240,255,.5)' : '1px solid rgba(255,255,255,.12)', color: lang === l ? '#1af0ff' : 'rgba(255,255,255,.6)' }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)' }}>
            <span style={labelStyle}>{c('systemHealth', lang)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone={loading ? 'yellow' : supaOk ? 'green' : 'red'} /> Supabase</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone={loading ? 'yellow' : stripeOk ? 'green' : 'red'} /> Stripe</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><Dot tone={loading ? 'yellow' : !vercelConfigured ? 'yellow' : vercelOk ? 'green' : 'red'} /> Vercel</span>
          </div>
          <button onClick={load} className="hub-btn" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(26,240,255,.4)', background: 'rgba(26,240,255,.1)', color: '#1af0ff', fontSize: 12.5, fontWeight: 700 }}>{loading ? '…' : '↻ ' + c('refresh', lang)}</button>
        </div>
      </header>

      {/* ── Alerts (live) ──────────────────────────────────────────── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {loading && <div className="hub-loading" style={{ padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{c('loading', lang)}</div>}
        {failed && <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.09)', fontSize: 13 }}><span>⚠️</span>{c('loadError', lang)}</div>}
        {noAlerts && <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(34,197,94,.4)', background: 'rgba(34,197,94,.08)', fontSize: 13, color: '#86efac' }}><span>✅</span>{c('allClear', lang)}</div>}
        {redAlerts.map((a, i) => (
          <div key={'r' + i} className="hub-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 11, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.09)' }}>
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span style={{ flex: 1, minWidth: 200, fontSize: 13 }}>{a}</span>
            <a href="https://dashboard.stripe.com/prices" target="_blank" rel="noreferrer" className="hub-btn" style={{ padding: '6px 13px', borderRadius: 9, border: '1px solid rgba(239,68,68,.5)', background: 'rgba(239,68,68,.14)', color: '#fca5a5', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>{c('fixStripe', lang)}</a>
          </div>
        ))}
        {yellowAlerts.map((a, i) => (
          <div key={'y' + i} className="hub-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 11, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,195,0,.45)', background: 'rgba(255,195,0,.07)' }}>
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span style={{ flex: 1, minWidth: 200, fontSize: 13 }}>{a}</span>
            <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="hub-btn" style={{ padding: '6px 13px', borderRadius: 9, border: '1px solid rgba(255,195,0,.5)', background: 'rgba(255,195,0,.12)', color: '#ffc300', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>{c('fixVercel', lang)}</a>
          </div>
        ))}
      </section>

      {/* ── Provider cards ─────────────────────────────────────────── */}
      <main className="hub-main" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(295px, 1fr))', gap: 14 }}>

        {/* Supabase — Your Data */}
        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.green} icon="🗄️" title="Supabase" plain={c('yourData', lang)} sub={c('manageData', lang)} />
          <div style={bodyStyle}>
            <Status ok={supaOk} text={supaOk ? c('statusDb', lang) : c('statusDbDown', lang)} />
            {data && <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('latency', lang)}</span><span style={{ color: data.supabase.latencyMs < 400 ? '#22c55e' : '#ffc300', fontWeight: 700 }}>{data.supabase.latencyMs} ms</span></div>}
            <DetailsToggle open={!!open.supa} onClick={() => toggle('supa')} lang={lang} />
            {open.supa && data && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('projectUrl', lang)}</span><span style={monoStyle}>{data.supabase.projectHost}</span></div>
                <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('anonKey', lang)}</span><span style={monoStyle}>{data.supabase.anonKeyMasked}</span></div>
                {data.supabase.error && <div style={{ ...rowStyle, color: '#fca5a5' }}>{data.supabase.error}</div>}
              </div>
            )}
            <ActionButton tone={TONES.green} label={c('openSupabase', lang)} href="https://supabase.com/dashboard/project/qpblefwtnbivuusxmabv" />
          </div>
        </section>

        {/* Stripe — Your Payments */}
        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.blue} icon="💳" title="Stripe" plain={c('yourPayments', lang)} sub={c('managePay', lang)} />
          <div style={bodyStyle}>
            <Status ok={stripeOk} text={stripeOk ? c('statusPay', lang) : c('statusPayDown', lang)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(data?.stripe.tiers || []).slice(0, open.stripe ? 50 : 4).map(t => (
                <div key={t.priceId} style={rowStyle}>
                  <span style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  <span style={{ color: '#ffc300', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>${t.amount}<span style={{ color: 'rgba(255,255,255,.45)', fontWeight: 400, fontSize: 11.5 }}>{c('perInterval', lang)}{t.interval}</span></span>
                </div>
              ))}
              {loading && <div className="hub-loading" style={{ ...rowStyle, color: 'rgba(255,255,255,.5)' }}>{c('loading', lang)}</div>}
            </div>
            <DetailsToggle open={!!open.stripe} onClick={() => toggle('stripe')} lang={lang} />
            {open.stripe && data && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={labelStyle}>{c('webhooks', lang)}</div>
                {data.stripe.webhooks.map(w => (
                  <div key={w.url} style={rowStyle}>
                    <span style={{ ...monoStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url.replace('https://', '')}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><Dot tone={w.status === 'enabled' ? 'green' : 'red'} /><span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.55)' }}>{w.events} {c('events', lang)}</span></span>
                  </div>
                ))}
                <div style={labelStyle}>{c('priceIds', lang)}</div>
                {data.stripe.tiers.map(t => (<div key={'id' + t.priceId} style={rowStyle}><span style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span><span style={{ ...monoStyle, flexShrink: 0 }}>{t.priceId.slice(0, 18)}…</span></div>))}
              </div>
            )}
            <ActionButton tone={TONES.blue} label={c('openStripe', lang)} href="https://dashboard.stripe.com" />
          </div>
        </section>

        {/* Vercel — Your Website */}
        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.purple} icon="🌐" title="Vercel" plain={c('yourWebsite', lang)} sub={c('manageHost', lang)} />
          <div style={bodyStyle}>
            <Status ok={vercelConfigured && vercelOk} text={vercelConfigured ? c('statusHost', lang) : c('statusNoToken', lang)} />
            {!vercelConfigured && !loading && <div style={{ ...rowStyle, fontSize: 12.5, color: 'rgba(255,255,255,.6)' }}>{c('tokenHint', lang)}</div>}
            {vercelConfigured && (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {scopes.map((s, i) => (
                  <button key={s.scope} onClick={() => setScopeIdx(i)} className="hub-chip" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7, background: scopeIdx === i ? TONES.purple.soft : 'rgba(255,255,255,.04)', border: scopeIdx === i ? `1px solid ${TONES.purple.border}` : '1px solid rgba(255,255,255,.12)', color: scopeIdx === i ? '#c4b5fd' : 'rgba(255,255,255,.6)' }}>{s.scope}<span style={{ color: 'rgba(255,255,255,.5)' }}>{s.count}</span></button>
                ))}
              </div>
            )}
            {vercelConfigured && selScope && (
              <>
                <DetailsToggle open={!!open.vercel} onClick={() => toggle('vercel')} lang={lang} />
                {open.vercel && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={labelStyle}>{c('envVars', lang)}</div>
                    {selScope.names.map(v => (<div key={v} style={rowStyle}><span style={monoStyle}>{v}</span><span style={{ ...monoStyle, color: 'rgba(255,255,255,.35)' }}>••••••••</span></div>))}
                  </div>
                )}
              </>
            )}
            {data?.vercel.error && <div style={{ ...rowStyle, color: '#fca5a5', fontSize: 12.5 }}>{data.vercel.error}</div>}
            <ActionButton tone={TONES.purple} label={c('openVercel', lang)} href="https://vercel.com/dashboard" />
          </div>
        </section>

        {/* Governance — Your Team */}
        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.gray} icon="👥" title="Governance" plain={c('yourTeam', lang)} sub={c('manageTeam', lang)} />
          <div style={bodyStyle}>
            <Status ok={true} text={c('statusRoles', lang)} />
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
