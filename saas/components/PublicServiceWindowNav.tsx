'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type Item = { icon: string; label: string; href: string; gated?: boolean }
type Group = { label: string; items: Item[] }

type Copy = {
  intro: string
  gated: string
  groups: Group[]
}

const COPY: Record<Lang, Copy> = {
  en: {
    intro: 'Explore all SignalBoost products before signing up',
    gated: 'login required',
    groups: [
      { label: 'Free tools', items: [
        { icon: '🌐', label: 'Website Optimizer', href: '/website-optimizer' },
        { icon: '🛡️', label: 'Cybersecurity Check', href: '/cybersecurity-check' },
        { icon: '📋', label: 'Repo / Audit Check', href: '/repo-check' },
      ] },
      { label: 'Audit & Security', items: [
        { icon: '📋', label: 'Audit Center', href: '/dashboard/audit', gated: true },
        { icon: '🛡️', label: 'Cybersecurity Center', href: '/dashboard/cybersecurity', gated: true },
        { icon: '🔑', label: 'Identity & Secrets', href: '/hub/audit/identity', gated: true },
      ] },
      { label: 'Operations', items: [
        { icon: '🎛️', label: 'Console Hub', href: '/hub', gated: true },
        { icon: '📋', label: 'PR Cockpit', href: '/dashboard/infrastructure', gated: true },
        { icon: '🛰️', label: 'Owner/Admin Cockpit', href: '/admin', gated: true },
      ] },
      { label: 'Growth', items: [
        { icon: '📣', label: 'Marketing + Sales', href: '/admin/marketing-sales', gated: true },
        { icon: '📢', label: 'Promote Business', href: '/dashboard/promote', gated: true },
        { icon: '🛸', label: 'Outreach', href: '/dashboard/outreach', gated: true },
      ] },
      { label: 'Office & Studio', items: [
        { icon: '📅', label: 'Calendar', href: '/dashboard/calendar', gated: true },
        { icon: '📑', label: 'Spreadsheets', href: '/dashboard/spreadsheets', gated: true },
        { icon: '🎬', label: 'Video Studio', href: '/dashboard/video', gated: true },
      ] },
    ],
  },
  es: {
    intro: 'Explora todos los productos de SignalBoost antes de registrarte',
    gated: 'requiere login',
    groups: [
      { label: 'Herramientas gratis', items: [
        { icon: '🌐', label: 'Optimizador Web', href: '/website-optimizer' },
        { icon: '🛡️', label: 'Revisión de Ciberseguridad', href: '/cybersecurity-check' },
        { icon: '📋', label: 'Repo / Auditoría', href: '/repo-check' },
      ] },
      { label: 'Auditoría y Seguridad', items: [
        { icon: '📋', label: 'Centro de Auditoría', href: '/dashboard/audit', gated: true },
        { icon: '🛡️', label: 'Centro de Ciberseguridad', href: '/dashboard/cybersecurity', gated: true },
        { icon: '🔑', label: 'Identidad y Secretos', href: '/hub/audit/identity', gated: true },
      ] },
      { label: 'Operaciones', items: [
        { icon: '🎛️', label: 'Console Hub', href: '/hub', gated: true },
        { icon: '📋', label: 'PR Cockpit', href: '/dashboard/infrastructure', gated: true },
        { icon: '🛰️', label: 'Cockpit Admin', href: '/admin', gated: true },
      ] },
      { label: 'Crecimiento', items: [
        { icon: '📣', label: 'Marketing + Ventas', href: '/admin/marketing-sales', gated: true },
        { icon: '📢', label: 'Promocionar negocio', href: '/dashboard/promote', gated: true },
        { icon: '🛸', label: 'Outreach', href: '/dashboard/outreach', gated: true },
      ] },
      { label: 'Oficina y Studio', items: [
        { icon: '📅', label: 'Calendario', href: '/dashboard/calendar', gated: true },
        { icon: '📑', label: 'Hojas de cálculo', href: '/dashboard/spreadsheets', gated: true },
        { icon: '🎬', label: 'Video Studio', href: '/dashboard/video', gated: true },
      ] },
    ],
  },
  pt: {
    intro: 'Explore todos os produtos SignalBoost antes de se cadastrar',
    gated: 'requer login',
    groups: [
      { label: 'Ferramentas grátis', items: [
        { icon: '🌐', label: 'Otimizador de Site', href: '/website-optimizer' },
        { icon: '🛡️', label: 'Verificação de Cibersegurança', href: '/cybersecurity-check' },
        { icon: '📋', label: 'Repo / Auditoria', href: '/repo-check' },
      ] },
      { label: 'Auditoria e Segurança', items: [
        { icon: '📋', label: 'Centro de Auditoria', href: '/dashboard/audit', gated: true },
        { icon: '🛡️', label: 'Centro de Cibersegurança', href: '/dashboard/cybersecurity', gated: true },
        { icon: '🔑', label: 'Identidade e Segredos', href: '/hub/audit/identity', gated: true },
      ] },
      { label: 'Operações', items: [
        { icon: '🎛️', label: 'Console Hub', href: '/hub', gated: true },
        { icon: '📋', label: 'PR Cockpit', href: '/dashboard/infrastructure', gated: true },
        { icon: '🛰️', label: 'Cockpit Admin', href: '/admin', gated: true },
      ] },
      { label: 'Crescimento', items: [
        { icon: '📣', label: 'Marketing + Vendas', href: '/admin/marketing-sales', gated: true },
        { icon: '📢', label: 'Promover negócio', href: '/dashboard/promote', gated: true },
        { icon: '🛸', label: 'Outreach', href: '/dashboard/outreach', gated: true },
      ] },
      { label: 'Office e Studio', items: [
        { icon: '📅', label: 'Calendário', href: '/dashboard/calendar', gated: true },
        { icon: '📑', label: 'Planilhas', href: '/dashboard/spreadsheets', gated: true },
        { icon: '🎬', label: 'Video Studio', href: '/dashboard/video', gated: true },
      ] },
    ],
  },
  pl: {
    intro: 'Zobacz wszystkie produkty SignalBoost przed rejestracją',
    gated: 'wymaga logowania',
    groups: [
      { label: 'Darmowe narzędzia', items: [
        { icon: '🌐', label: 'Optymalizator Strony', href: '/website-optimizer' },
        { icon: '🛡️', label: 'Test Cyberbezpieczeństwa', href: '/cybersecurity-check' },
        { icon: '📋', label: 'Repo / Audyt', href: '/repo-check' },
      ] },
      { label: 'Audyt i Bezpieczeństwo', items: [
        { icon: '📋', label: 'Centrum Audytu', href: '/dashboard/audit', gated: true },
        { icon: '🛡️', label: 'Centrum Cyberbezpieczeństwa', href: '/dashboard/cybersecurity', gated: true },
        { icon: '🔑', label: 'Tożsamość i Sekrety', href: '/hub/audit/identity', gated: true },
      ] },
      { label: 'Operacje', items: [
        { icon: '🎛️', label: 'Console Hub', href: '/hub', gated: true },
        { icon: '📋', label: 'PR Cockpit', href: '/dashboard/infrastructure', gated: true },
        { icon: '🛰️', label: 'Admin Cockpit', href: '/admin', gated: true },
      ] },
      { label: 'Wzrost', items: [
        { icon: '📣', label: 'Marketing + Sprzedaż', href: '/admin/marketing-sales', gated: true },
        { icon: '📢', label: 'Promocja firmy', href: '/dashboard/promote', gated: true },
        { icon: '🛸', label: 'Outreach', href: '/dashboard/outreach', gated: true },
      ] },
      { label: 'Office i Studio', items: [
        { icon: '📅', label: 'Kalendarz', href: '/dashboard/calendar', gated: true },
        { icon: '📑', label: 'Arkusze', href: '/dashboard/spreadsheets', gated: true },
        { icon: '🎬', label: 'Video Studio', href: '/dashboard/video', gated: true },
      ] },
    ],
  },
  ru: {
    intro: 'Посмотрите все продукты SignalBoost перед регистрацией',
    gated: 'требуется вход',
    groups: [
      { label: 'Бесплатные инструменты', items: [
        { icon: '🌐', label: 'Website Optimizer', href: '/website-optimizer' },
        { icon: '🛡️', label: 'Cybersecurity Check', href: '/cybersecurity-check' },
        { icon: '📋', label: 'Repo / Audit Check', href: '/repo-check' },
      ] },
      { label: 'Аудит и безопасность', items: [
        { icon: '📋', label: 'Audit Center', href: '/dashboard/audit', gated: true },
        { icon: '🛡️', label: 'Cybersecurity Center', href: '/dashboard/cybersecurity', gated: true },
        { icon: '🔑', label: 'Identity & Secrets', href: '/hub/audit/identity', gated: true },
      ] },
      { label: 'Операции', items: [
        { icon: '🎛️', label: 'Console Hub', href: '/hub', gated: true },
        { icon: '📋', label: 'PR Cockpit', href: '/dashboard/infrastructure', gated: true },
        { icon: '🛰️', label: 'Admin Cockpit', href: '/admin', gated: true },
      ] },
      { label: 'Рост', items: [
        { icon: '📣', label: 'Marketing + Sales', href: '/admin/marketing-sales', gated: true },
        { icon: '📢', label: 'Promote Business', href: '/dashboard/promote', gated: true },
        { icon: '🛸', label: 'Outreach', href: '/dashboard/outreach', gated: true },
      ] },
      { label: 'Office и Studio', items: [
        { icon: '📅', label: 'Calendar', href: '/dashboard/calendar', gated: true },
        { icon: '📑', label: 'Spreadsheets', href: '/dashboard/spreadsheets', gated: true },
        { icon: '🎬', label: 'Video Studio', href: '/dashboard/video', gated: true },
      ] },
    ],
  },
}

