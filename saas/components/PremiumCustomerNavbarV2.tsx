'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/utils/supabase/client'
import AuthModal from './AuthModal'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const GREEN = '#4ade80'
const RED = '#f87171'
const PINK = '#f472b6'

type Item = { icon: string; label: string; href: string; desc?: string; customerOnly?: boolean }
type Group = { id: string; label: string; eyebrow: string; accent: string; width?: number; align?: 'left' | 'right'; items: Item[] }

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
]

const PLAN_LABELS: Record<string, string> = {
  free: 'Free Demo',
  demo: 'Free Demo',
  starter: 'Launch',
  launch: 'Launch',
  pro: 'Growth',
  growth: 'Growth',
  business: 'Command',
  command: 'Command',
}

const PLAN_STYLES: Record<string, { bg: string; color: string }> = {
  free: { bg: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.72)' },
  demo: { bg: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.72)' },
  launch: { bg: 'rgba(59,130,246,.18)', color: '#7ab8ff' },
  starter: { bg: 'rgba(59,130,246,.18)', color: '#7ab8ff' },
  growth: { bg: 'rgba(255,195,0,.18)', color: GOLD },
  pro: { bg: 'rgba(255,195,0,.18)', color: GOLD },
  command: { bg: 'rgba(74,222,128,.18)', color: GREEN },
  business: { bg: 'rgba(74,222,128,.18)', color: GREEN },
}

function planLabel(plan: string) {
  const safe = String(plan || 'free').toLowerCase()
  return PLAN_LABELS[safe] || safe.charAt(0).toUpperCase() + safe.slice(1)
}

function planStyle(plan: string) {
  const safe = String(plan || 'free').toLowerCase()
  return PLAN_STYLES[safe] || PLAN_STYLES.free
}

const CUSTOMER_GROUPS: Group[] = [
  {
    id: 'console',
    label: 'Console Hub',
    eyebrow: 'Customer command',
    accent: GOLD,
    width: 360,
    items: [
      { icon: '🏠', label: 'Dashboard', href: '/dashboard', desc: 'Customer home base and next actions.' },
      { icon: '📋', label: 'Infrastructure Changes', href: '/dashboard/infrastructure', desc: 'Proposed infrastructure work and status.' },
    ],
  },
  {
    id: 'saas-station',
    label: 'SaaS Station',
    eyebrow: 'Daily office cockpit',
    accent: GREEN,
    width: 390,
    items: [
      { icon: '📅', label: 'Calendar', href: '/dashboard/calendar', desc: 'Schedule and sync daily office work.' },
      { icon: '📑', label: 'Spreadsheets', href: '/dashboard/spreadsheets', desc: 'Data, models, lists, and working tables.' },
      { icon: '⭐', label: 'Reviews', href: '/dashboard/reviews', desc: 'Reputation and customer review workflow.' },
      { icon: '🤖', label: 'Concierge', href: '/dashboard/assistant', customerOnly: true, desc: 'Normal customer concierge for product help and office tasks.' },
      { icon: '💬', label: 'Feedback', href: '/dashboard/feedback', desc: 'Requests, issues, and comments.' },
    ],
  },
  {
    id: 'marketing-sales',
    label: 'Marketing + Sales',
    eyebrow: 'Campaigns, outreach & video',
    accent: PINK,
    width: 520,
    items: [
      { icon: '📧', label: 'Email Outreach Command Center', href: '/dashboard/marketing/outreach', desc: 'Email contacts, messages, campaigns, and pipeline work.' },
      { icon: '📣', label: 'COSA Campaign Console', href: '/dashboard/cosa', desc: 'Create and manage governed marketing campaigns.' },
      { icon: '🎬', label: 'COSA Video Pipeline', href: '/dashboard/cosa/video-pipeline', desc: 'Final videos, render status, branding, and release readiness.' },
      { icon: '🗂️', label: 'Press & Print Media', href: '/dashboard/marketing/press-print', desc: 'Local review for newspaper, print, and magazine ad previews.' },
      { icon: '🧾', label: 'Press Outreach Studio', href: '/dashboard/marketing/press-outreach', desc: 'Owner approval and history for press dispatch.' },
      { icon: '📰', label: 'Online Newspaper Outreach', href: '/dashboard/marketing/outreach?channel=online-newspapers', desc: 'Digital newspaper and online publisher outreach.' },
      { icon: '🗞️', label: 'Print Newspaper Outreach', href: '/dashboard/marketing/outreach?channel=print-newspapers', desc: 'Offline newspaper and print placement planning.' },
      { icon: '🧠', label: 'Magazine / Trade Press Outreach', href: '/dashboard/marketing/outreach?channel=trade-press', desc: 'IT magazines, SaaS publications, cybersecurity magazines, and industry trade press.' },
      { icon: '📢', label: 'Promote', href: '/dashboard/promote', desc: 'Marketing and promotion actions.' },
    ],
  },
  {
    id: 'audit',
    label: 'Audit Cockpit',
    eyebrow: 'Readiness reports',
    accent: '#a78bfa',
    width: 400,
    items: [
      { icon: '📋', label: 'Audit Console', href: '/dashboard/audit', desc: 'Run readiness checks and audits.' },
      { icon: '🎛️', label: 'Audit Cockpit', href: '/hub/audit', desc: 'Reports, evidence, inventory, and roadmap.' },
      { icon: '🔑', label: 'Identity & Secrets', href: '/hub/audit/identity', desc: 'Identity, access, secrets, and keys.' },
      { icon: '🧾', label: 'Printable Reports', href: '/hub/audit', desc: 'Download PDF or print/save reports.' },
      { icon: '🧠', label: 'COS Decision Log', href: '/hub/cos', desc: 'COS reasoning decisions and outcomes.' },
    ],
  },
  {
    id: 'cyber',
    label: 'Cybersecurity',
    eyebrow: 'Monitoring & fixes',
    accent: CYAN,
    width: 400,
    items: [
      { icon: '🛡️', label: 'Cybersecurity Center', href: '/dashboard/cybersecurity', desc: 'Dependency scans, monitors, and alerts.' },
      { icon: '🚨', label: 'Alert Inbox', href: '/dashboard/cybersecurity', desc: 'Advisory alerts and monitor status.' },
      { icon: '🧭', label: 'Remediation Plans', href: '/dashboard/cybersecurity', desc: 'Plan-first human-guided fixes.' },
      { icon: '📄', label: 'Cyber PDF Reports', href: '/dashboard/cybersecurity', desc: 'Download or print issue reports.' },
    ],
  },
]

