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

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
]

type Item = {
  icon: string
  label: string
  href: string
  desc?: string
}

const WEBSITE: Item[] = [
  { icon: '🌐', label: 'Build a Website', href: '/dashboard/builder', desc: 'Generate a full site from a prompt.' },
  { icon: '🧭', label: 'Optimize Website', href: '/dashboard/improve', desc: 'Analyze, optimize, and rebuild an improved site.' },
  { icon: '⭐', label: 'Reviews', href: '/dashboard/reviews', desc: 'Collect and showcase customer reviews.' },
  { icon: '✨', label: 'Improve Content', href: '/dashboard/improve', desc: 'Polish pages for SEO and conversion.' },
]

const PODCAST: Item[] = [
  { icon: '🎙️', label: 'Build a Podcast', href: '/dashboard/launchpad/podcast', desc: 'Start a podcast from scratch.' },
  { icon: '🎚️', label: 'Optimize Podcast Studio', href: '/dashboard/podcast/studio', desc: 'Audit your feed for Apple, Spotify, and growth.' },
  { icon: '📻', label: 'Podcast Hub', href: '/dashboard/podcast', desc: 'Your podcast page and tools.' },
]

const CONTENT: Item[] = [
  { icon: '🎧', label: 'Audio Studio', href: '/dashboard/audio', desc: 'Native voice and audio content.' },
  { icon: '🎬', label: 'Video Studio', href: '/dashboard/video', desc: 'Generate videos, clips, captions, and exports.' },
  { icon: '🎨', label: 'Creative Studio', href: '/dashboard/creative', desc: 'Generate promo banners and campaign visuals with AI.' },
  { icon: '🧪', label: 'Lab', href: '/dashboard/lab', desc: 'Experimental tools and features.' },
  { icon: '🛠️', label: 'Workshop Apprentice', href: '/dashboard/apprentice', desc: 'Guided, level-aware help.' },
]

const LAUNCHPAD: Item[] = [
  { icon: '🚀', label: 'Launchpad Home', href: '/dashboard/launchpad', desc: 'Choose a guided launch path.' },
  { icon: '🏢', label: 'Build a Business', href: '/dashboard/launchpad/business', desc: 'Launch a business from scratch.' },
  { icon: '🎬', label: 'Creator', href: '/dashboard/launchpad/creator', desc: 'Build your creator brand.' },
  { icon: '🛒', label: 'Online Store', href: '/dashboard/launchpad/store', desc: 'Launch a store from scratch.' },
  { icon: '🎙️', label: 'Podcast', href: '/dashboard/launchpad/podcast', desc: 'Start a podcast from scratch.' },
]

const GROW: Item[] = [
  { icon: '📡', label: 'Outreach Hub', href: '/dashboard/outreach', desc: 'Your outreach command center.' },
  { icon: '🔎', label: 'Discovery', href: '/dashboard/outreach/discovery', desc: 'Find and analyze new leads.' },
  { icon: '📇', label: 'Contacts', href: '/dashboard/outreach/contacts', desc: 'Review and approve leads.' },
  { icon: '📊', label: 'Pipeline', href: '/dashboard/outreach/pipeline', desc: 'Track prospects by stage.' },
  { icon: '📣', label: 'Campaigns', href: '/dashboard/campaigns', desc: 'Plan campaigns, A/B tests, and funnel tracking.' },
  { icon: '📢', label: 'Promote', href: '/dashboard/promote', desc: 'Run promotion campaigns.' },
  { icon: '💼', label: 'Sales', href: '/dashboard/sales', desc: 'Sales overview.' },
  { icon: '📈', label: 'Sales Pipeline', href: '/dashboard/sales/pipeline', desc: 'Deals in progress.' },
]

const WORKSPACE: Item[] = [
  { icon: '🏠', label: 'Dashboard', href: '/dashboard', desc: 'Your home base.' },
  { icon: '🤖', label: 'Assistant', href: '/dashboard/assistant', desc: 'Ask the concierge anything.' },
  { icon: '📅', label: 'Calendar', href: '/dashboard/calendar', desc: 'Events and cultural dates.' },
  { icon: '📑', label: 'Spreadsheets', href: '/dashboard/spreadsheets', desc: 'Your imported data, in a grid.' },
  { icon: '💬', label: 'Feedback', href: '/dashboard/feedback', desc: 'Send us your feedback.' },
]

