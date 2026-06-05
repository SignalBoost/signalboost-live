'use client'

// saas/components/Navbar.tsx
// Unified single-bar navigation. Every real page has a home here.
// Curated menus (not auto-generated) so links are correct and nothing is orphaned.

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

const BUILD: Item[] = [
  { icon: '🌐', label: 'Website Builder', href: '/dashboard/builder', desc: 'Create and publish your site.' },
  { icon: '⭐', label: 'Reviews', href: '/dashboard/reviews', desc: 'Collect and showcase customer reviews.' },
  { icon: '🎙️', label: 'Audio Studio', href: '/dashboard/audio', desc: 'Native voice and audio content.' },
  { icon: '🎬', label: 'Video Studio', href: '/dashboard/video', desc: 'Generate and edit videos.' },
  { icon: '✨', label: 'Improve', href: '/dashboard/improve', desc: 'Polish and optimize your content.' },
  { icon: '🧪', label: 'Lab', href: '/dashboard/lab', desc: 'Experimental tools and features.' },
  { icon: '🛠️', label: 'Workshop Apprentice', href: '/dashboard/apprentice', desc: 'Guided, level-aware help.' },
  { icon: '🎚️', label: 'Optimize Podcast Studio', href: '/dashboard/podcast/studio', desc: 'Improve an existing podcast.' },
]

const LAUNCHPAD: Item[] = [
  { icon: '🚀', label: 'Launchpad Home', href: '/dashboard/launchpad', desc: 'Choose a guided launch path.' },
  { icon: '🏢', label: 'Build a Business', href: '/dashboard/launchpad/business', desc: 'Launch a business from scratch.' },
  { icon: '🎬', label: 'Creator', href: '/dashboard/launchpad/creator', desc: 'Build your creator brand.' },
  { icon: '🛒', label: 'Online Store', href: '/dashboard/launchpad/store', desc: 'Launch a store from scratch.' },
  { icon: '🎙️', label: 'Build a Podcast', href: '/dashboard/launchpad/podcast', desc: 'Start a podcast from scratch.' },
  { icon: '📻', label: 'Podcast Hub', href: '/dashboard/podcast', desc: 'All your podcast tools.' },
]

