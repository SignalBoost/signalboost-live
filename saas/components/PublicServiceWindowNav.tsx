'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type GroupId = 'free' | 'audit' | 'operations' | 'growth' | 'office'
type ItemId =
  | 'websiteOptimizer'
  | 'cybersecurityCheck'
  | 'repoAuditCheck'
  | 'auditCenter'
  | 'cybersecurityCenter'
  | 'identitySecrets'
  | 'consoleHub'
  | 'prCockpit'
  | 'adminCockpit'
  | 'marketingSales'
  | 'promoteBusiness'
  | 'outreach'
  | 'calendar'
  | 'spreadsheets'
  | 'videoStudio'

type ItemConfig = { icon: string; href: string; gated?: boolean }

type Copy = {
  intro: string
  gated: string
  groups: Record<GroupId, string>
  items: Record<ItemId, string>
}

const ITEMS: Record<ItemId, ItemConfig> = {
  websiteOptimizer: { icon: '🌐', href: '/website-optimizer' },
  cybersecurityCheck: { icon: '🛡️', href: '/cybersecurity-check' },
  repoAuditCheck: { icon: '📋', href: '/repo-check' },
  auditCenter: { icon: '📋', href: '/dashboard/audit', gated: true },
  cybersecurityCenter: { icon: '🛡️', href: '/dashboard/cybersecurity', gated: true },
  identitySecrets: { icon: '🔑', href: '/hub/audit/identity', gated: true },
  consoleHub: { icon: '🎛️', href: '/hub', gated: true },
  prCockpit: { icon: '📋', href: '/dashboard/infrastructure', gated: true },
  adminCockpit: { icon: '🛰️', href: '/admin', gated: true },
  marketingSales: { icon: '📣', href: '/admin/marketing-sales', gated: true },
  promoteBusiness: { icon: '📢', href: '/dashboard/promote', gated: true },
  outreach: { icon: '🛸', href: '/dashboard/outreach', gated: true },
  calendar: { icon: '📅', href: '/dashboard/calendar', gated: true },
  spreadsheets: { icon: '📑', href: '/dashboard/spreadsheets', gated: true },
  videoStudio: { icon: '🎬', href: '/dashboard/video', gated: true },
}

const GROUPS: Array<{ id: GroupId; itemIds: ItemId[] }> = [
  { id: 'free', itemIds: ['websiteOptimizer', 'cybersecurityCheck', 'repoAuditCheck'] },
  { id: 'audit', itemIds: ['auditCenter', 'cybersecurityCenter', 'identitySecrets'] },
  { id: 'operations', itemIds: ['consoleHub', 'prCockpit', 'adminCockpit'] },
  { id: 'growth', itemIds: ['marketingSales', 'promoteBusiness', 'outreach'] },
  { id: 'office', itemIds: ['calendar', 'spreadsheets', 'videoStudio'] },
]

