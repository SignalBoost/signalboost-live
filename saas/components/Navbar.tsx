'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import AuthModal from './AuthModal'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

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
  const { lang, setLang, dict } = useI18n()

  const [showAuth, setShowAuth] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
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

        ctx.globalAlpha = Math.max(0, r.alpha)
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(cx, cy, r.r, Math.PI, 0)
        ctx.stroke()
      }

      ctx.globalAlpha = 1
      ctx.fillStyle = GOLD
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
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

  const navLinks = [
    {
      label: t(dict, 'home', 'Home'),
      href: '/',
    },
    {
      label: t(dict, 'podcasters', 'Podcasters'),
      href: '/podcasters',
    },
    ...(user
      ? []
      : [
          {
            label: t(dict, 'dashboard', 'Dashboard'),
            href: '/dashboard',
          },
        ]),
    {
      label: t(dict, 'pricing', 'Pricing'),
      href: '/pricing',
    },
    {
      label: t(dict, 'docs', 'Docs'),
      href: '/docs',
    },
  ]

  const toolLinks = [
    {
      icon: '🌐',
      label: t(dict, 'buildWebsite', 'Build a website'),
      href: '/dashboard/builder',
    },
    {
      icon: '⭐',
      label: t(dict, 'collectReviews', 'Collect reviews'),
      href: '/dashboard/reviews',
    },
    {
      icon: '🎙️',
      label: t(dict, 'generateAudio', 'Generate audio'),
      href: '/dashboard/audio',
    },
    {
      icon: '🎬',
      label: t(dict, 'createVideos', 'Create videos'),
      href: '/dashboard/video',
    },
  ]

  return (
    <>
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          background: 'rgba(10,10,15,.88)',
          borderBottom: user ? 'none' : '1px solid var(--border-soft)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(12px)',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: 40,
              height: 40,
            }}
          />

          <span
            style={{
              color: '#fff',
              fontWeight: 800,
              fontSize: 17,
            }}
          >
            signal<span style={{ color: GOLD }}>boost</span>
          </span>
        </Link>

        <div
          style={{
            display: 'flex',
            gap: 24,
            alignItems: 'center',
          }}
        >
          {navLinks.map(item => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname?.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  textDecoration: 'none',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <select
            value={lang}
            onChange={e => setLang(e.target.value)}
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
            {LANGUAGES.map(language => (
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
      </nav>

      {user && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 24px',
            flexWrap: 'wrap',
            background: 'rgba(10,10,15,.88)',
            borderBottom: '1px solid var(--border-soft)',
            position: 'sticky',
            top: 73,
            zIndex: 99,
            backdropFilter: 'blur(12px)',
          }}
        >
          {toolLinks.map(tool => {
            const isActive =
              pathname === tool.href ||
              pathname?.startsWith(tool.href + '/')

            return (
              <Link
                key={tool.href}
                href={tool.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 999,
                  textDecoration: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  background: isActive
                    ? 'rgba(59,130,246,.15)'
                    : 'var(--surface-1)',
                  border: `1px solid ${
                    isActive
                      ? 'rgba(59,130,246,.4)'
                      : 'var(--border-soft)'
                  }`,
                  color: isActive ? '#fff' : 'var(--text-muted)',
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
        <AuthModal onClose={() => setShowAuth(false)} />
      )}
    </>
  )
}