function activeLang(lang: string): Lang {
  return (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang
}

export default function PublicServiceWindowNav() {
  const pathname = usePathname()
  const { lang } = useI18n()
  const copy = COPY[activeLang(lang)]

  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin') || pathname?.startsWith('/hub')) return null

  return (
    <section aria-label={copy.intro} style={{ position: 'relative', zIndex: 90, borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(2,6,23,.82)', backdropFilter: 'blur(12px)' }}>
      <style>{`.sb-public-window{display:flex;gap:10px;align-items:center;overflow-x:auto;padding:8px 22px;scrollbar-width:thin}.sb-public-group{position:relative;flex:0 0 auto}.sb-public-panel{display:none;position:absolute;top:100%;left:0;width:340px;max-width:92vw;border:1px solid rgba(26,240,255,.22);background:linear-gradient(145deg,rgba(3,7,18,.98),rgba(15,23,42,.98));border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.45);padding:12px;z-index:300}.sb-public-group:hover .sb-public-panel{display:grid;gap:4px}.sb-public-link{display:flex;gap:10px;align-items:center;text-decoration:none;color:#fff;border-radius:12px;padding:10px}.sb-public-link:hover{background:rgba(255,255,255,.07)}@media(max-width:760px){.sb-public-window{padding:8px 14px}.sb-public-intro{display:none}.sb-public-panel{position:fixed;left:12px;right:12px;width:auto;top:108px}}`}</style>
      <div className="sb-public-window">
        <span className="sb-public-intro" style={{ color: 'rgba(148,163,184,.88)', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{copy.intro}</span>
        {copy.groups.map(group => (
          <div key={group.label} className="sb-public-group">
            <button type="button" style={{ border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: '#fff', borderRadius: 999, padding: '7px 11px', fontWeight: 900, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>{group.label} ▾</button>
            <div className="sb-public-panel">
              {group.items.map(item => (
                <Link key={`${group.label}:${item.href}:${item.label}`} href={item.href} className="sb-public-link">
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <span style={{ display: 'grid', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 900 }}>{item.label}</span>
                    {item.gated ? <span style={{ color: 'rgba(148,163,184,.86)', fontSize: 11 }}>{copy.gated}</span> : null}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