const COPY: Record<Lang, Copy> = {
  en: {
    intro: 'Explore all SignalBoost products before signing up',
    gated: 'login required',
    groups: { free: 'Free tools', audit: 'Audit & Security', operations: 'Operations', growth: 'Growth', office: 'Office & Studio' },
    items: { websiteOptimizer: 'Website Optimizer', cybersecurityCheck: 'Cybersecurity Check', repoAuditCheck: 'Repo / Audit Check', auditCenter: 'Audit Center', cybersecurityCenter: 'Cybersecurity Center', identitySecrets: 'Identity & Secrets', consoleHub: 'Console Hub', prCockpit: 'PR Cockpit', adminCockpit: 'Owner/Admin Cockpit', marketingSales: 'Marketing + Sales', promoteBusiness: 'Promote Business', outreach: 'Outreach', calendar: 'Calendar', spreadsheets: 'Spreadsheets', videoStudio: 'Video Studio' },
  },
  es: {
    intro: 'Explora todos los productos de SignalBoost antes de registrarte',
    gated: 'requiere login',
    groups: { free: 'Herramientas gratis', audit: 'Auditoría y Seguridad', operations: 'Operaciones', growth: 'Crecimiento', office: 'Oficina y Studio' },
    items: { websiteOptimizer: 'Optimizador Web', cybersecurityCheck: 'Revisión de Ciberseguridad', repoAuditCheck: 'Repo / Auditoría', auditCenter: 'Centro de Auditoría', cybersecurityCenter: 'Centro de Ciberseguridad', identitySecrets: 'Identidad y Secretos', consoleHub: 'Console Hub', prCockpit: 'PR Cockpit', adminCockpit: 'Cockpit Admin', marketingSales: 'Marketing + Ventas', promoteBusiness: 'Promocionar negocio', outreach: 'Outreach', calendar: 'Calendario', spreadsheets: 'Hojas de cálculo', videoStudio: 'Video Studio' },
  },
  pt: {
    intro: 'Explore todos os produtos SignalBoost antes de se cadastrar',
    gated: 'requer login',
    groups: { free: 'Ferramentas grátis', audit: 'Auditoria e Segurança', operations: 'Operações', growth: 'Crescimento', office: 'Office e Studio' },
    items: { websiteOptimizer: 'Otimizador de Site', cybersecurityCheck: 'Verificação de Cibersegurança', repoAuditCheck: 'Repo / Auditoria', auditCenter: 'Centro de Auditoria', cybersecurityCenter: 'Centro de Cibersegurança', identitySecrets: 'Identidade e Segredos', consoleHub: 'Console Hub', prCockpit: 'PR Cockpit', adminCockpit: 'Cockpit Admin', marketingSales: 'Marketing + Vendas', promoteBusiness: 'Promover negócio', outreach: 'Outreach', calendar: 'Calendário', spreadsheets: 'Planilhas', videoStudio: 'Video Studio' },
  },
  pl: {
    intro: 'Zobacz wszystkie produkty SignalBoost przed rejestracją',
    gated: 'wymaga logowania',
    groups: { free: 'Darmowe narzędzia', audit: 'Audyt i Bezpieczeństwo', operations: 'Operacje', growth: 'Wzrost', office: 'Office i Studio' },
    items: { websiteOptimizer: 'Optymalizator Strony', cybersecurityCheck: 'Test Cyberbezpieczeństwa', repoAuditCheck: 'Repo / Audyt', auditCenter: 'Centrum Audytu', cybersecurityCenter: 'Centrum Cyberbezpieczeństwa', identitySecrets: 'Tożsamość i Sekrety', consoleHub: 'Console Hub', prCockpit: 'PR Cockpit', adminCockpit: 'Admin Cockpit', marketingSales: 'Marketing + Sprzedaż', promoteBusiness: 'Promocja firmy', outreach: 'Outreach', calendar: 'Kalendarz', spreadsheets: 'Arkusze', videoStudio: 'Video Studio' },
  },
  ru: {
    intro: 'Посмотрите все продукты SignalBoost перед регистрацией',
    gated: 'требуется вход',
    groups: { free: 'Бесплатные инструменты', audit: 'Аудит и безопасность', operations: 'Операции', growth: 'Рост', office: 'Office и Studio' },
    items: { websiteOptimizer: 'Website Optimizer', cybersecurityCheck: 'Cybersecurity Check', repoAuditCheck: 'Repo / Audit Check', auditCenter: 'Audit Center', cybersecurityCenter: 'Cybersecurity Center', identitySecrets: 'Identity & Secrets', consoleHub: 'Console Hub', prCockpit: 'PR Cockpit', adminCockpit: 'Admin Cockpit', marketingSales: 'Marketing + Sales', promoteBusiness: 'Promote Business', outreach: 'Outreach', calendar: 'Calendar', spreadsheets: 'Spreadsheets', videoStudio: 'Video Studio' },
  },
}

function activeLang(lang: string): Lang {
  return (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang
}

export default function PublicServiceWindowNav() {
  const pathname = usePathname()
  const { lang } = useI18n()
  const copy = COPY[activeLang(lang)]
  const [openGroup, setOpenGroup] = useState<GroupId | null>(null)

  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin') || pathname?.startsWith('/hub')) return null

  return (
    <section aria-label={copy.intro} style={{ position: 'relative', zIndex: 90, borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(2,6,23,.82)', backdropFilter: 'blur(12px)', overflow: 'visible' }}>
      <style>{`
        .sb-public-window{display:flex;gap:10px;align-items:center;flex-wrap:wrap;overflow:visible;padding:8px 22px;}
        .sb-public-group{position:relative;flex:0 0 auto;}
        .sb-public-panel{position:absolute;top:calc(100% + 8px);left:0;width:340px;max-width:92vw;border:1px solid rgba(26,240,255,.22);background:linear-gradient(145deg,rgba(3,7,18,.99),rgba(15,23,42,.98));border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.55);padding:12px;z-index:1200;}
        .sb-public-link{display:flex;gap:10px;align-items:center;text-decoration:none;color:#fff;border-radius:12px;padding:10px;}
        .sb-public-link:hover{background:rgba(255,255,255,.07);}
        @media(max-width:760px){.sb-public-window{padding:8px 14px}.sb-public-intro{display:none}.sb-public-panel{position:fixed;left:12px;right:12px;width:auto;top:108px}}
      `}</style>
      <div className="sb-public-window">
        <span className="sb-public-intro" style={{ color: 'rgba(148,163,184,.88)', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{copy.intro}</span>
        {GROUPS.map(group => {
          const open = openGroup === group.id
          return (
            <div key={group.id} className="sb-public-group">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenGroup(open ? null : group.id)}
                style={{ border: open ? '1px solid rgba(26,240,255,.45)' : '1px solid rgba(255,255,255,.12)', background: open ? 'rgba(26,240,255,.12)' : 'rgba(255,255,255,.04)', color: '#fff', borderRadius: 999, padding: '7px 11px', fontWeight: 900, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {copy.groups[group.id]} {open ? '▴' : '▾'}
              </button>
              {open ? (
                <div className="sb-public-panel">
                  {group.itemIds.map(itemId => {
                    const item = ITEMS[itemId]
                    return (
                      <Link key={`${group.id}:${item.href}:${itemId}`} href={item.href} onClick={() => setOpenGroup(null)} className="sb-public-link">
                        <span style={{ fontSize: 18 }}>{item.icon}</span>
                        <span style={{ display: 'grid', gap: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 900 }}>{copy.items[itemId]}</span>
                          {item.gated ? <span style={{ color: 'rgba(148,163,184,.86)', fontSize: 11 }}>{copy.gated}</span> : null}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