const GROW: Item[] = [
  { icon: '📡', label: 'Outreach Hub', href: '/dashboard/outreach', desc: 'Your outreach command center.' },
  { icon: '🔎', label: 'Discovery', href: '/dashboard/outreach/discovery', desc: 'Find and analyze new leads.' },
  { icon: '📇', label: 'Contacts', href: '/dashboard/outreach/contacts', desc: 'Review and approve leads.' },
  { icon: '📊', label: 'Pipeline', href: '/dashboard/outreach/pipeline', desc: 'Track prospects by stage.' },
  { icon: '📣', label: 'Promote', href: '/dashboard/promote', desc: 'Run promotion campaigns.' },
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
  const pathname  = usePathname()
  const { lang, setLang, dict } = useI18n()

  const [showAuth, setShowAuth]   = useState(false)
  const [user, setUser]           = useState<any>(null)
  const [credits, setCredits]     = useState<number>(0)
  const [plan, setPlan]           = useState<string>('free')
  const [userName, setUserName]   = useState<string | null>(null)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [openMenu, setOpenMenu]   = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user ?? null
      setUser(u)
      if (u) { fetchCredits(); checkAdminRole(u) } else setIsAdmin(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) { fetchCredits(); checkAdminRole(u) } else setIsAdmin(false)
    })
    return () => { listener.subscription.unsubscribe() }
  }, [])

  async function checkAdminRole(u: any) {
    const metadataRole = u?.user_metadata?.role
    if (metadataRole === 'owner' || metadataRole === 'admin') { setIsAdmin(true); return }
    try {
      const { data } = await supabase
        .from('team_members')
        .select('role,status,owner_id,member_id')
        .or(`member_id.eq.${u.id},owner_id.eq.${u.id}`)
      setIsAdmin(!!data?.some((m: any) => (m.status === 'active' || m.owner_id === u.id) && (m.role === 'owner' || m.role === 'admin' || m.owner_id === u.id)))
    } catch { setIsAdmin(false) }
  }

  async function fetchCredits() {
    try {
      const res  = await fetch('/api/credits', { cache: 'no-store' })
      const data = await res.json()
      if (typeof data.credits === 'number') setCredits(data.credits)
      if (data.plan)  setPlan(data.plan)
      if (data.name)  setUserName(data.name)
    } catch { /* silent */ }
  }

  useEffect(() => { setOpenMenu(null); setMobileOpen(false) }, [pathname])

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
        onMouseEnter={() => setOpenMenu(id)}
        onMouseLeave={() => setOpenMenu(prev => (prev === id ? null : prev))}
      >
        <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpenMenu(open ? null : id)} style={trigger(open || groupActive(items))}>
          {label}
          <span style={{ fontSize: 10, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>▾</span>
        </button>
        <div style={panelWrap(open, align)}>
          <div style={panelCard}>
            <span style={accentLine} aria-hidden="true" />
            <div style={{ padding: 12, width, maxWidth: '92vw', display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2 }}>
              {items.map(item => (
                <Link key={item.href} href={item.href} className="sbnav-row" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, textDecoration: 'none' }}>
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
return (
    <>
      <style>{`
        .sbnav-desktop { display: flex; align-items: center; gap: 20px; }
        .sbnav-right { display: flex; align-items: center; gap: 10px; }
        .sbnav-burger { display: none; }
        .sbnav-row { transition: background .15s ease; border-radius: 12px; }
        .sbnav-row:hover { background: var(--surface-1-hover); }
        @media (max-width: 1100px) {
          .sbnav-desktop, .sbnav-right { display: none !important; }
          .sbnav-burger { display: inline-flex !important; }
        }
      `}</style>

      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px',
        background: 'linear-gradient(135deg, rgba(8,10,20,.86), rgba(15,23,42,.62))',
        borderBottom: '1px solid rgba(26,240,255,.16)',
        boxShadow: '0 18px 60px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.08)',
        position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'blur(12px)',
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <canvas ref={canvasRef} style={{ width: 40, height: 40 }} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>
            signal<span style={{ color: GOLD }}>boost</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="sbnav-desktop">
          <Link href="/" style={{ ...trigger(pathname === '/'), display: 'inline-flex' }}>Home</Link>
          <Group id="build" label="Build" items={BUILD} cols={2} width={560} />
          <Group id="launchpad" label="Launchpad" items={LAUNCHPAD} width={320} />
          <Group id="grow" label="Grow" items={GROW} width={320} />
          <Group id="workspace" label="Workspace" items={WORKSPACE} width={320} />
          {isAdmin && <Group id="admin" label="Admin" items={ADMIN} cols={2} width={420} />}
          <Link href="/pricing" style={{ ...trigger(pathname === '/pricing'), display: 'inline-flex' }}>Pricing</Link>
          <Group id="help" label="Help" items={HELP} align="right" width={220} />
        </div>

        {/* Desktop right cluster */}
        <div className="sbnav-right">
          <select value={lang} onChange={e => setLang(e.target.value)} style={{
            background: 'var(--surface-2)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-medium)', borderRadius: 999,
            padding: '8px 12px', fontSize: 12, cursor: 'pointer',
          }}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>

          {user && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,195,0,0.95)', fontFamily: 'monospace' }}>⚡ {credits}</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 999, background: planStyle.bg, color: planStyle.color, fontFamily: 'monospace' }}>{planLabel}</span>
              {displayName && (
                <span title={displayName} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
              )}
            </span>
          )}

          {user ? (
            <button onClick={handleLogout} style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-soft)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}>
              {t(dict, 'logout', 'Log out')}
            </button>
          ) : (
            <button onClick={() => setShowAuth(true)} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 999, padding: '9px 22px', fontWeight: 800, cursor: 'pointer' }}>
              {t(dict, 'getStarted', 'Get started')}
            </button>
          )}
        </div>

        {/* Mobile burger */}
        <button className="sbnav-burger" aria-label="Menu" onClick={() => setMobileOpen(o => !o)} style={{ background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 10, color: '#fff', padding: '8px 12px', cursor: 'pointer', fontSize: 18 }}>
          {mobileOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile panel */}
      {mobileOpen && (
        <div style={{ position: 'sticky', top: 65, zIndex: 99, background: 'rgba(8,10,20,.98)', borderBottom: '1px solid var(--border-medium)', padding: 16, maxHeight: '80vh', overflowY: 'auto', backdropFilter: 'blur(12px)' }}>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,195,0,0.95)', fontFamily: 'monospace' }}>⚡ {credits}</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 999, background: planStyle.bg, color: planStyle.color, fontFamily: 'monospace' }}>{planLabel}</span>
              {displayName && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{displayName}</span>}
            </div>
          )}

          <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
            <Link href="/" style={{ padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 700, fontSize: 14 }}>🏠 Home</Link>
          </div>

          {[
            { title: 'Build', items: BUILD },
            { title: 'Launchpad', items: LAUNCHPAD },
            { title: 'Grow', items: GROW },
            { title: 'Workspace', items: WORKSPACE },
            ...(isAdmin ? [{ title: 'Admin', items: ADMIN }] : []),
          ].map(section => (
            <div key={section.title} style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
              <span style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{section.title}</span>
              {section.items.map(item => (
                <Link key={item.href} href={item.href} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}>
                  <span>{item.icon}</span>{item.label}
                </Link>
              ))}
            </div>
          ))}

          <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
            <span style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>More</span>
            <Link href="/pricing" style={{ padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}>Pricing</Link>
            {HELP.map(item => (
              <Link key={item.href} href={item.href} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}>
                <span>{item.icon}</span>{item.label}
              </Link>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={lang} onChange={e => setLang(e.target.value)} style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-medium)', borderRadius: 999, padding: '8px 12px', fontSize: 12 }}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            {user ? (
              <button onClick={handleLogout} style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-soft)', borderRadius: 999, padding: '9px 16px', cursor: 'pointer' }}>{t(dict, 'logout', 'Log out')}</button>
            ) : (
              <button onClick={() => { setMobileOpen(false); setShowAuth(true) }} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 999, padding: '9px 22px', fontWeight: 800, cursor: 'pointer' }}>{t(dict, 'getStarted', 'Get started')}</button>
            )}
          </div>
        </div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
