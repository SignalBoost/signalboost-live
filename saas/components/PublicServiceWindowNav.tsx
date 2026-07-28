'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
    intro: uiCopy('u_786cb118db2ef251'),
    gated: uiCopy('u_e6f51e6793ca739c'),
    groups: { free: uiCopy('u_c2d4a7aa2bc068d6'), growth: uiCopy('u_4c6958b65c131242'), office: uiCopy('u_cb1fbfbfc7cfbc91') },
    items: { websiteOptimizer: uiCopy('u_457018484f95e12c'), repoCheck: uiCopy('u_39ccc0313b9c656a'), agencyEngine: uiCopy('u_41000752ba7fadbd'), promoteBusiness: uiCopy('u_b56ac3782bfea62c'), outreach: uiCopy('u_09ec97ab6fa6e758'), calendar: uiCopy('u_40ce3dbea80334f6'), spreadsheets: uiCopy('u_5653193d38d3f387') },
  },
  es: {
    intro: 'Acceso rápido antes de registrarte',
    gated: 'más información',
    groups: { free: 'Herramientas gratis', growth: 'Marketing + Ventas', office: 'Oficina' },
    items: { websiteOptimizer: 'Optimizador Web', repoCheck: 'Revisión de Repo', agencyEngine: 'Agency Engine', promoteBusiness: 'Promocionar negocio', outreach: 'Outreach', calendar: 'Calendario', spreadsheets: 'Hojas de cálculo' },
  },
  pt: {
    intro: 'Acesso rápido antes de se cadastrar',
    gated: 'saiba mais',
    groups: { free: 'Ferramentas grátis', growth: 'Marketing + Vendas', office: 'Escritório' },
    items: { websiteOptimizer: 'Otimizador de Site', repoCheck: 'Verificação de Repo', agencyEngine: 'Agency Engine', promoteBusiness: 'Promover negócio', outreach: 'Outreach', calendar: 'Calendário', spreadsheets: 'Planilhas' },
  },
  pl: {
    intro: 'Szybki dostęp przed rejestracją',
    gated: 'dowiedz się więcej',
    groups: { free: 'Darmowe narzędzia', growth: 'Marketing + Sprzedaż', office: 'Biuro' },
    items: { websiteOptimizer: 'Optymalizator Strony', repoCheck: 'Test Repo', agencyEngine: 'Agency Engine', promoteBusiness: 'Promocja firmy', outreach: 'Outreach', calendar: 'Kalendarz', spreadsheets: 'Arkusze' },
  },
  ru: {
    intro: 'Быстрый доступ перед регистрацией',
    gated: 'подробнее',
    groups: { free: 'Бесплатные инструменты', growth: 'Marketing + Sales', office: 'Офис' },
    items: { websiteOptimizer: 'Website Optimizer', repoCheck: 'Repo Check', agencyEngine: 'Agency Engine', promoteBusiness: 'Promote Business', outreach: 'Outreach', calendar: 'Calendar', spreadsheets: 'Spreadsheets' },
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
      <style>{uiCopy('u_817603d2f6b9d4d6')}</style>
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
