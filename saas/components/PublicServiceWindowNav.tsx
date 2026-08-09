'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type GroupId = 'free' | 'growth' | 'office'
type ItemId =
  | 'websiteOptimizer'
  | 'repoCheck'
  | 'agencyEngine'
  | 'promoteBusiness'
  | 'outreach'
  | 'calendar'
  | 'spreadsheets'

type ItemConfig = { icon: string; href: string; gated?: boolean }

type Copy = {
  intro: string
  gated: string
  groups: Record<GroupId, string>
  items: Record<ItemId, string>
}

const ITEMS: Record<ItemId, ItemConfig> = {
  websiteOptimizer: { icon: '🌐', href: '/website-optimizer' },
  repoCheck: { icon: '📋', href: '/repo-check' },
  agencyEngine: { icon: '🚀', href: '/agency' },
  promoteBusiness: { icon: '📢', href: '/products/promote-business', gated: true },
  outreach: { icon: '🛸', href: '/products/outreach', gated: true },
  calendar: { icon: '📅', href: '/products/calendar', gated: true },
  spreadsheets: { icon: '📑', href: '/products/spreadsheets', gated: true },
}

const GROUPS: Array<{ id: GroupId; itemIds: ItemId[] }> = [
  { id: 'free', itemIds: ['websiteOptimizer', 'repoCheck'] },
  { id: 'growth', itemIds: ['agencyEngine', 'promoteBusiness', 'outreach'] },
  { id: 'office', itemIds: ['calendar', 'spreadsheets'] },
]

const COPY: Record<Lang, Copy> = {
  en: {
    intro: uiText('generatedUi.u_2f7c176cdfe373ae'),
    gated: uiText('generatedUi.u_d20312bc8022b58e'),
    groups: { free: uiText('generatedUi.u_5c2bd9d1471acbd9'), growth: uiText('generatedUi.u_dcba31525bd63b56'), office: uiText('generatedUi.u_d8e45e5224a0e88d') },
    items: { websiteOptimizer: uiText('generatedUi.u_7c0cbab9b791858b'), repoCheck: `${uiText('generatedUi.u_c59c2a7247b87f50')} / ${uiText('generatedUi.u_281ad82f2d803589')}`, agencyEngine: uiText('generatedUi.u_3f4206fe133b6473'), promoteBusiness: uiText('generatedUi.u_142c459ee190faea'), outreach: uiText('generatedUi.u_a5803fdf10e57e66'), calendar: uiText('generatedUi.u_d5d0a30b517e3bea'), spreadsheets: uiText('generatedUi.u_fdae6602c2bebdcc') },
  },
  es: {
    intro: 'Acceso rápido antes de registrarte',
    gated: 'más información',
    groups: { free: 'Herramientas gratis', growth: 'Marketing + Ventas', office: 'Oficina' },
    items: { websiteOptimizer: 'Optimizador Web', repoCheck: 'Repo / Auditoría', agencyEngine: 'Agency Engine', promoteBusiness: 'Promocionar negocio', outreach: 'Outreach', calendar: 'Calendario', spreadsheets: 'Hojas de cálculo' },
  },
  pt: {
    intro: 'Acesso rápido antes de se cadastrar',
    gated: 'saiba mais',
    groups: { free: 'Ferramentas grátis', growth: 'Marketing + Vendas', office: 'Escritório' },
    items: { websiteOptimizer: 'Otimizador de Site', repoCheck: 'Repo / Auditoria', agencyEngine: 'Agency Engine', promoteBusiness: 'Promover negócio', outreach: 'Outreach', calendar: 'Calendário', spreadsheets: 'Planilhas' },
  },
  pl: {
    intro: 'Szybki dostęp przed rejestracją',
    gated: 'dowiedz się więcej',
    groups: { free: 'Darmowe narzędzia', growth: 'Marketing + Sprzedaż', office: 'Biuro' },
    items: { websiteOptimizer: 'Optymalizator Strony', repoCheck: 'Repo / Audyt', agencyEngine: 'Agency Engine', promoteBusiness: 'Promocja firmy', outreach: 'Outreach', calendar: 'Kalendarz', spreadsheets: 'Arkusze' },
  },
  ru: {
    intro: 'Быстрый доступ перед регистрацией',
    gated: 'подробнее',
    groups: { free: 'Бесплатные инструменты', growth: 'Marketing + Sales', office: 'Офис' },
    items: { websiteOptimizer: 'Website Optimizer', repoCheck: 'Repo / Аудит', agencyEngine: 'Agency Engine', promoteBusiness: 'Promote Business', outreach: 'Outreach', calendar: 'Calendar', spreadsheets: 'Spreadsheets' },
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
      <style>{"\n        .sb-public-window{display:flex;gap:10px;align-items:center;flex-wrap:wrap;overflow:visible;padding:8px 22px;}\n        .sb-public-group{position:relative;flex:0 0 auto;}\n        .sb-public-panel{position:absolute;top:calc(100% + 8px);left:0;width:310px;max-width:92vw;border:1px solid rgba(26,240,255,.22);background:linear-gradient(145deg,rgba(3,7,18,.99),rgba(15,23,42,.98));border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.55);padding:12px;z-index:1200;}\n        .sb-public-link{display:flex;gap:10px;align-items:center;text-decoration:none;color:#fff;border-radius:12px;padding:10px;}\n        .sb-public-link:hover{background:rgba(255,255,255,.07);}\n        @media(max-width:760px){.sb-public-window{padding:8px 14px}.sb-public-intro{display:none}.sb-public-panel{position:fixed;left:12px;right:12px;width:auto;top:108px}}\n      "}</style>
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