const PRODUCT_GROUPS: Group[] = [
  {
    id: 'website',
    label: 'Website',
    eyebrow: 'Build & improve',
    accent: '#38bdf8',
    width: 340,
    items: [
      { icon: '🌐', label: 'Build a Website', href: '/dashboard/builder', desc: 'Generate a professional site.' },
      { icon: '🧭', label: 'Optimize Website', href: '/dashboard/improve', desc: 'Analyze and improve a site.' },
      { icon: '✨', label: 'Improve Content', href: '/dashboard/improve', desc: 'Polish copy for SEO and conversion.' },
    ],
  },
  {
    id: 'studio',
    label: 'Studio',
    eyebrow: 'Podcast & content',
    accent: '#f472b6',
    width: 380,
    items: [
      { icon: '🎙️', label: 'Podcast Launchpad', href: '/dashboard/launchpad/podcast', desc: 'Start a podcast from scratch.' },
      { icon: '🎚️', label: 'Podcast Studio', href: '/dashboard/podcast/studio', desc: 'Optimize podcast feeds.' },
      { icon: '🎬', label: 'Video Studio', href: '/dashboard/video', desc: 'Create videos, clips, and captions.' },
      { icon: '🎧', label: 'Audio Studio', href: '/dashboard/audio', desc: 'Generate voice and audio content.' },
      { icon: '🎨', label: 'Creative Studio', href: '/dashboard/creative', desc: 'Visual assets and campaign graphics.' },
    ],
  },
  {
    id: 'launchpad',
    label: 'Launchpad',
    eyebrow: 'Guided starts',
    accent: '#fb923c',
    width: 360,
    items: [
      { icon: '🚀', label: 'Launchpad Home', href: '/dashboard/launchpad', desc: 'Choose a guided launch path.' },
      { icon: '🏢', label: 'Build a Business', href: '/dashboard/launchpad/business', desc: 'Launch a business from scratch.' },
      { icon: '🎬', label: 'Creator', href: '/dashboard/launchpad/creator', desc: 'Build a creator brand.' },
      { icon: '🛒', label: 'Online Store', href: '/dashboard/launchpad/store', desc: 'Launch a store workflow.' },
    ],
  },
]

