'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import AuthModal from './AuthModal'
import { supabase } from '@/utils/supabase/client'

type NavItem = {
  icon: string
  labelKey: string
  href?: string
  requiresOwner?: boolean
  action?: 'logout'
}

type NavGroup = {
  id: string
  labelKey: string
  items: NavItem[]
}

const PURPLE = '#a78bfa'
const LANGUAGES = ['en', 'pt', 'es', 'pl', 'ru'] as const

const GROUPS: NavGroup[] = [
  {
    id: 'campaigns',
    labelKey: 'nav.campaigns',
    items: [
      { icon: '🎥', labelKey: 'nav.campaignStudio', href: '/agency' },
      { icon: '📈', labelKey: 'nav.marketingSales', href: '/dashboard/sales' },
      { icon: '🎬', labelKey: 'nav.studio', href: '/dashboard/video' },
    ],
  },
  {
    id: 'operations',
    labelKey: 'nav.operations',
    items: [
      { icon: '🛑', labelKey: 'nav.supervisorSOC', href: '/dashboard/supervisor', requiresOwner: true },
      { icon: '🎛️', labelKey: 'nav.consoleHub', href: '/hub', requiresOwner: true },
      { icon: '🏢', labelKey: 'nav.saasStation', href: '/dashboard' },
      { icon: '📋', labelKey: 'nav.auditCockpit', href: '/hub/audit' },
    ],
  },
  {
    id: 'security',
    labelKey: 'nav.security',
    items: [
      { icon: '🛡️', labelKey: 'nav.cybersecurity', href: '/dashboard/cybersecurity' },
      { icon: '🌐', labelKey: 'nav.website', href: '/dashboard/builder' },
    ],
  },
  {
    id: 'admin',
    labelKey: 'nav.admin',
    items: [
      { icon: '👑', labelKey: 'nav.ownerAdmin', href: '/admin', requiresOwner: true },
      { icon: '❓', labelKey: 'nav.coreHelp', href: '/support' },
      { icon: '💳', labelKey: 'nav.pricing', href: '/pricing' },
      { icon: '↪', labelKey: 'nav.logOut', action: 'logout' },
    ],
  },
]

function pathFor(href: string) {
  return href.split('?')[0]
}

function itemIsActive(pathname: string | null, href?: string) {
  if (!href || !pathname) return false
  const path = pathFor(href)
  return pathname === path || (path !== '/' && pathname.startsWith(`${path}/`))
}

