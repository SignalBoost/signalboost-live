'use client'

// saas/app/admin/hub/page.tsx
// SignalBoost Hub Console — Phase 1A static prototype.
// Mock data only. No live API calls, no write operations. Safe by design.

import { useState } from 'react'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<string, Record<Lang, string>> = {
  title:        { en: 'SignalBoost Hub Console', es: 'Consola Hub de SignalBoost', pt: 'Console Hub da SignalBoost', pl: 'Konsola Hub SignalBoost', ru: 'Консоль Hub SignalBoost' },
  subtitle:     { en: 'Unified operations for data, payments and deployment', es: 'Operaciones unificadas de datos, pagos y despliegue', pt: 'Operações unificadas de dados, pagamentos e implantação', pl: 'Zunifikowane operacje danych, płatności i wdrożeń', ru: 'Единое управление данными, платежами и развёртыванием' },
  phaseBadge:   { en: 'Phase 1A · Mock data — no live connections', es: 'Fase 1A · Datos de prueba — sin conexiones en vivo', pt: 'Fase 1A · Dados fictícios — sem conexões ao vivo', pl: 'Faza 1A · Dane testowe — brak połączeń na żywo', ru: 'Фаза 1A · Тестовые данные — без живых подключений' },
  systemHealth: { en: 'System health', es: 'Estado del sistema', pt: 'Saúde do sistema', pl: 'Stan systemu', ru: 'Состояние системы' },
  operational:  { en: 'Operational', es: 'Operativo', pt: 'Operacional', pl: 'Działa', ru: 'Работает' },
  degraded:     { en: 'Degraded', es: 'Degradado', pt: 'Degradado', pl: 'Obniżona wydajność', ru: 'Снижена' },
  database:     { en: 'Database', es: 'Base de datos', pt: 'Banco de dados', pl: 'Baza danych', ru: 'База данных' },
  payments:     { en: 'Payments', es: 'Pagos', pt: 'Pagamentos', pl: 'Płatności', ru: 'Платежи' },
  hosting:      { en: 'Hosting', es: 'Alojamiento', pt: 'Hospedagem', pl: 'Hosting', ru: 'Хостинг' },
  governance:   { en: 'Governance', es: 'Gobernanza', pt: 'Governança', pl: 'Zarządzanie', ru: 'Управление' },
  connection:   { en: 'Connection', es: 'Conexión', pt: 'Conexão', pl: 'Połączenie', ru: 'Подключение' },
  projectUrl:   { en: 'Project URL', es: 'URL del proyecto', pt: 'URL do projeto', pl: 'URL projektu', ru: 'URL проекта' },
  anonKey:      { en: 'Public anon key', es: 'Clave anónima pública', pt: 'Chave anônima pública', pl: 'Publiczny klucz anon', ru: 'Публичный anon-ключ' },
  apiHealth:    { en: 'Project API health', es: 'Salud de la API del proyecto', pt: 'Saúde da API do projeto', pl: 'Stan API projektu', ru: 'Состояние API проекта' },
  healthy:      { en: 'Healthy', es: 'Saludable', pt: 'Saudável', pl: 'Sprawne', ru: 'Исправно' },
  priceTiers:   { en: 'Active price tiers', es: 'Niveles de precio activos', pt: 'Níveis de preço ativos', pl: 'Aktywne poziomy cen', ru: 'Активные тарифы' },
  webhooks:     { en: 'Webhook subscriptions', es: 'Suscripciones de webhooks', pt: 'Assinaturas de webhooks', pl: 'Subskrypcje webhooków', ru: 'Подписки вебхуков' },
  active:       { en: 'Active', es: 'Activo', pt: 'Ativo', pl: 'Aktywny', ru: 'Активен' },
  failing:      { en: 'Failing', es: 'Fallando', pt: 'Falhando', pl: 'Błędy', ru: 'Сбои' },
  envScopes:    { en: 'Environment scopes', es: 'Ámbitos de entorno', pt: 'Escopos de ambiente', pl: 'Zakresy środowisk', ru: 'Окружения' },
  envVars:      { en: 'Environment variables (values hidden)', es: 'Variables de entorno (valores ocultos)', pt: 'Variáveis de ambiente (valores ocultos)', pl: 'Zmienne środowiskowe (wartości ukryte)', ru: 'Переменные окружения (значения скрыты)' },
  rolesView:    { en: 'Role view', es: 'Vista por rol', pt: 'Visão por função', pl: 'Widok roli', ru: 'Вид по ролям' },
  auditLog:     { en: 'Audit log', es: 'Registro de auditoría', pt: 'Registro de auditoria', pl: 'Dziennik audytu', ru: 'Журнал аудита' },
  alerts:       { en: 'Alerts', es: 'Alertas', pt: 'Alertas', pl: 'Alerty', ru: 'Оповещения' },
  alertStripe:  { en: 'Stripe Price ID mismatch: launch tier differs between Stripe and platform config.', es: 'Discrepancia de Price ID en Stripe: el nivel Launch difiere entre Stripe y la configuración.', pt: 'Divergência de Price ID na Stripe: o nível Launch difere entre a Stripe e a configuração.', pl: 'Niezgodność Price ID w Stripe: poziom Launch różni się między Stripe a konfiguracją.', ru: 'Несовпадение Price ID в Stripe: тариф Launch отличается от конфигурации платформы.' },
  alertEnv:     { en: 'Env variable out of sync: OPENAI_API_KEY present in Production, missing in Preview.', es: 'Variable de entorno desincronizada: OPENAI_API_KEY existe en Producción, falta en Preview.', pt: 'Variável de ambiente fora de sincronia: OPENAI_API_KEY presente em Produção, ausente em Preview.', pl: 'Zmienna środowiskowa niezsynchronizowana: OPENAI_API_KEY jest w Produkcji, brak w Preview.', ru: 'Переменная окружения не синхронизирована: OPENAI_API_KEY есть в Production, отсутствует в Preview.' },
  review:       { en: 'Review', es: 'Revisar', pt: 'Revisar', pl: 'Przejrzyj', ru: 'Проверить' },
  phaseNote:    { en: 'Connects in Phase 1B (read-only API). Nothing executes in this prototype.', es: 'Se conecta en la Fase 1B (API de solo lectura). Nada se ejecuta en este prototipo.', pt: 'Conecta na Fase 1B (API somente leitura). Nada é executado neste protótipo.', pl: 'Połączenie w Fazie 1B (API tylko do odczytu). Nic nie jest wykonywane w tym prototypie.', ru: 'Подключение в Фазе 1B (API только для чтения). В этом прототипе ничего не выполняется.' },
  roleBilling:  { en: 'Billing Admin', es: 'Admin de Facturación', pt: 'Admin de Cobrança', pl: 'Admin Rozliczeń', ru: 'Админ биллинга' },
  roleDev:      { en: 'Developer', es: 'Desarrollador', pt: 'Desenvolvedor', pl: 'Programista', ru: 'Разработчик' },
  roleTeam:     { en: 'Team Member', es: 'Miembro del Equipo', pt: 'Membro da Equipe', pl: 'Członek Zespołu', ru: 'Участник команды' },
  perMonth:     { en: '/mo', es: '/mes', pt: '/mês', pl: '/mies.', ru: '/мес' },
}