const OWNER_GROUP: Group = {
  id: 'owner',
  label: 'Owner/Admin',
  eyebrow: 'Private COS & internal control',
  accent: RED,
  align: 'right',
  width: 430,
  items: [
    { icon: '🤖', label: 'COS Assistant', href: '/dashboard/assistant', desc: 'Private Chief of Staff assistant.' },
    { icon: '🎛️', label: 'Owner Hub', href: '/hub', desc: 'Internal provider and deployment controls.' },
    { icon: '🛰️', label: 'Mission Control', href: '/admin', desc: 'Executive admin cockpit.' },
    { icon: '🌌', label: 'Admin Overview', href: '/admin/overview', desc: 'Live counts and operating status.' },
    { icon: '💰', label: 'Revenue', href: '/admin/revenue', desc: 'MRR and subscription reporting.' },
    { icon: '🔌', label: 'Data Connectors', href: '/dashboard/data', desc: 'Connected data source controls.' },
    { icon: '⚡', label: 'Metrics & Credits', href: '/dashboard/metrics', desc: 'Usage, credits, and metrics.' },
    { icon: '👥', label: 'Team & Roles', href: '/dashboard/team', desc: 'Internal team access.' },
    { icon: '⚙️', label: 'Admin Settings', href: '/admin/settings', desc: 'System-wide settings.' },
  ],
}

const HELP_GROUP: Group = {
  id: 'help',
  label: 'Help',
  eyebrow: 'Support',
  accent: '#94a3b8',
  align: 'right',
  width: 250,
  items: [
    { icon: '❓', label: 'FAQ', href: '/faq' },
    { icon: '✉️', label: 'Contact Support', href: '/support' },
    { icon: '📖', label: 'Documentation', href: '/docs' },
  ],
}

function visibleCustomerGroups(ownerAccess: boolean) {
  return CUSTOMER_GROUPS.map((group) => (ownerAccess ? { ...group, items: group.items.filter((item) => !item.customerOnly) } : group))
}

function navPath(href: string) {
  return href.split('?')[0]
}

