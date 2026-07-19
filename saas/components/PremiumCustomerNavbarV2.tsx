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
  fallbackLabel: string
  href?: string
  requiresOwner?: boolean
  action?: 'logout'
}

type NavGroup = {
  id: string
  labelKey: string
  fallbackLabel: string
  items: NavItem[]
}

const PURPLE = '#a78bfa'
const LANGUAGES = ['en', 'pt', 'es', 'pl', 'ru'] as const

const GROUPS: NavGroup[] = [
  {
    id: 'public-tools',
    labelKey: 'nav.publicTools.label',
    fallbackLabel: 'Public Tools',
    items: [
      { icon: '◎', labelKey: 'nav.publicTools.siteReview', fallbackLabel: 'Site Review', href: '/dashboard/audit' },
      { icon: '🛡️', labelKey: 'nav.publicTools.securityCheck', fallbackLabel: 'Security Check', href: '/cybersecurity-check' },
      { icon: '✦', labelKey: 'nav.publicTools.improveYourSite', fallbackLabel: 'Improve Your Site', href: '/dashboard/improve' },
    ],
  },
  {
    id: 'campaigns',
    labelKey: 'nav.campaigns',
    fallbackLabel: 'Campaigns',
    items: [
      { icon: '🎥', labelKey: 'nav.campaignStudio', fallbackLabel: 'Campaign Studio', href: '/agency' },
      { icon: '📈', labelKey: 'nav.marketingSales', fallbackLabel: 'Marketing + Sales', href: '/dashboard/sales' },
      { icon: '🧭', labelKey: 'nav.marketingSetup', fallbackLabel: 'Marketing + Sales Setup', href: '/onboarding' },
      { icon: '📧', labelKey: 'nav.emailOutreach', fallbackLabel: 'Email Outreach', href: '/dashboard/outreach' },
      { icon: '📣', labelKey: 'nav.campaignConsole', fallbackLabel: 'Campaign Console', href: '/dashboard/cosa' },
      { icon: '🎬', labelKey: 'nav.videoPipeline', fallbackLabel: 'Video Pipeline', href: '/dashboard/cosa/video-pipeline' },
      { icon: '🗂️', labelKey: 'nav.pressPrint', fallbackLabel: 'Press & Print Media', href: '/dashboard/marketing/press-print' },
      { icon: '🧾', labelKey: 'nav.pressOutreach', fallbackLabel: 'Press Outreach', href: '/dashboard/marketing/press-outreach' },
      { icon: '📢', labelKey: 'nav.promote', fallbackLabel: 'Promote', href: '/dashboard/promote' },
    ],
  },
  {
    id: 'operations',
    labelKey: 'nav.operations',
    fallbackLabel: 'Operations',
    items: [
      { icon: '🏠', labelKey: 'nav.dashboard', fallbackLabel: 'Dashboard', href: '/dashboard' },
      { icon: '📅', labelKey: 'nav.calendar', fallbackLabel: 'Calendar', href: '/dashboard/calendar' },
      { icon: '📑', labelKey: 'nav.spreadsheets', fallbackLabel: 'Spreadsheets', href: '/dashboard/spreadsheets' },
      { icon: '⭐', labelKey: 'nav.reviews', fallbackLabel: 'Reviews', href: '/dashboard/reviews' },
      { icon: '🤖', labelKey: 'nav.concierge', fallbackLabel: 'Concierge', href: '/dashboard/assistant' },
      { icon: '💬', labelKey: 'nav.feedback', fallbackLabel: 'Feedback', href: '/dashboard/feedback' },
      { icon: '🔌', labelKey: 'nav.integrations', fallbackLabel: 'Integrations', href: '/integrations' },
      { icon: '📋', labelKey: 'nav.infrastructure', fallbackLabel: 'Infrastructure Changes', href: '/dashboard/infrastructure' },
    ],
  },
  {
    id: 'studio',
    labelKey: 'nav.studio',
    fallbackLabel: 'Studio',
    items: [
      { icon: '🌐', labelKey: 'nav.websiteBuilder', fallbackLabel: 'Build a Website', href: '/dashboard/builder' },
      { icon: '✨', labelKey: 'nav.improveContent', fallbackLabel: 'Improve Content', href: '/dashboard/improve' },
      { icon: '🚀', labelKey: 'nav.launchpad', fallbackLabel: 'Launchpad', href: '/dashboard/launchpad' },
      { icon: '🏢', labelKey: 'nav.buildBusiness', fallbackLabel: 'Build a Business', href: '/dashboard/launchpad/business' },
      { icon: '🛒', labelKey: 'nav.onlineStore', fallbackLabel: 'Online Store', href: '/dashboard/launchpad/store' },
      { icon: '🎙️', labelKey: 'nav.podcastLaunchpad', fallbackLabel: 'Podcast Launchpad', href: '/dashboard/launchpad/podcast' },
      { icon: '🎚️', labelKey: 'nav.podcastStudio', fallbackLabel: 'Podcast Studio', href: '/dashboard/podcast/studio' },
      { icon: '🎬', labelKey: 'nav.videoStudio', fallbackLabel: 'Video Studio', href: '/dashboard/video' },
      { icon: '🎧', labelKey: 'nav.audioStudio', fallbackLabel: 'Audio Studio', href: '/dashboard/audio' },
      { icon: '🎨', labelKey: 'nav.creativeStudio', fallbackLabel: 'Creative Studio', href: '/dashboard/creative' },
    ],
  },
  {
    id: 'security',
    labelKey: 'nav.security',
    fallbackLabel: 'Security',
    items: [
      { icon: '🛡️', labelKey: 'nav.cybersecurity', fallbackLabel: 'Cybersecurity', href: '/dashboard/cybersecurity' },
      { icon: '📋', labelKey: 'nav.auditConsole', fallbackLabel: 'Audit Console', href: '/dashboard/audit' },
      { icon: '🎛️', labelKey: 'nav.auditCockpit', fallbackLabel: 'Audit Cockpit', href: '/hub/audit' },
    ],
  },
  {
    id: 'help',
    labelKey: 'nav.help',
    fallbackLabel: 'Help',
    items: [
      { icon: '❓', labelKey: 'nav.coreHelp', fallbackLabel: 'Contact Support', href: '/support' },
      { icon: '📖', labelKey: 'nav.documentation', fallbackLabel: 'Documentation', href: '/docs' },
      { icon: '↪', labelKey: 'nav.logOut', fallbackLabel: 'Log out', action: 'logout' },
    ],
  },
  {
    id: 'admin',
    labelKey: 'nav.admin',
    fallbackLabel: 'Admin',
    items: [
      { icon: '🤖', labelKey: 'nav.cosAssistant', fallbackLabel: 'COS Assistant', href: '/dashboard/assistant', requiresOwner: true },
      { icon: '👑', labelKey: 'nav.ownerAdmin', fallbackLabel: 'Owner/Admin', href: '/admin', requiresOwner: true },
      { icon: '🛑', labelKey: 'nav.supervisorSOC', fallbackLabel: 'Supervisor SOC', href: '/dashboard/supervisor', requiresOwner: true },
      { icon: '🎛️', labelKey: 'nav.consoleHub', fallbackLabel: 'Console Hub', href: '/hub', requiresOwner: true },
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
    })).filter(group => group.items.length > 0 && group.items.some(item => item.action !== 'logout' || user)),
    [ownerAccess, user],
  )

  const searchableItems = useMemo(
    () => [
      { icon: '⌂', label: t('nav.home', 'Home'), href: '/' },
      { icon: '💳', label: t('nav.pricing', 'Pricing'), href: '/pricing' },
      ...groups.flatMap(group => group.items.filter(item => item.href).map(item => ({
        ...item,
        label: t(item.labelKey, item.fallbackLabel),
      }))),
    ],
    [groups, t],
  )

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const searchResults = searchableItems.filter(item => item.label.toLocaleLowerCase().includes(normalizedQuery))

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
    let cancelled = false
    async function loadRole(attempt = 0): Promise<void> {
      try {
        const response = await fetch('/api/credits', { cache: 'no-store' })
        if (!response.ok) {
          // A non-200 (transient 401/500) must NOT silently strip an owner/admin
          // of their navigation. Retry once, then leave the last known role
          // untouched rather than hiding privileged items.
          if (attempt < 1 && !cancelled) return loadRole(attempt + 1)
          return
        }
        const data = await response.json()
        if (cancelled) return
        setIsAdmin(Boolean(data.isAdmin))
        setIsOwner(Boolean(data.isOwner))
      } catch {
        // Network error: retry once, then keep existing role — never hide controls.
        if (attempt < 1 && !cancelled) return loadRole(attempt + 1)
      }
    }
    loadRole()
    return () => {
      cancelled = true
    }
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
    const label = t(item.labelKey, item.fallbackLabel)
    if (item.action === 'logout') {
      return user ? (
        <button key={item.labelKey} type="button" onClick={handleLogout} className={mobile ? 'sbnav-mobile-row' : 'sbnav-row'}>
          <span aria-hidden>{item.icon}</span><span>{label}</span>
        </button>
      ) : null
    }
    if (!item.href) return null
    return (
      <Link key={`${item.labelKey}-${item.href}`} href={item.href} onClick={() => { setOpenMenu(null); setMobileOpen(false) }} className={mobile ? 'sbnav-mobile-row' : 'sbnav-row'}>
        <span aria-hidden>{item.icon}</span><span>{label}</span>
      </Link>
    )
  }

  return (
    <>
      <style>{`
        .sbnav { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 14px; padding: 11px 22px; background: rgba(4, 8, 18, .95); border-bottom: 1px solid rgba(167, 139, 250, .35); backdrop-filter: blur(14px); }
        .sbnav-brand, .sbnav-trigger, .sbnav-row, .sbnav-mobile-row { color: #f8fafc; text-decoration: none; font: inherit; }
        .sbnav-brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 900; white-space: nowrap; }
        .sbnav-brand-mark { color: ${PURPLE}; font-size: 24px; }
        .sbnav-desktop { display: flex; align-items: center; gap: 5px; min-width: 0; }
        .sbnav-menu { position: relative; }
        .sbnav-trigger { display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; border-radius: 999px; padding: 8px 10px; background: transparent; cursor: pointer; color: rgba(226,232,240,.76); font-size: 13px; font-weight: 700; white-space: nowrap; }
        .sbnav-trigger:hover, .sbnav-trigger-active { color: #fff; background: rgba(167,139,250,.16); border-color: ${PURPLE}; }
        .sbnav-pricing { color: #f8fafc; border-color: rgba(255,195,0,.55); background: rgba(255,195,0,.08); }
        .sbnav-pricing:hover, .sbnav-pricing.sbnav-trigger-active { border-color: #ffc300; background: rgba(255,195,0,.18); }
        .sbnav-dropdown { position: absolute; top: calc(100% + 10px); left: 0; z-index: 120; display: grid; gap: 3px; min-width: 250px; max-height: min(70vh, 560px); overflow-y: auto; padding: 8px; border: 1px solid rgba(167,139,250,.45); border-radius: 14px; background: #0f172a; box-shadow: 0 18px 45px rgba(0,0,0,.42); }
        .sbnav-row, .sbnav-mobile-row { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; border-radius: 9px; padding: 9px 10px; background: transparent; cursor: pointer; text-align: left; color: rgba(226,232,240,.84); font-size: 13px; }
        .sbnav-row:hover, .sbnav-mobile-row:hover { background: rgba(255,255,255,.07); color: #fff; }
        .sbnav-search { position: relative; margin-left: auto; width: min(250px, 22vw); }
        .sbnav-search input { width: 100%; box-sizing: border-box; border: 1px solid rgba(167,139,250,.5); border-radius: 999px; padding: 8px 12px; background: rgba(15,23,42,.9); color: #fff; font: inherit; font-size: 13px; outline: none; }
        .sbnav-search input:focus { border-color: ${PURPLE}; box-shadow: 0 0 0 3px rgba(167,139,250,.16); }
        .sbnav-search-results { right: 0; left: auto; max-height: 320px; overflow-y: auto; }
        .sbnav-language { border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 8px 10px; background: #0f172a; color: #e2e8f0; font: inherit; font-size: 12px; }
        .sbnav-auth, .sbnav-burger { border: 0; border-radius: 999px; padding: 8px 13px; background: ${PURPLE}; color: #160b2b; font: inherit; font-weight: 800; cursor: pointer; white-space: nowrap; }
        .sbnav-burger { display: none; border-radius: 10px; color: #fff; background: transparent; border: 1px solid rgba(255,255,255,.2); }
        .sbnav-mobile { display: none; }
        @media (max-width: 1280px) { .sbnav-desktop, .sbnav-search, .sbnav-language, .sbnav-auth { display: none; } .sbnav-burger { display: inline-flex; margin-left: auto; } .sbnav-mobile { display: grid; gap: 13px; max-height: calc(100vh - 62px); overflow-y: auto; padding: 14px 20px 20px; background: #070d1c; border-bottom: 1px solid rgba(167,139,250,.35); } .sbnav-mobile-group { display: grid; gap: 4px; } .sbnav-mobile-label { color: ${PURPLE}; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; } .sbnav-mobile-search { width: 100%; } .sbnav-mobile-search .sbnav-dropdown { position: static; margin-top: 8px; } }
      `}</style>
      <nav className="sbnav" ref={navRef}>
        <Link href="/" className="sbnav-brand"><span className="sbnav-brand-mark" aria-hidden>⌁</span><span>SignalBoostAi</span></Link>
        <div className="sbnav-desktop">
          <Link href="/" className={`sbnav-trigger ${itemIsActive(pathname, '/') ? 'sbnav-trigger-active' : ''}`}>{t('nav.home', 'Home')}</Link>
          <Link href="/pricing" className={`sbnav-trigger sbnav-pricing ${itemIsActive(pathname, '/pricing') ? 'sbnav-trigger-active' : ''}`}>{t('nav.pricing', 'Pricing')}</Link>
          {groups.map(group => {
            const open = openMenu === group.id
            const active = group.items.some(item => itemIsActive(pathname, item.href))
            return (
              <div className="sbnav-menu" key={group.id}>
                <button type="button" className={`sbnav-trigger ${active ? 'sbnav-trigger-active' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpenMenu(open ? null : group.id)}>
                  {t(group.labelKey, group.fallbackLabel)} <span aria-hidden>▾</span>
                </button>
                {open ? <div className="sbnav-dropdown" role="menu">{group.items.map(item => renderItem(item))}</div> : null}
              </div>
            )
          })}
        </div>
        <div className="sbnav-search">
          <input type="search" value={query} placeholder={t('nav.searchPlaceholder', 'Search sections')} aria-label={t('nav.searchLabel', 'Search navigation')} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true) }} />
          {searchOpen ? <div className="sbnav-dropdown sbnav-search-results" role="listbox">{searchResults.length ? searchResults.map(item => <button key={item.href} type="button" className="sbnav-row" role="option" onClick={() => selectSearchResult(item.href!)}>{item.icon}<span>{item.label}</span></button>) : <span className="sbnav-row">{t('nav.noSearchResults', 'No matching sections')}</span>}</div> : null}
        </div>
        <select className="sbnav-language" value={lang} aria-label={t('nav.languageLabel', 'Language')} onChange={event => setLang(event.target.value)}>{LANGUAGES.map(code => <option key={code} value={code}>{t(`nav.languages.${code}`, code.toUpperCase())}</option>)}</select>
        {user ? null : <button type="button" className="sbnav-auth" onClick={() => setShowAuth(true)}>{t('nav.getStarted', 'Get started')}</button>}
        <button type="button" className="sbnav-burger" aria-label={t('nav.menu', 'Menu')} aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>{mobileOpen ? '✕' : '☰'}</button>
      </nav>
      {mobileOpen ? (
        <div className="sbnav-mobile">
          <div className="sbnav-search sbnav-mobile-search">
            <input type="search" value={query} placeholder={t('nav.searchPlaceholder', 'Search sections')} aria-label={t('nav.searchLabel', 'Search navigation')} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true) }} />
            {searchOpen ? <div className="sbnav-dropdown sbnav-search-results" role="listbox">{searchResults.length ? searchResults.map(item => <button key={item.href} type="button" className="sbnav-row" role="option" onClick={() => selectSearchResult(item.href!)}>{item.icon}<span>{item.label}</span></button>) : <span className="sbnav-row">{t('nav.noSearchResults', 'No matching sections')}</span>}</div> : null}
          </div>
          <Link href="/" onClick={() => setMobileOpen(false)} className="sbnav-mobile-row">⌂<span>{t('nav.home', 'Home')}</span></Link>
          <Link href="/pricing" onClick={() => setMobileOpen(false)} className="sbnav-mobile-row">💳<span>{t('nav.pricing', 'Pricing')}</span></Link>
          {groups.map(group => <div key={group.id} className="sbnav-mobile-group"><span className="sbnav-mobile-label">{t(group.labelKey, group.fallbackLabel)}</span>{group.items.map(item => renderItem(item, true))}</div>)}
          {user ? null : <button type="button" className="sbnav-auth" onClick={() => { setMobileOpen(false); setShowAuth(true) }}>{t('nav.getStarted', 'Get started')}</button>}
        </div>
      ) : null}
      {showAuth ? <AuthModal onClose={() => setShowAuth(false)} /> : null}
    </>
  )
}