const ADMIN: Item[] = [
  { icon: '🌌', label: 'Overview', href: '/admin/overview', desc: 'Real counts from live data.' },
  { icon: '💰', label: 'Revenue', href: '/admin/revenue', desc: 'Live MRR from active subscriptions.' },
  { icon: '🔌', label: 'Data Connectors', href: '/dashboard/data', desc: 'Import and manage connected data sources.' },
  { icon: '⚡', label: 'Metrics & Credits', href: '/dashboard/metrics', desc: 'Usage, credits, and operating metrics.' },
  { icon: '🎛️', label: 'Console', href: '/dashboard/wireframes', desc: 'Office utilities and internal console.' },
  { icon: '👥', label: 'Team & Roles', href: '/dashboard/team', desc: 'Add people and set access.' },
  { icon: '🛡️', label: 'Role Management', href: '/admin/settings/roles', desc: 'Manage roles and ownership.' },
  { icon: '🚪', label: 'Onboarding', href: '/admin/onboarding', desc: 'Onboarding controls.' },
  { icon: '⚙️', label: 'Admin Settings', href: '/admin/settings', desc: 'System-wide switches.' },
  { icon: '🧰', label: 'Settings', href: '/dashboard/settings', desc: 'Operational settings and account preferences.' },
]

const HELP: Item[] = [
  { icon: '❓', label: 'FAQ', href: '/faq' },
  { icon: '✉️', label: 'Contact Support', href: '/support' },
  { icon: '📖', label: 'Documentation', href: '/docs' },
]

const PUBLIC_PLAN_LABELS: Record<string, string> = {
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
  free: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.72)' },
  demo: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.72)' },

  starter: { bg: 'rgba(59,130,246,0.18)', color: '#7ab8ff' },
  launch: { bg: 'rgba(59,130,246,0.18)', color: '#7ab8ff' },

  pro: { bg: 'rgba(255,195,0,0.18)', color: '#ffc300' },
  growth: { bg: 'rgba(255,195,0,0.18)', color: '#ffc300' },

  business: { bg: 'rgba(74,222,128,0.18)', color: '#4ade80' },
  command: { bg: 'rgba(74,222,128,0.18)', color: '#4ade80' },
}

function publicPlanLabel(plan: string) {
  const safe = String(plan || 'free').toLowerCase()
  return PUBLIC_PLAN_LABELS[safe] || safe.charAt(0).toUpperCase() + safe.slice(1)
}

function publicPlanStyle(plan: string) {
  const safe = String(plan || 'free').toLowerCase()
  return PLAN_STYLES[safe] || PLAN_STYLES.free
}