export default function PremiumCustomerNavbarV2() {
  const navRef = useRef<HTMLElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathname = usePathname()
  const { lang, setLang, dict } = useI18n()
  const [showAuth, setShowAuth] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [credits, setCredits] = useState(0)
  const [plan, setPlan] = useState('free')
  const [userName, setUserName] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  const ownerAccess = isAdmin || isOwner
  const currentPlanLabel = planLabel(plan)
  const currentPlanStyle = planStyle(plan)
  const displayName = userName || user?.email || ''
  const brandSubtitle = t(dict, 'nav.clientSuite', 'Client suite')
  const homeLabel = t(dict, 'nav.home', 'Home')
  const pricingLabel = t(dict, 'nav.pricing', 'Pricing')
  const menuLabel = t(dict, 'nav.menu', 'Menu')
  const groups = [...(user ? visibleCustomerGroups(ownerAccess) : []), ...PRODUCT_GROUPS, ...(ownerAccess ? [OWNER_GROUP] : []), HELP_GROUP]

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const currentUser = data?.user ?? null
      setUser(currentUser)
      if (currentUser) fetchCredits()
      else {
        setIsAdmin(false)
        setIsOwner(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) fetchCredits()
      else {
        setIsAdmin(false)
        setIsOwner(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchCredits() {
    try {
      const res = await fetch('/api/credits', { cache: 'no-store' })
      const data = await res.json()
      if (typeof data.credits === 'number') setCredits(data.credits)
      if (data.plan) setPlan(data.plan)
      if (data.name) setUserName(data.name)
      setIsAdmin(!!data.isAdmin)
      setIsOwner(!!data.isOwner)
    } catch {
      // Navbar stays usable without account metadata.
    }
  }

  useEffect(() => {
    setOpenMenu(null)
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpenMenu(null)
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  async function handleLogout() {
    sessionStorage.removeItem('greetingDismissed')
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function openNow(id: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
    setOpenMenu(id)
  }

  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpenMenu(null), 140)
  }

  const groupActive = (items: Item[]) =>
    items.some((item) => {
      const hrefPath = navPath(item.href)
      return hrefPath !== '/' && (pathname === hrefPath || pathname?.startsWith(`${hrefPath}/`))
    })

  const triggerStyle = (active: boolean, accent?: string): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    background: active ? 'rgba(255,255,255,.075)' : 'transparent',
    border: active ? `1px solid ${accent || 'rgba(255,255,255,.18)'}` : '1px solid transparent',
    borderRadius: 999,
    cursor: 'pointer',
    color: active ? '#fff' : 'rgba(226,232,240,.76)',
    fontWeight: active ? 800 : 650,
    fontSize: 13,
    fontFamily: 'inherit',
    padding: '8px 11px',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    boxShadow: active && accent ? `0 0 18px ${accent}22` : 'none',
  })

  const dropdownPosition = (align?: 'left' | 'right'): CSSProperties => (align === 'right' ? { right: 0 } : { left: 0 })

  function MenuGroup({ group }: { group: Group }) {
    const open = openMenu === group.id
    const active = open || groupActive(group.items)

    return (
      <div style={{ position: 'relative' }} onMouseEnter={() => openNow(group.id)} onMouseLeave={closeSoon}>
        <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpenMenu(open ? null : group.id)} style={triggerStyle(active, group.accent)}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: group.accent, boxShadow: `0 0 12px ${group.accent}`, opacity: active ? 1 : .72 }} />
          {group.label}
          <span style={{ fontSize: 10, opacity: .68, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>▾</span>
        </button>
        <div
          style={{
            position: 'absolute',
            top: '100%',
            ...dropdownPosition(group.align),
            paddingTop: 12,
            opacity: open ? 1 : 0,
            visibility: open ? 'visible' : 'hidden',
            transform: open ? 'translateY(0)' : 'translateY(8px)',
            pointerEvents: open ? 'auto' : 'none',
            transition: 'opacity .18s ease, transform .18s ease, visibility .18s',
            zIndex: 220,
          }}
          onMouseEnter={() => openNow(group.id)}
          onMouseLeave={closeSoon}
        >
          <div style={{ width: group.width || 360, maxWidth: '92vw', position: 'relative', overflow: 'hidden', borderRadius: 22, border: `1px solid ${group.accent}33`, background: 'linear-gradient(145deg, rgba(3,7,18,.98), rgba(15,23,42,.96))', boxShadow: `0 28px 90px rgba(0,0,0,.58), 0 0 45px ${group.accent}12`, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
            <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${group.accent}, ${CYAN})` }} />
            <div style={{ padding: '15px 15px 8px' }}>
              <div style={{ color: group.accent, fontSize: 10, fontWeight: 900, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 8 }}>{group.eyebrow}</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {group.items.map((item) => (
                  <Link key={`${group.id}:${item.href}:${item.label}`} href={item.href} onClick={() => setOpenMenu(null)} className="sbnav-row" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, textDecoration: 'none' }}>
                    <span style={{ fontSize: 19, flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', color: '#fff', fontWeight: 800, fontSize: 13 }}>{item.label}</span>
                      {item.desc ? <span style={{ display: 'block', color: 'rgba(148,163,184,.88)', fontSize: 11, marginTop: 2, lineHeight: 1.35 }}>{item.desc}</span> : null}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`.sbnav-desktop{display:flex;align-items:center;gap:6px}.sbnav-right{display:flex;align-items:center;gap:8px;flex-shrink:0}.sbnav-burger{display:none}.sbnav-mobile-auth{display:none}.sbnav-row{border-radius:14px;transition:background .15s ease,transform .15s ease}.sbnav-row:hover{background:rgba(255,255,255,.065);transform:translateX(2px)}@media(max-width:1260px){.sbnav-desktop,.sbnav-right{display:none!important}.sbnav-burger{display:inline-flex!important}.sbnav-mobile-auth{display:inline-flex!important}}`}</style>
      <nav ref={navRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 22px', background: 'linear-gradient(135deg, rgba(4,8,18,.92), rgba(15,23,42,.76))', borderBottom: '1px solid rgba(26,240,255,.18)', boxShadow: '0 18px 60px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.08)', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0, marginRight: 8 }}>
          <span style={{ width: 34, height: 34, borderRadius: 99, border: `1px solid ${GOLD}55`, display: 'grid', placeItems: 'center', color: GOLD, boxShadow: `0 0 24px ${GOLD}22` }}>⌁</span>
          <span style={{ display: 'grid', lineHeight: 1.05 }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 17 }}>signal<span style={{ color: GOLD }}>boost</span></span>
            <span style={{ color: 'rgba(148,163,184,.72)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase' }}>{brandSubtitle}</span>
          </span>
        </Link>

        <div className="sbnav-desktop">
          <Link href="/" style={triggerStyle(pathname === '/', GOLD)}>{homeLabel}</Link>
          {groups.map((group) => <MenuGroup key={group.id} group={group} />)}
          <Link href="/pricing" style={triggerStyle(pathname === '/pricing', GOLD)}>{pricingLabel}</Link>
        </div>

        <div className="sbnav-right">
          <select value={String(lang || 'en')} onChange={(event) => setLang(event.target.value)} style={{ background: 'rgba(15,23,42,.82)', color: 'rgba(226,232,240,.78)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>
            {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
          </select>
          {user ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span title={`Available video credits: ${credits.toLocaleString()}`} style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,195,0,.95)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>⚡{credits >= 100000 ? `${Math.floor(credits / 1000)}K` : credits.toLocaleString()}</span>
              <span title={`Current plan: ${currentPlanLabel}`} style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', padding: '3px 10px', borderRadius: 999, background: currentPlanStyle.bg, color: currentPlanStyle.color, fontFamily: 'monospace' }}>{currentPlanLabel}</span>
              {displayName ? <span title={displayName} style={{ fontSize: 12, fontWeight: 650, color: 'rgba(226,232,240,.70)', maxWidth: 135, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span> : null}
            </span>
          ) : null}
          {user ? (
            <button onClick={handleLogout} style={{ background: 'transparent', color: 'rgba(148,163,184,.78)', border: '1px solid rgba(255,255,255,.13)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}>{t(dict, 'logout', 'Log out')}</button>
          ) : (
            <button onClick={() => setShowAuth(true)} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 999, padding: '9px 22px', fontWeight: 900, cursor: 'pointer' }}>{t(dict, 'getStarted', 'Get started')}</button>
          )}
        </div>

        <span className="sbnav-mobile-auth" style={{ alignItems: 'center', gap: 8 }}>
          {user ? (
            <>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,195,0,.95)', fontFamily: 'monospace' }}>⚡ {credits}</span>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', padding: '3px 10px', borderRadius: 999, background: currentPlanStyle.bg, color: currentPlanStyle.color, fontFamily: 'monospace' }}>{currentPlanLabel}</span>
            </>
          ) : (
            <button onClick={() => setShowAuth(true)} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 999, padding: '8px 16px', fontWeight: 900, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t(dict, 'getStarted', 'Get started')}</button>
          )}
        </span>
        <button className="sbnav-burger" aria-label={menuLabel} onClick={() => setMobileOpen((open) => !open)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.16)', borderRadius: 12, color: '#fff', padding: '8px 12px', cursor: 'pointer', fontSize: 18 }}>{mobileOpen ? '✕' : '☰'}</button>
      </nav>

      {mobileOpen ? (
        <div style={{ position: 'sticky', top: 65, zIndex: 99, background: 'rgba(4,8,18,.98)', borderBottom: '1px solid rgba(255,255,255,.14)', padding: 16, maxHeight: '80vh', overflowY: 'auto', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,195,0,.95)', fontFamily: 'monospace' }}>⚡ {credits}</span>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', padding: '3px 10px', borderRadius: 999, background: currentPlanStyle.bg, color: currentPlanStyle.color, fontFamily: 'monospace' }}>{currentPlanLabel}</span>
              {displayName ? <span style={{ fontSize: 12, fontWeight: 650, color: 'rgba(226,232,240,.72)' }}>{displayName}</span> : null}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,.10)' }}>
            <select value={String(lang || 'en')} onChange={(event) => setLang(event.target.value)} style={{ background: 'rgba(15,23,42,.82)', color: 'rgba(226,232,240,.78)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '8px 12px', fontSize: 12 }}>
              {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
            </select>
            {user ? (
              <button onClick={handleLogout} style={{ background: 'transparent', color: 'rgba(148,163,184,.78)', border: '1px solid rgba(255,255,255,.13)', borderRadius: 999, padding: '9px 16px', cursor: 'pointer' }}>{t(dict, 'logout', 'Log out')}</button>
            ) : (
              <button onClick={() => { setMobileOpen(false); setShowAuth(true) }} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 999, padding: '9px 22px', fontWeight: 900, cursor: 'pointer' }}>{t(dict, 'getStarted', 'Get started')}</button>
            )}
          </div>

          <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
            <Link href="/" style={{ padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 800, fontSize: 14 }}>🏠 {homeLabel}</Link>
            <Link href="/pricing" style={{ padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 800, fontSize: 14 }}>💳 {pricingLabel}</Link>
          </div>

          {groups.map((group) => (
            <div key={group.id} style={{ display: 'grid', gap: 4, marginBottom: 15 }}>
              <span style={{ color: group.accent, fontSize: 11, fontWeight: 900, letterSpacing: '.10em', textTransform: 'uppercase' }}>{group.label}</span>
              {group.items.map((item) => (
                <Link key={`${group.id}:${item.href}:${item.label}`} href={item.href} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 650, fontSize: 14, borderRadius: 12, background: 'rgba(255,255,255,.03)' }}>
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {showAuth ? <AuthModal onClose={() => setShowAuth(false)} /> : null}
    </>
  )
}