function c(key: string, lang: Lang): string {
  const entry = COPY[key]
  if (!entry) return key
  return entry[lang] || entry.en
}

const LANGS: Lang[] = ['en', 'es', 'pt', 'pl', 'ru']

type Role = 'billing' | 'dev' | 'team'

const MOCK_TIERS = [
  { name: 'Free Demo', price: '$0',   id: 'price_MOCK_free_xxxxxx',   status: 'ok' },
  { name: 'Launch',    price: '$29',  id: 'price_MOCK_launch_xxxxxx', status: 'mismatch' },
  { name: 'Growth',    price: '$79',  id: 'price_MOCK_growth_xxxxxx', status: 'ok' },
  { name: 'Command',   price: '$199', id: 'price_MOCK_command_xxxxx', status: 'ok' },
]

const MOCK_WEBHOOKS = [
  { event: 'checkout.session.completed', status: 'active' },
  { event: 'customer.subscription.updated', status: 'active' },
  { event: 'invoice.payment_failed', status: 'failing' },
]

const MOCK_ENV_SCOPES = [
  { scope: 'Production',  vars: 14, state: 'ok' },
  { scope: 'Preview',     vars: 13, state: 'warn' },
  { scope: 'Development', vars: 14, state: 'ok' },
]

const MOCK_ENV_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'OPENAI_API_KEY', 'GITHUB_WRITE_TOKEN']

