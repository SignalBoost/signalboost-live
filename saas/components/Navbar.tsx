'use client'

// saas/components/Navbar.tsx
// Unified single-bar navigation with Fathom-style hover dropdowns.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import AuthModal from './AuthModal'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { SERVICES } from '@/lib/services/catalog'
import { UNIFIED_NAV } from '@/lib/platform/unifiedPlatform'

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

  // Auth + credits
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

  // Close menus on route change
  useEffect(() => { setOpenMenu(null); setMobileOpen(false) }, [pathname])

  // Signal animation
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

  // ── Data for dropdowns ──
  const services = SERVICES.map(s => ({
    key: s.key,
    icon: s.icon,
    accent: s.accent,
    href: s.dashboardHref,
    title: t(dict, `services.${s.key}.title`, s.titleFallback),
    desc: t(dict, `services.${s.key}.desc`, s.descFallback),
  }))

  const workspace = UNIFIED_NAV
    .filter(item => item.label !== 'Admin' || isAdmin)
    .map(item => ({
      icon: item.icon,
      href: item.href,
      description: item.description,
      label: t(dict, `aiNav.${item.label.toLowerCase().replace(/\s+/g, '')}`, item.label),
    }))

  const help = [
    { icon: '❓', label: t(dict, 'support.faq', 'FAQ'), href: '/faq' },
    { icon: '✉️', label: t(dict, 'support.contact', 'Contact Support'), href: '/support' },
    { icon: '📖', label: t(dict, 'support.documentation', 'Documentation'), href: '/docs' },
  ]

  const planStyle = PLAN_STYLES[plan] || PLAN_STYLES.free
  const planLabel = t(dict, `plan.${plan}`, plan.charAt(0).toUpperCase() + plan.slice(1))
  const displayName = userName || user?.email || ''

  const groupActive = (hrefs: string[]) =>
    hrefs.some(h => h !== '/' && (pathname === h || pathname?.startsWith(h + '/')))

  // ── Reusable styles ──
  const trigger = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontWeight: active ? 700 : 600, fontSize: 14, fontFamily: 'inherit',
    padding: '8px 4px',
  })

  const panelWrap = (open: boolean, align: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '100%', [align]: 0,
    paddingTop: 12,
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

  function Group({ id, label, align = 'left', children }: { id: string; label: React.ReactNode; align?: 'left' | 'right'; children: React.ReactNode }) {
    const open = openMenu === id
    return (
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => setOpenMenu(id)}
        onMouseLeave={() => setOpenMenu(prev => (prev === id ? null : prev))}
      >
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpenMenu(open ? null : id)}
          style={trigger(open)}
        >
          {label}
          <span style={{ fontSize: 10, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>▾</span>
        </button>
        <div style={panelWrap(open, align)}>
          <div style={panelCard}>
            <span style={accentLine} aria-hidden="true" />
            {children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        .sbnav-desktop { display: flex; align-items: center; gap: 28px; }
        .sbnav-right { display: flex; align-items: center; gap: 10px; }
        .sbnav-burger { display: none; }
        .sbnav-row { transition: background .15s ease; border-radius: 12px; }
        .sbnav-row:hover { background: var(--surface-1-hover); }
        @media (max-width: 980px) {
          .sbnav-desktop, .sbnav-right { display: none !important; }
          .sbnav-burger { display: inline-flex !important; }
        }
      `}</style>

      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 28px',
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
          <Group id="services" label="Services">
            <div style={{ padding: 16, width: 580, maxWidth: '90vw' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {services.map(s => (
                  <Link key={s.key} href={s.href} className="sbnav-row" style={{ display: 'flex', gap: 12, padding: 12, textDecoration: 'none' }}>
                    <span style={{
                      flexShrink: 0, width: 38, height: 38, borderRadius: 11,
                      display: 'grid', placeItems: 'center', fontSize: 18,
                      background: `${s.accent}1f`, border: `1px solid ${s.accent}55`,
                    }}>{s.icon}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', color: '#fff', fontWeight: 700, fontSize: 13 }}>{s.title}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.4, marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{s.desc}</span>
                    </span>
                  </Link>
                ))}
              </div>
              <Link href="/dashboard" className="sbnav-row" style={{ display: 'block', marginTop: 8, padding: '10px 12px', textAlign: 'center', color: GOLD, fontWeight: 800, fontSize: 12, textDecoration: 'none', border: '1px solid var(--border-soft)' }}>
                Open workspace →
              </Link>
            </div>
          </Group>

          <Group id="workspace" label="Workspace">
            <div style={{ padding: 12, width: 320, maxWidth: '90vw', display: 'grid', gap: 2 }}>
              {workspace.map(item => (
                <Link key={item.href} href={item.href} className="sbnav-row" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, textDecoration: 'none' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', color: '#fff', fontWeight: 700, fontSize: 13 }}>{item.label}</span>
                    <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, marginTop: 1 }}>{item.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Group>

          <Link href="/pricing" style={{ ...trigger(groupActive(['/pricing'])), display: 'inline-flex' }}>Pricing</Link>

          <Group id="help" label="Help" align="right">
            <div style={{ padding: 10, width: 220, display: 'grid', gap: 2 }}>
              {help.map(item => (
                <Link key={item.href} href={item.href} className="sbnav-row" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', textDecoration: 'none', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                  <span>{item.icon}</span>{item.label}
                </Link>
              ))}
            </div>
          </Group>
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
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,195,0,0.95)', fontFamily: 'monospace' }}>
                ⚡ {credits}
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 999, background: planStyle.bg, color: planStyle.color, fontFamily: 'monospace' }}>
                {planLabel}
              </span>
              {displayName && (
                <span title={displayName} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </span>
              )}
            </span>
          )}

          {user ? (
            <button onClick={handleLogout} style={{
              background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border-soft)', borderRadius: 999,
              padding: '8px 14px', cursor: 'pointer',
            }}>
              {t(dict, 'logout', 'Log out')}
            </button>
          ) : (
            <button onClick={() => setShowAuth(true)} style={{
              background: GOLD, color: '#000', border: 'none', borderRadius: 999,
              padding: '9px 22px', fontWeight: 800, cursor: 'pointer',
            }}>
              {t(dict, 'getStarted', 'Get started')}
            </button>
          )}
        </div>

        {/* Mobile burger */}
        <button
          className="sbnav-burger"
          aria-label="Menu"
          onClick={() => setMobileOpen(o => !o)}
          style={{ background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 10, color: '#fff', padding: '8px 12px', cursor: 'pointer', fontSize: 18 }}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile panel */}
      {mobileOpen && (
        <div style={{
          position: 'sticky', top: 65, zIndex: 99,
          background: 'rgba(8,10,20,.98)', borderBottom: '1px solid var(--border-medium)',
          padding: 16, maxHeight: '80vh', overflowY: 'auto', backdropFilter: 'blur(12px)',
        }}>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,195,0,0.95)', fontFamily: 'monospace' }}>⚡ {credits}</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 999, background: planStyle.bg, color: planStyle.color, fontFamily: 'monospace' }}>{planLabel}</span>
              {displayName && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{displayName}</span>}
            </div>
          )}
          <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
            <span style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Services</span>
            {services.map(s => (
              <Link key={s.key} href={s.href} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}>
                <span>{s.icon}</span>{s.title}
              </Link>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
            <span style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Workspace</span>
            {workspace.map(item => (
              <Link key={item.href} href={item.href} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}>
                <span>{item.icon}</span>{item.label}
              </Link>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
            <Link href="/pricing" style={{ padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}>Pricing</Link>
            {help.map(item => (
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
