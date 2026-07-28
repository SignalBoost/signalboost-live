// saas/components/PremiumCustomerNavbarV2.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import AuthModal from './AuthModal.tsx'
import { supabase } from '@/utils/supabase/client'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
    fallbackLabel: uiCopy('u_7b63c42a076c3271'),
    items: [
      { icon: '◎', labelKey: 'nav.publicTools.siteReview', fallbackLabel: uiCopy('u_971a85e57fb17f34'), href: '/dashboard/audit' },
      { icon: '🛡️', labelKey: 'nav.publicTools.securityCheck', fallbackLabel: uiCopy('u_1314f9ab8bba5333'), href: '/cybersecurity-check' },
      { icon: '✦', labelKey: 'nav.publicTools.improveYourSite', fallbackLabel: uiCopy('u_d9dd1f9cf90b9411'), href: '/dashboard/improve' },
      { icon: '🚀', labelKey: 'nav.publicTools.websiteOptimizer', fallbackLabel: uiCopy('u_0e8d1d237be22b26'), href: '/website-optimizer' },
    ],
  },
  {
    id: 'campaigns',
    labelKey: 'nav.campaigns',
    fallbackLabel: uiCopy('u_34fa42e803e01c5e'),
    items: [
      { icon: '🎥', labelKey: 'nav.campaignStudio', fallbackLabel: uiCopy('u_4d5f5e61a757906a'), href: '/agency' },
      { icon: '📈', labelKey: 'nav.marketingSales', fallbackLabel: uiCopy('u_1dbe62ee7a5ad852'), href: '/dashboard/sales' },
      { icon: '🧭', labelKey: 'nav.marketingSetup', fallbackLabel: uiCopy('u_4e3eb759ebbdb7d4'), href: '/onboarding' },
      { icon: '📧', labelKey: 'nav.emailOutreach', fallbackLabel: uiCopy('u_eb8a4c64968e9600'), href: '/dashboard/outreach' },
      { icon: '📣', labelKey: 'nav.campaignConsole', fallbackLabel: uiCopy('u_b9689ff4157b08aa'), href: '/dashboard/cosa' },
      { icon: '🎬', labelKey: 'nav.videoPipeline', fallbackLabel: uiCopy('u_35d2313ede0d7109'), href: '/dashboard/cosa/video-pipeline' },
      { icon: '🗂️', labelKey: 'nav.pressPrint', fallbackLabel: uiCopy('u_4ad98aa98f64a8d6'), href: '/dashboard/marketing/press-print' },
      { icon: '🧾', labelKey: 'nav.pressOutreach', fallbackLabel: uiCopy('u_5eb9149f04ab588c'), href: '/dashboard/marketing/press-outreach' },
      { icon: '📰', labelKey: 'nav.pressProviders', fallbackLabel: uiCopy('u_0bd0a7e53ad136d5'), href: '/dashboard/marketing/press-providers' },
      { icon: '📢', labelKey: 'nav.promote', fallbackLabel: uiCopy('u_7fac063ce53c4317'), href: '/dashboard/promote' },
      { icon: '🔗', labelKey: 'nav.socialConnections', fallbackLabel: uiCopy('u_51bc210696ef9aac'), href: '/dashboard/outreach/social' },
      { icon: '🗃️', labelKey: 'nav.allCampaigns', fallbackLabel: uiCopy('u_5a819cf2ddaf1089'), href: '/dashboard/campaigns' },
      { icon: '💡', labelKey: 'nav.opportunities', fallbackLabel: uiCopy('u_b20b3a5c7c614067'), href: '/dashboard/opportunities' },
      { icon: '📊', labelKey: 'nav.salesPipeline', fallbackLabel: uiCopy('u_24204f180e27d302'), href: '/dashboard/sales/pipeline' },
      { icon: '📨', labelKey: 'nav.myOutreach', fallbackLabel: uiCopy('u_0585b1ed52f8649c'), href: '/dashboard/my-outreach' },
      { icon: '⛏️', labelKey: 'nav.cosMining', fallbackLabel: uiCopy('u_06ab3bf1bf4f82b0'), href: '/dashboard/cos-mining' },
      { icon: '🖥️', labelKey: 'nav.marketingConsole', fallbackLabel: uiCopy('u_16d4c0dc2e4362cb'), href: '/dashboard/marketing-sales/console' },
    ],
  },
  {
    id: 'operations',
    labelKey: 'nav.operations',
    fallbackLabel: uiCopy('u_d4680bb875b41b8e'),
    items: [
      { icon: '🏠', labelKey: 'nav.dashboard', fallbackLabel: uiCopy('u_06558cb3f8826057'), href: '/dashboard' },
      { icon: '📅', labelKey: 'nav.calendar', fallbackLabel: uiCopy('u_ab5b00fefeb2ad90'), href: '/dashboard/calendar' },
      { icon: '📑', labelKey: 'nav.spreadsheets', fallbackLabel: uiCopy('u_273d6402c23d9333'), href: '/dashboard/spreadsheets' },
      { icon: '⭐', labelKey: 'nav.reviews', fallbackLabel: uiCopy('u_da8642977f92b192'), href: '/dashboard/reviews' },
      { icon: '🤖', labelKey: 'nav.concierge', fallbackLabel: uiCopy('u_e9057925110de5e1'), href: '/dashboard/assistant' },
      { icon: '💬', labelKey: 'nav.feedback', fallbackLabel: uiCopy('u_55a9f18716ece64c'), href: '/dashboard/feedback' },
      { icon: '🔌', labelKey: 'nav.integrations', fallbackLabel: uiCopy('u_d497947000b68d9a'), href: '/integrations' },
      { icon: '📋', labelKey: 'nav.infrastructure', fallbackLabel: uiCopy('u_b746e55f7a20a49b'), href: '/dashboard/infrastructure' },
      { icon: '👥', labelKey: 'nav.team', fallbackLabel: uiCopy('u_a5201d7942214f19'), href: '/dashboard/team' },
      { icon: '📊', labelKey: 'nav.operationsDashboard', fallbackLabel: uiCopy('u_0445d4a621d16193'), href: '/dashboard/operations' },
      { icon: '🧩', labelKey: 'nav.enterpriseIntegrations', fallbackLabel: uiCopy('u_fe250fdab7c4d527'), href: '/enterprise-integration-builder' },
    ],
  },
  {
    id: 'studio',
    labelKey: 'nav.studio',
    fallbackLabel: uiCopy('u_657cf7701e62136d'),
    items: [
      { icon: '🌐', labelKey: 'nav.websiteBuilder', fallbackLabel: uiCopy('u_113726bc02323df0'), href: '/dashboard/builder' },
      { icon: '✨', labelKey: 'nav.improveContent', fallbackLabel: uiCopy('u_aa206397b58f72c0'), href: '/dashboard/improve' },
      { icon: '🚀', labelKey: 'nav.launchpad', fallbackLabel: uiCopy('u_41c427cfa6648a82'), href: '/dashboard/launchpad' },
      { icon: '🏢', labelKey: 'nav.buildBusiness', fallbackLabel: uiCopy('u_58dc29265123c0e1'), href: '/dashboard/launchpad/business' },
      { icon: '🛒', labelKey: 'nav.onlineStore', fallbackLabel: uiCopy('u_88b5023b1d6ccbde'), href: '/dashboard/launchpad/store' },
      { icon: '🎙️', labelKey: 'nav.podcastLaunchpad', fallbackLabel: uiCopy('u_a4c48ee816d49c1c'), href: '/dashboard/launchpad/podcast' },
      { icon: '🎚️', labelKey: 'nav.podcastStudio', fallbackLabel: uiCopy('u_2eff6e8b7221ae96'), href: '/dashboard/podcast/studio' },
      { icon: '🎬', labelKey: 'nav.videoStudio', fallbackLabel: uiCopy('u_4f402e1588cbfa21'), href: '/dashboard/video' },
      { icon: '🎧', labelKey: 'nav.audioStudio', fallbackLabel: uiCopy('u_9ca31c7e07b485c5'), href: '/dashboard/audio' },
      { icon: '🛠️', labelKey: 'nav.apprentice', fallbackLabel: uiCopy('u_adb17dcbfaf7108d'), href: '/dashboard/apprentice' },
      { icon: '🎨', labelKey: 'nav.creativeStudio', fallbackLabel: uiCopy('u_8692437eb360e142'), href: '/dashboard/creative' },
      { icon: '🎨', labelKey: 'nav.cosaCreative', fallbackLabel: uiCopy('u_7d0891c61f9b1ae0'), href: '/dashboard/cosa/creative' },
      { icon: '🆓', labelKey: 'nav.freeVideo', fallbackLabel: uiCopy('u_b00f69437492c88b'), href: '/dashboard/cosa/video/free' },
      { icon: '🎞️', labelKey: 'nav.motionVideo', fallbackLabel: uiCopy('u_45406b69a2d4b7ee'), href: '/dashboard/cosa/video/motion' },
      { icon: '🎙️', labelKey: 'nav.podcasters', fallbackLabel: uiCopy('u_d4a0229437e6d3cd'), href: '/podcasters' },
    ],
  },
  {
    id: 'security',
    labelKey: 'nav.security',
    fallbackLabel: uiCopy('u_0b9b247b1ead11b3'),
    items: [
      { icon: '🛡️', labelKey: 'nav.cybersecurity', fallbackLabel: uiCopy('u_701b1d08d831d045'), href: '/dashboard/cybersecurity' },
      { icon: '📋', labelKey: 'nav.auditConsole', fallbackLabel: uiCopy('u_268ad558d5aa3d8c'), href: '/dashboard/audit' },
      { icon: '🎛️', labelKey: 'nav.auditCockpit', fallbackLabel: uiCopy('u_ded936012731458b'), href: '/hub/audit' },
    ],
  },
  {
    id: 'help',
    labelKey: 'nav.help',
    fallbackLabel: uiCopy('u_0a9220d1225a7449'),
    items: [
      { icon: '❓', labelKey: 'nav.coreHelp', fallbackLabel: uiCopy('u_e109d0c0c821d704'), href: '/support' },
      { icon: '📖', labelKey: 'nav.documentation', fallbackLabel: uiCopy('u_81f0d902558e5ff8'), href: '/docs' },
      { icon: '❔', labelKey: 'nav.faq', fallbackLabel: uiCopy('u_175fdade64fb31e9'), href: '/faq' },
      { icon: '📝', labelKey: 'nav.requestPlan', fallbackLabel: uiCopy('u_f90535ab95bd7d68'), href: '/request-plan' },
      { icon: '↪', labelKey: 'nav.logOut', fallbackLabel: uiCopy('u_6add3a2cae40c355'), action: 'logout' },
    ],
  },
  {
    id: 'admin',
    labelKey: 'nav.admin',
    fallbackLabel: uiCopy('u_1be5b765450c80c4'),
    items: [
      { icon: '🤖', labelKey: 'nav.cosAssistant', fallbackLabel: uiCopy('u_039ab7623db6fea9'), href: '/dashboard/assistant', requiresOwner: true },
      { icon: '👑', labelKey: 'nav.ownerAdmin', fallbackLabel: uiCopy('u_6b2220fcb5f6bd39'), href: '/admin', requiresOwner: true },
      { icon: '🛑', labelKey: 'nav.supervisorSOC', fallbackLabel: uiCopy('u_724bb9a980f6fb51'), href: '/dashboard/supervisor', requiresOwner: true },
      { icon: '🎛️', labelKey: 'nav.consoleHub', fallbackLabel: uiCopy('u_0901fdf27b97a07f'), href: '/hub', requiresOwner: true },
      { icon: '🔐', labelKey: 'nav.vault', fallbackLabel: uiCopy('u_193c26e3bd1fbfc0'), href: '/vault', requiresOwner: true },
      { icon: '🧠', labelKey: 'nav.cosHub', fallbackLabel: uiCopy('u_f266515241e624a8'), href: '/hub/cos', requiresOwner: true },
      { icon: '🚀', labelKey: 'nav.onboardingAdmin', fallbackLabel: uiCopy('u_790d97e417789db1'), href: '/admin/onboarding', requiresOwner: true },
      { icon: '🛰️', labelKey: 'nav.supervisorHa', fallbackLabel: uiCopy('u_2b0fc72a2eaeffa3'), href: '/dashboard/supervisor/ha', requiresOwner: true },
      { icon: '✅', labelKey: 'nav.supervisorAcceptance', fallbackLabel: uiCopy('u_76c4147116e8af7f'), href: '/dashboard/supervisor/acceptance', requiresOwner: true },
      { icon: '🧩', labelKey: 'nav.providerHubStatus', fallbackLabel: uiCopy('u_d53671c280ba44af'), href: '/dashboard/provider-hub', requiresOwner: true },
      { icon: '📦', labelKey: 'nav.portableReadiness', fallbackLabel: uiCopy('u_146d43f4b3511f7b'), href: '/dashboard/portable-products/readiness', requiresOwner: true },
      { icon: '📊', labelKey: 'nav.adminOverview', fallbackLabel: uiCopy('u_68708b9be71b4558'), href: '/admin/overview', requiresOwner: true },
      { icon: '💰', labelKey: 'nav.adminRevenue', fallbackLabel: uiCopy('u_9d466ccf3c55fea5'), href: '/admin/revenue', requiresOwner: true },
      { icon: '⚙️', labelKey: 'nav.adminSettings', fallbackLabel: uiCopy('u_bfa9ef910a43bc42'), href: '/admin/settings', requiresOwner: true },
      { icon: '📨', labelKey: 'nav.hubEmailHealth', fallbackLabel: uiCopy('u_2edef47ce0cfb649'), href: '/hub/audit/email', requiresOwner: true },
      { icon: '▲', labelKey: 'nav.hubVercel', fallbackLabel: uiCopy('u_e1792fe3d5010149'), href: '/hub/vercel', requiresOwner: true },
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
  const [credits, setCredits] = useState<number | null>(null)
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
      { icon: '⌂', label: t('nav.home', uiCopy('u_37510590ca9959a8')), href: '/' },
      { icon: '💳', label: t('nav.pricing', uiCopy('u_5929927b200ce5aa')), href: '/pricing' },
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
        if (typeof data.credits === 'number') setCredits(data.credits)
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
        .sbnav-credits { display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(255,195,0,.55); border-radius: 999px; padding: 8px 12px; background: rgba(255,195,0,.10); color: #ffe08a; font-size: 13px; font-weight: 800; white-space: nowrap; }
        .sbnav-language { border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 8px 10px; background: #0f172a; color: #e2e8f0; font: inherit; font-size: 12px; }
        .sbnav-auth, .sbnav-burger { border: 0; border-radius: 999px; padding: 8px 13px; background: ${PURPLE}; color: #160b2b; font: inherit; font-weight: 800; cursor: pointer; white-space: nowrap; }
        .sbnav-burger { display: none; border-radius: 10px; color: #fff; background: transparent; border: 1px solid rgba(255,255,255,.2); }
        .sbnav-mobile { display: none; }
        @media (max-width: 1280px) { .sbnav-desktop, .sbnav-search, .sbnav-language, .sbnav-auth, .sbnav-credits { display: none; } .sbnav-burger { display: inline-flex; margin-left: auto; } .sbnav-mobile { display: grid; gap: 13px; max-height: calc(100vh - 62px); overflow-y: auto; padding: 14px 20px 20px; background: #070d1c; border-bottom: 1px solid rgba(167,139,250,.35); } .sbnav-mobile-group { display: grid; gap: 4px; } .sbnav-mobile-label { color: ${PURPLE}; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; } .sbnav-mobile-search { width: 100%; } .sbnav-mobile-search .sbnav-dropdown { position: static; margin-top: 8px; } }
      `}</style>
      <nav className="sbnav" ref={navRef}>
        <Link href="/" className="sbnav-brand"><span className="sbnav-brand-mark" aria-hidden>⌁</span><span>{uiCopy('u_1dcdffcc33a9519f')}</span></Link>
        <div className="sbnav-desktop">
          <Link href="/" className={`sbnav-trigger ${itemIsActive(pathname, '/') ? 'sbnav-trigger-active' : ''}`}>{t('nav.home', uiCopy('u_1118d8a6794760fe'))}</Link>
          <Link href="/pricing" className={`sbnav-trigger sbnav-pricing ${itemIsActive(pathname, '/pricing') ? 'sbnav-trigger-active' : ''}`}>{t('nav.pricing', uiCopy('u_7414fbff0b0fe576'))}</Link>
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
          <input type="search" value={query} placeholder={t('nav.searchPlaceholder', uiCopy('u_27de70abde1818df'))} aria-label={t('nav.searchLabel', uiCopy('u_50083d85ced6b9a0'))} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true) }} />
          {searchOpen ? <div className="sbnav-dropdown sbnav-search-results" role="listbox">{searchResults.length ? searchResults.map(item => <button key={item.href} type="button" className="sbnav-row" role="option" onClick={() => selectSearchResult(item.href!)}>{item.icon}<span>{item.label}</span></button>) : <span className="sbnav-row">{t('nav.noSearchResults', uiCopy('u_d48cbcae16a847cb'))}</span>}</div> : null}
        </div>
        {user ? <span className="sbnav-credits" aria-live="polite" title={t('nav.credits.label', uiCopy('u_bf049bc741dc77d9'))}>⚡ {ownerAccess ? t('nav.credits.unlimited', uiCopy('u_17bd13c3e66f30cb')) : (credits === null ? '…' : credits.toLocaleString())}</span> : null}
        <select className="sbnav-language" value={lang} aria-label={t('nav.languageLabel', uiCopy('u_fca7957f21786e9f'))} onChange={event => setLang(event.target.value)}>{LANGUAGES.map(code => <option key={code} value={code}>{t(`nav.languages.${code}`, code.toUpperCase())}</option>)}</select>
        {user ? null : <button type="button" className="sbnav-auth" onClick={() => setShowAuth(true)}>{t('nav.getStarted', uiCopy('u_3b6cf16b20654bfd'))}</button>}
        <button type="button" className="sbnav-burger" aria-label={t('nav.menu', uiCopy('u_1fb8ad5ad99b48f1'))} aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>{mobileOpen ? '✕' : '☰'}</button>
      </nav>
      {mobileOpen ? (
        <div className="sbnav-mobile">
          {user ? <div className="sbnav-mobile-row" aria-live="polite">⚡ <span>{ownerAccess ? t('nav.credits.unlimited', uiCopy('u_f9e7b106426b90d1')) : (credits === null ? '…' : credits.toLocaleString())} {t('nav.credits.label', uiCopy('u_e58e79ea3663c027'))}</span></div> : null}
          <div className="sbnav-search sbnav-mobile-search">
            <input type="search" value={query} placeholder={t('nav.searchPlaceholder', uiCopy('u_a1fb3df3e417f9b3'))} aria-label={t('nav.searchLabel', uiCopy('u_783b39417a33ce3c'))} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true) }} />
            {searchOpen ? <div className="sbnav-dropdown sbnav-search-results" role="listbox">{searchResults.length ? searchResults.map(item => <button key={item.href} type="button" className="sbnav-row" role="option" onClick={() => selectSearchResult(item.href!)}>{item.icon}<span>{item.label}</span></button>) : <span className="sbnav-row">{t('nav.noSearchResults', uiCopy('u_d9452179571172f2'))}</span>}</div> : null}
          </div>
          <Link href="/" onClick={() => setMobileOpen(false)} className="sbnav-mobile-row">⌂<span>{t('nav.home', uiCopy('u_9cd2140230bc0604'))}</span></Link>
          <Link href="/pricing" onClick={() => setMobileOpen(false)} className="sbnav-mobile-row">💳<span>{t('nav.pricing', uiCopy('u_cfbf6bcb1442be71'))}</span></Link>
          {groups.map(group => <div key={group.id} className="sbnav-mobile-group"><span className="sbnav-mobile-label">{t(group.labelKey, group.fallbackLabel)}</span>{group.items.map(item => renderItem(item, true))}</div>)}
          {user ? null : <button type="button" className="sbnav-auth" onClick={() => { setMobileOpen(false); setShowAuth(true) }}>{t('nav.getStarted', uiCopy('u_f2552ff6493f57f2'))}</button>}
        </div>
      ) : null}
      {showAuth ? <AuthModal onClose={() => setShowAuth(false)} /> : null}
    </>
  )
}
