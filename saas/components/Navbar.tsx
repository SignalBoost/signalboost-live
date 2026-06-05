'use client'

// saas/components/Navbar.tsx
// Unified single-bar navigation, domain-grouped. Role/access comes from /api/credits (single source of truth).

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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

const PLAN_STYLES: Record<string, { bg: string; color: string }> = {
  free:     { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' },
  starter:  { bg: 'rgba(59,130,246,0.18)',  color: '#7ab8ff' },
  pro:      { bg: 'rgba(255,195,0,0.18)',   color: '#ffc300' },
  business: { bg: 'rgba(74,222,128,0.18)',  color: '#4ade80' },
}

type Item = { icon: string; label: string; href: string; desc?: string }

const WEBSITE: Item[] = [
  { icon: '🌐', label: 'Build a Website', href: '/dashboard/builder', desc: 'Generate a full site from a prompt.' },
  { icon: '🧭', label: 'Optimize Website', href: '/dashboard/improve', desc: 'Analyze → optimize → rebuild an improved site.' },
  { icon: '⭐', label: 'Reviews', href: '/dashboard/reviews', desc: 'Collect and showcase customer reviews.' },
  { icon: '✨', label: 'Improve Content', href: '/dashboard/improve', desc: 'Polish pages for SEO and conversion.' },
]

const PODCAST: Item[] = [
  { icon: '🎙️', label: 'Build a Podcast', href: '/dashboard/launchpad/podcast', desc: 'Start a podcast from scratch.' },
  { icon: '🎚️', label: 'Optimize Podcast Studio', href: '/dashboard/podcast/studio', desc: 'Audit your feed for Apple/Spotify & growth.' },
  { icon: '📻', label: 'Podcast Hub', href: '/dashboard/podcast', desc: 'Your podcast page and tools.' },
]

const CONTENT: Item[] = [
  { icon: '🎧', label: 'Audio Studio', href: '/dashboard/audio', desc: 'Native voice and audio content.' },
  { icon: '🎬', label: 'Video Studio', href: '/dashboard/video', desc: 'Generate videos, clips, and captions.' },
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
  { icon: '🔌', label: 'Data Connectors', href: '/dashboard/data', desc: 'Import data from sources.' },
  { icon: '⚡', label: 'Metrics & Credits', href: '/dashboard/metrics', desc: 'Usage and credit control.' },
  { icon: '🎛️', label: 'Console', href: '/dashboard/wireframes', desc: 'Office utilities console.' },
  { icon: '💬', label: 'Feedback', href: '/dashboard/feedback', desc: 'Send us your feedback.' },
  { icon: '⚙️', label: 'Settings', href: '/dashboard/settings', desc: 'Account and preferences.' },
]

const ADMIN: Item[] = [
  { icon: '🛡️', label: 'Admin Home', href: '/admin' },
  { icon: '🖥️', label: 'System', href: '/admin/system' },
  { icon: '🧠', label: 'AI', href: '/admin/ai' },
  { icon: '💼', label: 'Sales', href: '/admin/sales' },
  { icon: '💰', label: 'Revenue', href: '/admin/revenue' },
  { icon: '☁️', label: 'SaaS', href: '/admin/saas' },
  { icon: '🤝', label: 'Partners', href: '/admin/partners' },
  { icon: '🚪', label: 'Onboarding', href: '/admin/onboarding' },
  { icon: '✉️', label: 'Email', href: '/admin/email' },
  { icon: '📶', label: 'SignalBoost', href: '/admin/signalboost' },
  { icon: '⚙️', label: 'Settings', href: '/admin/settings' },
  { icon: '👥', label: 'Roles', href: '/admin/settings/roles' },
  { icon: '🗂️', label: 'Console', href: '/admin/adm' },
]

const HELP: Item[] = [
  { icon: '❓', label: 'FAQ', href: '/faq' },
  { icon: '✉️', label: 'Contact Support', href: '/support' },
  { icon: '📖', label: 'Documentation', href: '/docs' },
]

export default function Navbar() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathname  = usePathname()
  const { lang, setLang, dict } = useI18n()

  const [showAuth, setShowAuth]   = useState(false)
  const [user, setUser]           = useState<any>(null)
  const [credits, setCredits]     = useState<number>(0)
  const [plan, setPlan]           = useState<string>('free')
  const [userName, setUserName]   = useState<string | null>(null)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [isOwner, setIsOwner]     = useState(false)
  const [openMenu, setOpenMenu]   = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user ?? null
      setUser(u)
      if (u) { fetchCredits() } else { setIsAdmin(false); setIsOwner(false) }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) { fetchCredits() } else { setIsAdmin(false); setIsOwner(false) }
    })
    return () => { listener.subscription.unsubscribe() }
  }, [])

  async function fetchCredits() {
    try {
      const res  = await fetch('/api/credits', { cache: 'no-store' })
      const data = await res.json()
      if (typeof data.credits === 'number') setCredits(data.credits)
      if (data.plan)  setPlan(data.plan)
      if (data.name)  setUserName(data.name)
      setIsAdmin(!!data.isAdmin)
      setIsOwner(!!data.isOwner)
    } catch { /* silent */ }
  }

  // Close any open menu on route change
  useEffect(() => { setOpenMenu(null); setMobileOpen(false) }, [pathname])

  // Close the dropdown when clicking outside the navbar, or pressing Escape
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Hover helpers with a small close delay so moving button→panel doesn't flicker shut
  function openNow(id: string) {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    setOpenMenu(id)
  }
  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpenMenu(null), 140)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = 40, H = 40
    canvas.width = W; canvas.height = H
    const cx = W / 2, cy = H - 8
    let rings: { r: number; alpha: number }[] = []
    let last = 0, raf: number
    function draw(ts: number) {
      ctx.clearRect(0, 0, W, H)
      if (!last || ts - last > 2000) { rings.push({ r: 0, alpha: 1 }); last = ts }
      rings = rings.filter(r => r.alpha > 0.01)
      for (const r of rings) {
        r.r += 0.8; r.alpha -= 0.012
        ctx.globalAlpha = Math.max(0, r.alpha)
        ctx.strokeStyle = GOLD; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(cx, cy, r.r, Math.PI, 0); ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = GOLD
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  async function handleLogout() {
    sessionStorage.removeItem('greetingDismissed')
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const planStyle = PLAN_STYLES[plan] || PLAN_STYLES.free
  const planLabel = t(dict, `plan.${plan}`, plan.charAt(0).toUpperCase() + plan.slice(1))
  const displayName = userName || user?.email || ''

  const groupActive = (items: Item[]) =>
    items.some(i => i.href !== '/' && (pathname === i.href || pathname?.startsWith(i.href + '/')))

  const trigger = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontWeight: active ? 700 : 600, fontSize: 14, fontFamily: 'inherit',
    padding: '8px 4px', whiteSpace: 'nowrap',
  })

  const panelWrap = (open: boolean, align: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '100%', [align]: 0, paddingTop: 12,
    opacity: open ? 1 : 0,
    transform: open ? 'translateY(0)' : 'translateY(8px)',
    visibility: open ? 'visible' : 'hidden',
    pointerEvents: open ? 'auto' : 'none',
    transition: 'opacity .18s ease, transform .18s ease, visibility .18s',
    zIndex: 200,
  })

  const panelCard: React.CSSProperties = {
    position: 'relative',
    background: 'linear-gradient(135deg, rgba(20,24,36,.98), rgba(15,23,42,.98))',
    border: '1px solid var(--border-medium)',
    borderRadius: 18,
    boxShadow: '0 30px 80px rgba(0,0,0,.55)',
    overflow: 'hidden',
    backdropFilter: 'blur(14px)',
  }

  const accentLine: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
    background: `linear-gradient(90deg, ${GOLD}, ${CYAN})`,
  }

  function Group({ id, label, items, align = 'left', cols = 1, width = 300 }: { id: string; label: string; items: Item[]; align?: 'left' | 'right'; cols?: number; width?: number }) {
    const open = openMenu === id
    return (
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => openNow(id)}
        onMouseLeave={closeSoon}
      >
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpenMenu(open ? null : id)}
          style={trigger(open || groupActive(items))}
        >
          {label}
          <span style={{ fontSize: 10, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>▾</span>
        </button>
        <div style={panelWrap(open, align)} onMouseEnter={() => openNow(id)} onMouseLeave={closeSoon}>
          <div style={panelCard}>
            <span style={accentLine} aria-hidden="true" />
            <div style={{ padding: 12, width, maxWidth: '92vw', display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2 }}>
              {items.map(item => (
                <Link key={item.href + item.label} href={item.href} onClick={() => setOpenMenu(null)} className="sbnav-row" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, textDecoration: 'none' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', color: '#fff', fontWeight: 700, fontSize: 13 }}>{item.label}</span>
                    {item.desc && <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, marginTop: 1, lineHeight: 1.35 }}>{item.desc}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
