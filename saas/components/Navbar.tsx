'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import AuthModal from './AuthModal'

const GOLD = '#ffc300'

const TOOL_LINKS = [
  {
    icon: '🌐',
    label: 'Build a website',
    href: '/dashboard/builder',
  },
  {
    icon: '⭐',
    label: 'Collect reviews',
    href: '/dashboard/reviews',
  },
  {
    icon: '🎙️',
    label: 'Generate audio',
    href: '/dashboard/audio',
  },
  {
    icon: '🎬',
    label: 'Create videos',
    href: '/dashboard/video',
  },
]

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
]

export default function Navbar() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pathname = usePathname()

  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] =
    useState<'login' | 'signup'>('login')
  const [user, setUser] = useState<any>(null)
  const [language, setLanguage] = useState('en')

  useEffect(() => {
    if (typeof window === 'undefined') return

    const savedLanguage =
      window.localStorage.getItem('signalboost_language')

    if (savedLanguage) {
      setLanguage(savedLanguage)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null)
    })

    const { data: listener } =
      supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null)
      })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')!
    const W = 40
    const H = 40

    canvas.width = W
    canvas.height = H

    const cx = W / 2
    const cy = H - 8

    let rings: { r: number; alpha: number }[] = []
    let last = 0
    let raf: number

    function draw(ts: number) {
      ctx.clearRect(0, 0, W, H)

      if (!last || ts - last > 2000) {
        rings.push({ r: 0, alpha: 1 })
        last = ts
      }

      rings = rings.filter(r => r.alpha > 0.01)

      for (const r of rings) {
        r.r += 0.8
        r.alpha -= 0.012

        const arcs = [1, 0.65]
        const widths = [1.2, 0.8]
        const alphas = [0.9, 0.5]

        for (let i = 0; i < 2; i++) {
          if (r.r * arcs[i] < 3) continue

          ctx.globalAlpha = Math.max(0, r.alpha * alphas[i])
          ctx.strokeStyle = GOLD
          ctx.lineWidth = widths[i]
          ctx.beginPath()
          ctx.arc(cx, cy, r.r * arcs[i], Math.PI, 0)
          ctx.stroke()
        }
      }

      ctx.globalAlpha = 1
      ctx.fillStyle = GOLD
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#0a0a0f'
      ctx.beginPath()
      ctx.arc(cx, cy, 1.5, 0, Math.PI * 2)
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => cancelAnimationFrame(raf)
  }, [])

  async function handleLogout() {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('greetingDismissed')
      window.localStorage.removeItem('signalboost_language_prompted')
    }

    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function openLogin() {
    setAuthMode('login')
    setShowAuth(true)
  }

  function openSignup() {
    setAuthMode('signup')
    setShowAuth(true)
  }

  function changeLanguage(nextLanguage: string) {
    setLanguage(nextLanguage)

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'signalboost_language',
        nextLanguage
      )
      window.localStorage.setItem(
        'signalboost_language_prompted',
        '1'
      )
    }
  }

  const navLinks = [
    { label: 'Home', href: '/' },
    { label: 'Podcasters', href: '/podcasters' },
    ...(user ? [] : [{ label: 'Dashboard', href: '/dashboard' }]),
    { label: 'Pricing', href: '/pricing' },
    { label: 'Docs', href: '/docs' },
  ]

  return (
    <>
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          padding: '16px 32px',
          borderBottom: user
            ? 'none'
            : '1px solid var(--border-soft)',
          background: 'rgba(10,10,15,0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Link
          href="/"
          style={{
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 40,
              height: 40,
              flexShrink: 0,
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
              }}
            />
          </div>

          <span
            style={{
              fontWeight: 800,
              fontSize: 17,
              color: '#fff',
              letterSpacing: '-0.02em',
            }}
          >
            signal<span style={{ color: GOLD }}>boost</span>
          </span>
        </Link>
                <div
          style={{
            display:'flex',
            gap:24,
            alignItems:'center'
          }}
        >
          {navLinks.map(item => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' &&
                pathname?.startsWith(item.href))

            return (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  fontSize:14,
                  textDecoration:'none',
                  color:isActive
                    ?'#fff'
                    :'var(--text-muted)',
                  fontWeight:isActive ? 700 : 500
                }}
                onMouseEnter={e=>{
                  e.currentTarget.style.color='#fff'
                }}
                onMouseLeave={e=>{
                  e.currentTarget.style.color=
                    isActive
                    ?'#fff'
                    :'var(--text-muted)'
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <div
          style={{
            display:'flex',
            alignItems:'center',
            gap:10
          }}
        >
          <select
            value={language}
            onChange={e=>
              changeLanguage(e.target.value)
            }
            style={{
              background:'var(--surface-2)',
              color:'var(--text-secondary)',
              border:'1px solid var(--border-medium)',
              borderRadius:999,
              padding:'8px 12px',
              fontSize:12,
              cursor:'pointer'
            }}
          >
            {LANGUAGES.map(lang=>(
              <option
                key={lang.code}
                value={lang.code}
              >
                {lang.label}
              </option>
            ))}
          </select>

          {user ? (
            <>
              <div
                style={{
                  fontSize:13,
                  color:'var(--text-muted)',
                  maxWidth:160,
                  overflow:'hidden',
                  textOverflow:'ellipsis',
                  whiteSpace:'nowrap'
                }}
              >
                {user.email}
              </div>

              <Link href="/dashboard">
                <button
                  style={{
                    background:'var(--surface-2)',
                    color:'#fff',
                    padding:'8px 18px',
                    borderRadius:999,
                    border:'1px solid var(--border-medium)',
                    fontWeight:700,
                    cursor:'pointer'
                  }}
                >
                  Dashboard
                </button>
              </Link>

              <button
                onClick={handleLogout}
                style={{
                  background:'none',
                  color:'var(--text-muted)',
                  padding:'8px 14px',
                  borderRadius:999,
                  border:'1px solid var(--border-soft)',
                  cursor:'pointer'
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={openLogin}
                style={{
                  background:'none',
                  color:'var(--text-secondary)',
                  border:'1px solid var(--border-medium)',
                  padding:'8px 18px',
                  borderRadius:999,
                  cursor:'pointer'
                }}
              >
                Log in
              </button>

              <button
                onClick={openSignup}
                style={{
                  background:GOLD,
                  color:'#000',
                  padding:'9px 22px',
                  border:'none',
                  borderRadius:999,
                  fontWeight:800,
                  cursor:'pointer'
                }}
              >
                Get started
              </button>
            </>
          )}
        </div>
      </nav>

      {user && (
        <div
          style={{
            display:'flex',
            justifyContent:'center',
            gap:8,
            padding:'8px 32px',
            borderBottom:'1px solid var(--border-soft)',
            background:'rgba(10,10,15,0.88)',
            position:'sticky',
            top:73,
            zIndex:99,
            flexWrap:'wrap'
          }}
        >
          {TOOL_LINKS.map(tool=>{
            const isActive =
              pathname===tool.href ||
              pathname?.startsWith(
                tool.href + '/'
              )

            return(
              <Link
                key={tool.href}
                href={tool.href}
                style={{
                  display:'flex',
                  alignItems:'center',
                  gap:6,
                  padding:'6px 14px',
                  borderRadius:999,
                  textDecoration:'none',
                  background:isActive
                    ?'rgba(59,130,246,.15)'
                    :'var(--surface-1)',
                  border:`1px solid ${
                    isActive
                    ?'rgba(59,130,246,.4)'
                    :'var(--border-soft)'
                  }`,
                  color:isActive
                    ?'#fff'
                    :'var(--text-muted)'
                }}
              >
                <span>{tool.icon}</span>
                <span>{tool.label}</span>
              </Link>
            )
          })}
        </div>
      )}

      {showAuth && (
        <AuthModal
          mode={authMode}
          onClose={()=>
            setShowAuth(false)
          }
        />
      )}
    </>
  )
}