export default function Navbar() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pathname = usePathname()
  const { lang, setLang, dict } = useI18n()

  const [showAuth, setShowAuth] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [credits, setCredits] = useState<number>(0)
  const [plan, setPlan] = useState<string>('free')
  const [userName, setUserName] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const currentUser = data?.user ?? null
      setUser(currentUser)

      if (currentUser) {
        fetchCredits()
      } else {
        setIsAdmin(false)
        setIsOwner(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser) {
        fetchCredits()
      } else {
        setIsAdmin(false)
        setIsOwner(false)
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
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
      // Navbar should not break the app if credits fail.
    }
  }

  useEffect(() => {
    setOpenMenu(null)
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = 40
    const height = 40
    const centerX = width / 2
    const centerY = height - 8

    canvas.width = width
    canvas.height = height

    let rings: { r: number; alpha: number }[] = []
    let last = 0
    let raf = 0

    function draw(timestamp: number) {
      ctx.clearRect(0, 0, width, height)

      if (!last || timestamp - last > 2000) {
        rings.push({ r: 0, alpha: 1 })
        last = timestamp
      }

      rings = rings.filter((ring) => ring.alpha > 0.01)

      for (const ring of rings) {
        ring.r += 0.8
        ring.alpha -= 0.012

        ctx.globalAlpha = Math.max(0, ring.alpha)
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(centerX, centerY, ring.r, Math.PI, 0)
        ctx.stroke()
      }

      ctx.globalAlpha = 1
      ctx.fillStyle = GOLD
      ctx.beginPath()
      ctx.arc(centerX, centerY, 3, 0, Math.PI * 2)
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
    }
  }, [])

  async function handleLogout() {
    sessionStorage.removeItem('greetingDismissed')
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function openNow(id: string) {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }

    setOpenMenu(id)
  }

  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current)

    closeTimer.current = setTimeout(() => {
      setOpenMenu(null)
    }, 140)
  }

  const workspaceItems = WORKSPACE

  const groupActive = (items: Item[]) =>
    items.some((item) => item.href !== '/' && (pathname === item.href || pathname?.startsWith(`${item.href}/`)))

  const trigger = (active: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontWeight: active ? 700 : 600,
    fontSize: 14,
    fontFamily: 'inherit',
    padding: '8px 4px',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
  })

  const panelWrap = (open: boolean, align: 'left' | 'right'): CSSProperties => ({
    position: 'absolute',
    top: '100%',
    [align]: 0,
    paddingTop: 12,
    opacity: open ? 1 : 0,
    transform: open ? 'translateY(0)' : 'translateY(8px)',
    visibility: open ? 'visible' : 'hidden',
    pointerEvents: open ? 'auto' : 'none',
    transition: 'opacity .18s ease, transform .18s ease, visibility .18s',
    zIndex: 200,
  })

  const panelCard: CSSProperties = {
    position: 'relative',
    background: 'linear-gradient(135deg, rgba(20,24,36,.98), rgba(15,23,42,.98))',
    border: '1px solid var(--border-medium)',
    borderRadius: 18,
    boxShadow: '0 30px 80px rgba(0,0,0,.55)',
    overflow: 'hidden',
    backdropFilter: 'blur(14px)',
  }

  const accentLine: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    background: `linear-gradient(90deg, ${GOLD}, ${CYAN})`,
  }

  const planStyle = publicPlanStyle(plan)
  const planLabel = publicPlanLabel(plan)
  const displayName = userName || user?.email || ''

  function Group({
    id,
    label,
    items,
    align = 'left',
    cols = 1,
    width = 320,
  }: {
    id: string
    label: string
    items: Item[]
    align?: 'left' | 'right'
    cols?: number
    width?: number
  }) {
    const open = openMenu === id

    return (
      <div style={{ position: 'relative' }} onMouseEnter={() => openNow(id)} onMouseLeave={closeSoon}>
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpenMenu(open ? null : id)}
          style={trigger(open || groupActive(items))}
        >
          {label}
          <span
            style={{
              fontSize: 10,
              opacity: 0.7,
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform .18s',
            }}
          >
            ▾
          </span>
        </button>

        <div style={panelWrap(open, align)} onMouseEnter={() => openNow(id)} onMouseLeave={closeSoon}>
          <div style={panelCard}>
            <span style={accentLine} aria-hidden="true" />

            <div
              style={{
                padding: 12,
                width,
                maxWidth: '92vw',
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: 2,
              }}
            >
              {items.map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={() => setOpenMenu(null)}
                  className="sbnav-row"
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    padding: 12,
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', color: '#fff', fontWeight: 700, fontSize: 13 }}>
                      {item.label}
                    </span>
                    {item.desc ? (
                      <span
                        style={{
                          display: 'block',
                          color: 'var(--text-muted)',
                          fontSize: 11,
                          marginTop: 1,
                          lineHeight: 1.35,
                        }}
                      >
                        {item.desc}
                      </span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        .sbnav-desktop { display: flex; align-items: center; gap: 18px; }
        .sbnav-right { display: flex; align-items: center; gap: 10px; }
        .sbnav-burger { display: none; }
        .sbnav-row { transition: background .15s ease; border-radius: 12px; }
        .sbnav-row:hover { background: var(--surface-1-hover); }
        @media (max-width: 1200px) {
          .sbnav-desktop, .sbnav-right { display: none !important; }
          .sbnav-burger { display: inline-flex !important; }
        }
      `}</style>

      <nav
        ref={navRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: 'linear-gradient(135deg, rgba(8,10,20,.86), rgba(15,23,42,.62))',
          borderBottom: '1px solid rgba(26,240,255,.16)',
          boxShadow: '0 18px 60px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.08)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(12px)',
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <canvas ref={canvasRef} style={{ width: 40, height: 40 }} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>
            signal<span style={{ color: GOLD }}>boost</span>
          </span>
        </Link>

        <div className="sbnav-desktop">
          <Link href="/" style={{ ...trigger(pathname === '/'), display: 'inline-flex' }}>
            Home
          </Link>

          <Group id="website" label="Website" items={WEBSITE} width={340} />
          <Group id="podcast" label="Podcast" items={PODCAST} width={340} />
          <Group id="content" label="Content" items={CONTENT} width={340} />
          <Group id="launchpad" label="Launchpad" items={LAUNCHPAD} width={340} />
          <Group id="grow" label="Grow" items={GROW} width={340} />
          <Group id="workspace" label="Workspace" items={workspaceItems} width={340} />

          {isAdmin ? <Group id="admin" label="Admin" items={ADMIN} width={360} /> : null}

          <Link href="/pricing" style={{ ...trigger(pathname === '/pricing'), display: 'inline-flex' }}>
            Pricing
          </Link>

          <Group id="help" label="Help" items={HELP} align="right" width={240} />
        </div>

        <div className="sbnav-right">
          <select
            value={lang}
            onChange={(event) => setLang(event.target.value)}
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-medium)',
              borderRadius: 999,
              padding: '8px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>

          {user ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                title="Available video credits"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'rgba(255,195,0,0.95)',
                  fontFamily: 'monospace',
                }}
              >
                ⚡ {credits}
              </span>

              <span
                title={`Current plan: ${planLabel}`}
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: planStyle.bg,
                  color: planStyle.color,
                  fontFamily: 'monospace',
                }}
              >
                {planLabel}
              </span>

              {displayName ? (
                <span
                  title={displayName}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    maxWidth: 130,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {displayName}
                </span>
              ) : null}
            </span>
          ) : null}

          {user ? (
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-soft)',
                borderRadius: 999,
                padding: '8px 14px',
                cursor: 'pointer',
              }}
            >
              {t(dict, 'logout', 'Log out')}
            </button>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              style={{
                background: GOLD,
                color: '#000',
                border: 'none',
                borderRadius: 999,
                padding: '9px 22px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {t(dict, 'getStarted', 'Get started')}
            </button>
          )}
        </div>

        <button
          className="sbnav-burger"
          aria-label="Menu"
          onClick={() => setMobileOpen((open) => !open)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-soft)',
            borderRadius: 10,
            color: '#fff',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: 18,
          }}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </nav>

      {mobileOpen ? (
        <div
          style={{
            position: 'sticky',
            top: 65,
            zIndex: 99,
            background: 'rgba(8,10,20,.98)',
            borderBottom: '1px solid var(--border-medium)',
            padding: 16,
            maxHeight: '80vh',
            overflowY: 'auto',
            backdropFilter: 'blur(12px)',
          }}
        >
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'rgba(255,195,0,0.95)',
                  fontFamily: 'monospace',
                }}
              >
                ⚡ {credits}
              </span>

              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: planStyle.bg,
                  color: planStyle.color,
                  fontFamily: 'monospace',
                }}
              >
                {planLabel}
              </span>

              {displayName ? (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {displayName}
                </span>
              ) : null}
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
            <Link href="/" style={{ padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 700, fontSize: 14 }}>
              🏠 Home
            </Link>
          </div>

          {[
            { title: 'Website', items: WEBSITE },
            { title: 'Podcast', items: PODCAST },
            { title: 'Content', items: CONTENT },
            { title: 'Launchpad', items: LAUNCHPAD },
            { title: 'Grow', items: GROW },
            { title: 'Workspace', items: workspaceItems },
            ...(isAdmin ? [{ title: 'Admin', items: ADMIN }] : []),
          ].map((section) => (
            <div key={section.title} style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
              <span
                style={{
                  color: 'var(--text-faint)',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                }}
              >
                {section.title}
              </span>

              {section.items.map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    padding: 10,
                    textDecoration: 'none',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}

          <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
            <span
              style={{
                color: 'var(--text-faint)',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
              }}
            >
              More
            </span>

            <Link href="/pricing" style={{ padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}>
              Pricing
            </Link>

            {HELP.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: 10,
                  textDecoration: 'none',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value)}
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 999,
                padding: '8px 12px',
                fontSize: 12,
              }}
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>

            {user ? (
              <button
                onClick={handleLogout}
                style={{
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 999,
                  padding: '9px 16px',
                  cursor: 'pointer',
                }}
              >
                {t(dict, 'logout', 'Log out')}
              </button>
            ) : (
              <button
                onClick={() => {
                  setMobileOpen(false)
                  setShowAuth(true)
                }}
                style={{
                  background: GOLD,
                  color: '#000',
                  border: 'none',
                  borderRadius: 999,
                  padding: '9px 22px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {t(dict, 'getStarted', 'Get started')}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {showAuth ? <AuthModal onClose={() => setShowAuth(false)} /> : null}
    </>
  )
}