const MOCK_AUDIT: { time: string; actor: string; action: string; roles: Role[] }[] = [
  { time: '12 Jun 2026 · 14:32', actor: 'owner@signalboost', action: 'Updated Stripe price for Launch tier', roles: ['billing'] },
  { time: '12 Jun 2026 · 13:05', actor: 'ai-chief-of-staff', action: 'Committed redesign to preview branch ai/dashboard-polish', roles: ['dev'] },
  { time: '12 Jun 2026 · 11:48', actor: 'owner@signalboost', action: 'Rotated OPENAI_API_KEY in Production scope', roles: ['dev', 'billing'] },
  { time: '11 Jun 2026 · 19:21', actor: 'system', action: 'Daily opportunity scan completed (4 alerts stored)', roles: ['team', 'dev', 'billing'] },
  { time: '11 Jun 2026 · 16:02', actor: 'owner@signalboost', action: 'Merged preview branch into production', roles: ['dev'] },
  { time: '11 Jun 2026 · 09:40', actor: 'system', action: 'Stripe webhook invoice.payment_failed retried (3rd attempt)', roles: ['billing'] },
]

const panelStyle: React.CSSProperties = { background: 'linear-gradient(160deg, rgba(15,23,42,.72), rgba(3,7,18,.86))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: '22px 24px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 18px 48px rgba(0,0,0,.42)', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }
const labelStyle: React.CSSProperties = { fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 12px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, fontSize: 13 }
const monoStyle: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: 'rgba(255,255,255,.78)' }