export default function PremiumCustomerNavbarV2() {
  const navRef = useRef<HTMLElement>(null)
  const pathname = usePathname()
  const router = useRouter()
  const { t, lang, setLang } = useTranslation()
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showAuth, setShowAuth] = useState(false)

  const ownerAccess = isAdmin || isOwner
  const groups = useMemo(
    () => GROUPS.map(group => ({
      ...group,
      items: group.items.filter(item => !item.requiresOwner || ownerAccess),
    })).filter(group => group.items.some(item => item.action !== 'logout' || user)),
    [ownerAccess, user],
  )
  const searchableItems = useMemo(
    () => [
      { icon: '⌂', label: t('nav.home'), href: '/' },
      ...groups.flatMap(group => group.items.filter(item => item.href).map(item => ({ ...item, label: t(item.labelKey) }))),
    ],
    [groups, t],
  )
  const searchResults = searchableItems.filter(item => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      setIsOwner(false)
      return
    }
    fetch('/api/credits', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => {
        setIsAdmin(Boolean(data.isAdmin))
        setIsOwner(Boolean(data.isOwner))
      })
      .catch(() => {
        setIsAdmin(false)
        setIsOwner(false)
      })
  }, [user])

  useEffect(() => {
    setOpenMenu(null)
    setMobileOpen(false)
    setSearchOpen(false)
    setQuery('')
  }, [pathname])

  useEffect(() => {
    const onDocumentPointerDown = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
        setSearchOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocumentPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  async function handleLogout() {
    sessionStorage.removeItem('greetingDismissed')
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function selectSearchResult(href: string) {
    setSearchOpen(false)
    setQuery('')
    router.push(href)
  }

  function renderItem(item: NavItem, mobile = false) {
    const label = t(item.labelKey)
    if (item.action === 'logout') {
      return user ? <button key={item.labelKey} type="button" onClick={handleLogout} className={mobile ? 'sbnav-mobile-row' : 'sbnav-row'}>{item.icon}<span>{label}</span></button> : null
    }
    if (!item.href) return null
    return <Link key={item.labelKey} href={item.href} onClick={() => { setOpenMenu(null); setMobileOpen(false) }} className={mobile ? 'sbnav-mobile-row' : 'sbnav-row'}>{item.icon}<span>{label}</span></Link>
  }

  return (
    <>
      <style>{`
        .sbnav { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 16px; padding: 11px 22px; background: rgba(4, 8, 18, .95); border-bottom: 1px solid rgba(167, 139, 250, .35); backdrop-filter: blur(14px); }
        .sbnav-brand, .sbnav-trigger, .sbnav-row, .sbnav-mobile-row { color: #f8fafc; text-decoration: none; font: inherit; }
        .sbnav-brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 900; white-space: nowrap; }
        .sbnav-brand-mark { color: ${PURPLE}; font-size: 24px; }
        .sbnav-desktop { display: flex; align-items: center; gap: 5px; min-width: 0; }
        .sbnav-menu { position: relative; }
        .sbnav-trigger { display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; border-radius: 999px; padding: 8px 11px; background: transparent; cursor: pointer; color: rgba(226,232,240,.76); font-size: 13px; font-weight: 700; white-space: nowrap; }
        .sbnav-trigger:hover, .sbnav-trigger-active { color: #fff; background: rgba(167,139,250,.16); border-color: ${PURPLE}; }
        .sbnav-dropdown { position: absolute; top: calc(100% + 10px); left: 0; z-index: 120; display: grid; gap: 3px; min-width: 220px; padding: 8px; border: 1px solid rgba(167,139,250,.45); border-radius: 14px; background: #0f172a; box-shadow: 0 18px 45px rgba(0,0,0,.42); }
        .sbnav-row, .sbnav-mobile-row { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; border-radius: 9px; padding: 9px 10px; background: transparent; cursor: pointer; text-align: left; color: rgba(226,232,240,.84); font-size: 13px; }
        .sbnav-row:hover, .sbnav-mobile-row:hover { background: rgba(255,255,255,.07); color: #fff; }
        .sbnav-search { position: relative; margin-left: auto; width: min(260px, 24vw); }
        .sbnav-search input { width: 100%; box-sizing: border-box; border: 1px solid rgba(167,139,250,.5); border-radius: 999px; padding: 8px 12px; background: rgba(15,23,42,.9); color: #fff; font: inherit; font-size: 13px; outline: none; }
        .sbnav-search input:focus { border-color: ${PURPLE}; box-shadow: 0 0 0 3px rgba(167,139,250,.16); }
        .sbnav-search-results { right: 0; left: auto; max-height: 320px; overflow-y: auto; }
        .sbnav-language { border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 8px 10px; background: #0f172a; color: #e2e8f0; font: inherit; font-size: 12px; }
        .sbnav-auth, .sbnav-burger { border: 0; border-radius: 999px; padding: 8px 13px; background: ${PURPLE}; color: #160b2b; font: inherit; font-weight: 800; cursor: pointer; white-space: nowrap; }
        .sbnav-burger { display: none; border-radius: 10px; color: #fff; background: transparent; border: 1px solid rgba(255,255,255,.2); }
        .sbnav-mobile { display: none; }
        @media (max-width: 1050px) { .sbnav-desktop, .sbnav-search, .sbnav-language, .sbnav-auth { display: none; } .sbnav-burger { display: inline-flex; margin-left: auto; } .sbnav-mobile { display: grid; gap: 13px; padding: 14px 20px 20px; background: #070d1c; border-bottom: 1px solid rgba(167,139,250,.35); } .sbnav-mobile-group { display: grid; gap: 4px; } .sbnav-mobile-label { color: ${PURPLE}; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; } .sbnav-mobile-search { width: 100%; } .sbnav-mobile-search .sbnav-dropdown { position: static; margin-top: 8px; } }
      `}</style>
      <nav className="sbnav" ref={navRef}>
        <Link href="/" className="sbnav-brand"><span className="sbnav-brand-mark" aria-hidden>⌁</span><span>SignalBoostAi</span></Link>
        <div className="sbnav-desktop">
          <Link href="/" className={`sbnav-trigger ${itemIsActive(pathname, '/') ? 'sbnav-trigger-active' : ''}`}>{t('nav.home')}</Link>
          {groups.map(group => {
            const open = openMenu === group.id
            const active = group.items.some(item => itemIsActive(pathname, item.href))
            return <div className="sbnav-menu" key={group.id}>
              <button type="button" className={`sbnav-trigger ${active ? 'sbnav-trigger-active' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpenMenu(open ? null : group.id)}>{t(group.labelKey)} <span aria-hidden>▾</span></button>
              {open ? <div className="sbnav-dropdown" role="menu">{group.items.map(item => renderItem(item))}</div> : null}
            </div>
          })}
        </div>
        <div className="sbnav-search">
          <input type="search" value={query} placeholder={t('nav.searchPlaceholder')} aria-label={t('nav.searchLabel')} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true) }} />
          {searchOpen ? <div className="sbnav-dropdown sbnav-search-results" role="listbox">{searchResults.length ? searchResults.map(item => <button key={item.href} type="button" className="sbnav-row" role="option" onClick={() => selectSearchResult(item.href!)}>{item.icon}<span>{item.label}</span></button>) : <span className="sbnav-row">{t('nav.noSearchResults')}</span>}</div> : null}
        </div>
        <select className="sbnav-language" value={lang} aria-label={t('nav.languageLabel')} onChange={event => setLang(event.target.value)}>{LANGUAGES.map(code => <option key={code} value={code}>{t(`nav.languages.${code}`)}</option>)}</select>
        {user ? null : <button type="button" className="sbnav-auth" onClick={() => setShowAuth(true)}>{t('nav.getStarted')}</button>}
        <button type="button" className="sbnav-burger" aria-label={t('nav.menu')} aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>{mobileOpen ? '✕' : '☰'}</button>
      </nav>
      {mobileOpen ? <div className="sbnav-mobile">
        <div className="sbnav-search sbnav-mobile-search">
          <input type="search" value={query} placeholder={t('nav.searchPlaceholder')} aria-label={t('nav.searchLabel')} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true) }} />
          {searchOpen ? <div className="sbnav-dropdown sbnav-search-results" role="listbox">{searchResults.length ? searchResults.map(item => <button key={item.href} type="button" className="sbnav-row" role="option" onClick={() => selectSearchResult(item.href!)}>{item.icon}<span>{item.label}</span></button>) : <span className="sbnav-row">{t('nav.noSearchResults')}</span>}</div> : null}
        </div>
        <Link href="/" onClick={() => setMobileOpen(false)} className="sbnav-mobile-row">⌂<span>{t('nav.home')}</span></Link>
        {groups.map(group => <div key={group.id} className="sbnav-mobile-group"><span className="sbnav-mobile-label">{t(group.labelKey)}</span>{group.items.map(item => renderItem(item, true))}</div>)}
        {user ? null : <button type="button" className="sbnav-auth" onClick={() => { setMobileOpen(false); setShowAuth(true) }}>{t('nav.getStarted')}</button>}
      </div> : null}
      {showAuth ? <AuthModal onClose={() => setShowAuth(false)} /> : null}
    </>
  )
}
