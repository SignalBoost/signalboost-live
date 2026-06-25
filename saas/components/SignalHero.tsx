'use client'
import { useCallback, useState, useRef, useMemo } from 'react'
import SignalCanvas from './SignalCanvas'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const LANGS = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
]

const POSITIONS = [
  { tx: 140, ty: -160 },
  { tx: -140, ty: -160 },
  { tx: 170, ty: -80 },
  { tx: -170, ty: -80 },
  { tx: 60, ty: -200 },
]

type Tag = {
  id: number
  lang: typeof LANGS[0]
  pos: typeof POSITIONS[0]
}

const TICKER_DURATION = 40 // seconds for one full loop

export default function SignalHero() {
  const { dict } = useI18n() as { dict: any }

  const [selected, setSelected] = useState<string[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [paused, setPaused] = useState(false)

  const langRef = useRef(0)
  const posRef = useRef(0)
  const idRef = useRef(0)

  // ---- localized hero copy (security / auditing pivot) ----
  const heroTitle = t(
    dict,
    'home.hero.title',
    'Audit every repo. Trace every vulnerability. Map every control.'
  )
  const heroSubtitle = t(
    dict,
    'home.hero.subtitle',
    'SignalBoost continuously audits your repositories and infrastructure, traces vulnerabilities to their source, and maps your posture to SOC 2, ISO 27001, NIST, and CIS — automatically.'
  )

  // ---- supporting chrome (English fallbacks; retuned to the security pivot) ----
  const hero = dict?.hero ?? {}
  const badge = hero.badge ?? 'Audit · Trace · Comply'
  const ctaPrimary = hero.ctaPrimary ?? 'Run an audit'
  const ctaSecondary = hero.ctaSecondary ?? 'See a sample report'
  const tagHint = hero.tagHint ?? 'Click a language signal to localize your reports'
  const scrollLabel = hero.scroll ?? 'Scroll'

  const features = [
    { icon: '🛡️', label: hero?.features?.repos ?? 'Repository audits' },
    { icon: '🔎', label: hero?.features?.trace ?? 'Vulnerability tracing' },
    { icon: '🗺️', label: hero?.features?.compliance ?? 'Compliance mapping' },
    { icon: '🔐', label: hero?.features?.secrets ?? 'Secret detection' },
  ]

  // ---- ticker items (illustrative activity feed, feed-ready later) ----
  const tickerItems: string[] = useMemo(() => {
    const fallback = [
      'Repo scanned · signalboost-live',
      'Vulnerability traced · api/route',
      'Secret flagged · .env leak',
      'Control mapped · SOC 2 CC6.1',
      'Posture checked · ISO 27001',
      'Finding resolved · CIS 4.1',
      'Audit complete · 0 criticals',
    ]
    return Array.isArray(hero.ticker) && hero.ticker.length > 0
      ? hero.ticker
      : fallback
  }, [hero.ticker])

  // Duplicate for seamless marquee loop.
  const tickerLoop = useMemo(
    () => [...tickerItems, ...tickerItems],
    [tickerItems]
  )

  const spawnTag = useCallback(() => {
    const langItem = LANGS[langRef.current % LANGS.length]
    const pos = POSITIONS[posRef.current % POSITIONS.length]

    langRef.current++
    posRef.current++

    const id = idRef.current++

    setTags(prev => [...prev, { id, lang: langItem, pos }])

    setTimeout(() => {
      setTags(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }, [])

  const toggleLang = (name: string) => {
    setSelected(prev =>
      prev.includes(name)
        ? prev.filter(l => l !== name)
        : [...prev, name]
    )
  }

  // ---- CTA actions ----
  const handlePrimary = () => {
    window.location.href = '/dashboard'
  }

  const handleSecondary = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: Math.round(window.innerHeight * 0.9), behavior: 'smooth' })
    }
  }

  return (
    <section
      style={{
        minHeight: 'calc(100vh - 65px)',
        maxHeight: '92vh',
        overflow: 'hidden',
        position: 'relative',
      }}
      className="grid grid-cols-2 items-center"
    >
      {/* LEFT */}
      <div className="flex flex-col gap-7 px-16">
        <div
          className="flex items-center gap-2 w-fit rounded-full px-4 py-2"
          style={{
            background: 'rgba(255,195,0,0.1)',
            border: '1px solid rgba(255,195,0,0.25)',
            color: '#ffc300',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#ffc300',
              display: 'inline-block',
              animation: 'pulse 2s infinite',
            }}
          />
          {badge}
        </div>

        {/* Title + subtitle frame — Linear-style, border-only, fathom-glass.
            Hover/tap pauses the activity ticker. */}
        <div
          className="fathom-glass"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
          style={{
            position: 'relative',
            borderRadius: 20,
            padding: 'clamp(22px, 3vw, 34px)',
            maxWidth: 560,
          }}
        >
          <h1
            className="font-black leading-none"
            style={{
              fontSize: 'clamp(34px, 4.4vw, 58px)',
              letterSpacing: '-0.03em',
              animation: 'fadeSlide 0.6s ease-out',
              margin: 0,
              color: '#fff',
            }}
          >
            {heroTitle}
          </h1>

          <p
            style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: 16,
              lineHeight: 1.7,
              margin: '16px 0 0',
            }}
          >
            {heroSubtitle}
          </p>

          {/* Subtle activity ticker */}
          <div
            style={{
              marginTop: 18,
              overflow: 'hidden',
              maskImage:
                'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)',
              height: 22,
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                gap: 28,
                whiteSpace: 'nowrap',
                animation: `tickerScroll ${TICKER_DURATION}s linear infinite`,
                animationPlayState: paused ? 'paused' : 'running',
              }}
            >
              {tickerLoop.map((item, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.35)',
                    letterSpacing: '0.04em',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: '#ffc300',
                      display: 'inline-block',
                    }}
                  />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={handlePrimary}
            style={{
              background: '#ffc300',
              color: '#000',
              fontWeight: 800,
              fontSize: 15,
              padding: '13px 34px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {ctaPrimary}
          </button>

          <button
            onClick={handleSecondary}
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: 15,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
            }}
          >
            {ctaSecondary} →
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 28,
            flexWrap: 'wrap',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 20,
          }}
        >
          {features.map(f => (
            <div
              key={f.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 18 }}>{f.icon}</span>
              <span
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.6)',
                  fontWeight: 500,
                }}
              >
                {f.label}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            minHeight: 36,
          }}
        >
          {selected.length === 0 ? (
            <p
              style={{
                color: 'rgba(255,255,255,0.2)',
                fontSize: 13,
                margin: 0,
              }}
            >
              {tagHint}
            </p>
          ) : (
            selected.map(name => {
              const l = LANGS.find(x => x.name === name)!

              return (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    background: 'rgba(255,195,0,0.12)',
                    border: '1px solid rgba(255,195,0,0.3)',
                    color: '#ffc300',
                    borderRadius: 999,
                  }}
                >
                  <span>{l.flag}</span>
                  <span>{l.name}</span>

                  <button
                    onClick={() => toggleLang(name)}
                    style={{
                      color: 'rgba(255,255,255,0.3)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 18,
                      lineHeight: 1,
                      padding: 0,
                      marginLeft: 4,
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* RIGHT — signal */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          borderLeft: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div style={{ position: 'relative', width: 500, height: 500 }}>
          <SignalCanvas onSpawn={spawnTag} />

          {tags.map(t => (
            <button
              key={t.id}
              onClick={() => toggleLang(t.lang.name)}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${t.pos.tx}px), calc(-50% + ${t.pos.ty}px))`,
                animation: 'tagFloat 3.5s ease-out forwards',
                background: selected.includes(t.lang.name)
                  ? '#ffc300'
                  : 'rgba(255,255,255,0.08)',
                border: `1px solid ${
                  selected.includes(t.lang.name)
                    ? '#ffc300'
                    : 'rgba(255,255,255,0.3)'
                }`,
                color: selected.includes(t.lang.name) ? '#000' : '#ffffff',
                borderRadius: 999,
                padding: '9px 20px',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {t.lang.flag} {t.lang.name}
            </button>
          ))}
        </div>
      </div>

      {/* Scroll hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          opacity: 0.4,
          animation: 'bounce 2s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: '#fff',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {scrollLabel}
        </span>

        <span style={{ color: '#ffc300', fontSize: 18 }}>↓</span>
      </div>

      <style>{`
        .fathom-glass {
          background: rgba(6, 9, 19, 0.61);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        @keyframes tagFloat {
          0% {
            opacity: 0;
            transform: translate(calc(-50% + 0px), calc(-50% + 0px)) scale(0.8);
          }
          12% { opacity: 1; }
          75% { opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        @keyframes bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(6px); }
        }

        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  )
}