function Dot({ tone }: { tone: 'green' | 'yellow' | 'red' }) {
  const color = tone === 'green' ? '#22c55e' : tone === 'yellow' ? '#ffc300' : '#ef4444'
  return <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}`, display: 'inline-block', flexShrink: 0 }} />
}

function PanelTitle({ icon, kicker, title }: { icon: string; kicker: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={labelStyle}>{kicker}</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>{title}</div>
      </div>
    </div>
  )
}

export default function HubConsolePage() {
  const [lang, setLang] = useState<Lang>('en')
  const [role, setRole] = useState<Role>('billing')
  const [openNote, setOpenNote] = useState<string | null>(null)

  const audit = MOCK_AUDIT.filter(e => e.roles.includes(role))
  const roleLabel: Record<Role, string> = { billing: c('roleBilling', lang), dev: c('roleDev', lang), team: c('roleTeam', lang) }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(1100px 500px at 80% -10%, rgba(26,240,255,.10), transparent 60%), radial-gradient(900px 480px at 0% 110%, rgba(255,195,0,.07), transparent 55%), linear-gradient(180deg, #0b1220 0%, #030712 100%)', color: '#fff', padding: '34px clamp(18px, 4vw, 48px)', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      <style>{`.hub-card{transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;} .hub-card:hover{transform:translateY(-3px); border-color:rgba(26,240,255,.35); box-shadow:0 24px 60px rgba(0,0,0,.55);} .hub-chip{transition:background .15s ease, color .15s ease, border-color .15s ease; cursor:pointer;} .hub-chip:hover{border-color:rgba(255,195,0,.6);} .hub-btn{transition:background .15s ease, transform .12s ease; cursor:pointer;} .hub-btn:hover{transform:translateY(-1px); background:rgba(26,240,255,.16);}`}</style>

      {/* ── Header row ─────────────────────────────────────────────── */}
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, marginBottom: 26 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 999, border: '1px solid rgba(255,195,0,.4)', background: 'rgba(255,195,0,.08)', color: '#ffc300', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 12 }}>{c('phaseBadge', lang)}</div>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 800, letterSpacing: '-.02em', background: 'linear-gradient(90deg, #fff 30%, #1af0ff 75%, #ffc300 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{c('title', lang)}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,.55)' }}>{c('subtitle', lang)}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {LANGS.map(l => (
              <button key={l} onClick={() => setLang(l)} className="hub-chip" style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', background: lang === l ? 'rgba(26,240,255,.16)' : 'rgba(255,255,255,.04)', border: lang === l ? '1px solid rgba(26,240,255,.5)' : '1px solid rgba(255,255,255,.12)', color: lang === l ? '#1af0ff' : 'rgba(255,255,255,.6)' }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '9px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)' }}>
            <span style={labelStyle}>{c('systemHealth', lang)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}><Dot tone="green" /> Supabase</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}><Dot tone="green" /> Stripe</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}><Dot tone="yellow" /> Vercel</span>
          </div>
        </div>
      </header>

      {/* ── Alerts ─────────────────────────────────────────────────── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
        <div style={labelStyle}>{c('alerts', lang)}</div>
        <div className="hub-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 12, border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.09)' }}>
          <Dot tone="red" />
          <span style={{ flex: 1, minWidth: 220, fontSize: 13.5 }}>{c('alertStripe', lang)}</span>
          <button onClick={() => setOpenNote(openNote === 'stripe' ? null : 'stripe')} className="hub-btn" style={{ padding: '6px 14px', borderRadius: 9, border: '1px solid rgba(26,240,255,.4)', background: 'rgba(26,240,255,.08)', color: '#1af0ff', fontSize: 12.5, fontWeight: 600 }}>{c('review', lang)}</button>
          {openNote === 'stripe' && <div style={{ flexBasis: '100%', fontSize: 12.5, color: 'rgba(255,255,255,.6)', paddingLeft: 21 }}>{c('phaseNote', lang)}</div>}
        </div>
        <div className="hub-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 12, border: '1px solid rgba(255,195,0,.45)', background: 'rgba(255,195,0,.07)' }}>
          <Dot tone="yellow" />
          <span style={{ flex: 1, minWidth: 220, fontSize: 13.5 }}>{c('alertEnv', lang)}</span>
          <button onClick={() => setOpenNote(openNote === 'env' ? null : 'env')} className="hub-btn" style={{ padding: '6px 14px', borderRadius: 9, border: '1px solid rgba(26,240,255,.4)', background: 'rgba(26,240,255,.08)', color: '#1af0ff', fontSize: 12.5, fontWeight: 600 }}>{c('review', lang)}</button>
          {openNote === 'env' && <div style={{ flexBasis: '100%', fontSize: 12.5, color: 'rgba(255,255,255,.6)', paddingLeft: 21 }}>{c('phaseNote', lang)}</div>}
        </div>
      </section>

      {/* ── Main grid: four panels ─────────────────────────────────── */}
      <main style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 18 }}>

        {/* 1 · Supabase */}
        <section className="hub-card" style={panelStyle}>
          <PanelTitle icon="🗄️" kicker={c('database', lang)} title="Supabase" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('projectUrl', lang)}</span><span style={monoStyle}>https://mock-project.supabase.co</span></div>
            <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('anonKey', lang)}</span><span style={monoStyle}>eyJh••••••••••••••••3kQ</span></div>
            <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('apiHealth', lang)}</span><span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Dot tone="green" /><span style={{ color: '#22c55e', fontWeight: 600 }}>{c('healthy', lang)}</span></span></div>
            <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('connection', lang)}</span><span style={{ color: '#1af0ff', fontWeight: 600 }}>{c('operational', lang)}</span></div>
          </div>
        </section>

        {/* 2 · Stripe */}
        <section className="hub-card" style={panelStyle}>
          <PanelTitle icon="💳" kicker={c('payments', lang)} title="Stripe" />
          <div style={labelStyle}>{c('priceTiers', lang)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOCK_TIERS.map(t => (
              <div key={t.name} style={{ ...rowStyle, border: t.status === 'mismatch' ? '1px solid rgba(239,68,68,.55)' : rowStyle.border, background: t.status === 'mismatch' ? 'rgba(239,68,68,.08)' : rowStyle.background }}>
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                <span style={monoStyle}>{t.id}</span>
                <span style={{ color: '#ffc300', fontWeight: 700 }}>{t.price}<span style={{ color: 'rgba(255,255,255,.45)', fontWeight: 400 }}>{c('perMonth', lang)}</span></span>
              </div>
            ))}
          </div>
          <div style={labelStyle}>{c('webhooks', lang)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOCK_WEBHOOKS.map(w => (
              <div key={w.event} style={rowStyle}>
                <span style={monoStyle}>{w.event}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Dot tone={w.status === 'active' ? 'green' : 'red'} /><span style={{ color: w.status === 'active' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{w.status === 'active' ? c('active', lang) : c('failing', lang)}</span></span>
              </div>
            ))}
          </div>
        </section>

        {/* 3 · Vercel */}
        <section className="hub-card" style={panelStyle}>
          <PanelTitle icon="▲" kicker={c('hosting', lang)} title="Vercel" />
          <div style={labelStyle}>{c('envScopes', lang)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOCK_ENV_SCOPES.map(s => (
              <div key={s.scope} style={rowStyle}>
                <span style={{ fontWeight: 600 }}>{s.scope}</span>
                <span style={{ color: 'rgba(255,255,255,.55)' }}>{s.vars} vars</span>
                <Dot tone={s.state === 'ok' ? 'green' : 'yellow'} />
              </div>
            ))}
          </div>
          <div style={labelStyle}>{c('envVars', lang)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOCK_ENV_VARS.map(v => (
              <div key={v} style={rowStyle}><span style={monoStyle}>{v}</span><span style={{ ...monoStyle, color: 'rgba(255,255,255,.35)' }}>••••••••</span></div>
            ))}
          </div>
        </section>

        {/* 4 · Governance */}
        <section className="hub-card" style={panelStyle}>
          <PanelTitle icon="🛡️" kicker={c('governance', lang)} title={c('rolesView', lang)} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['billing', 'dev', 'team'] as Role[]).map(r => (
              <button key={r} onClick={() => setRole(r)} className="hub-chip" style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: role === r ? 'rgba(255,195,0,.14)' : 'rgba(255,255,255,.04)', border: role === r ? '1px solid rgba(255,195,0,.55)' : '1px solid rgba(255,255,255,.12)', color: role === r ? '#ffc300' : 'rgba(255,255,255,.6)' }}>{roleLabel[r]}</button>
            ))}
          </div>
          <div style={labelStyle}>{c('auditLog', lang)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
            {audit.map((e, i) => (
              <div key={i} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 10 }}><span style={{ ...monoStyle, color: '#1af0ff' }}>{e.time}</span><span style={{ ...monoStyle, color: 'rgba(255,255,255,.45)' }}>{e.actor}</span></div>
                <div style={{ fontSize: 13 }}>{e.action}</div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  )
}
