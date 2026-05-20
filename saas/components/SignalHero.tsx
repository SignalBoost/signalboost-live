'use client'
import { useCallback, useState, useEffect, useRef, useMemo } from 'react'
import SignalCanvas from './SignalCanvas'
import { useI18n } from '@/components/i18n/I18nProvider'

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

const HEADLINE_INTERVAL = 7000
const TICKER_DURATION = 40 // seconds for one full loop

export default function SignalHero() {
  const { dict, lang } = useI18n() as { dict: any; lang?: string }

  const [selected, setSelected] = useState<string[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [headlineIndex, setHeadlineIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const langRef = useRef(0)
  const posRef = useRef(0)
  const idRef = useRef(0)

  // ---- text with English fallbacks ----
  const hero = dict?.hero ?? {}

  const badge = hero.badge ?? 'Build · Review · Broadcast'
  const subhead =
    hero.subhead ??
    'Create your website, collect customer reviews, and produce native audio & video content — in your language, not a translation.'
  const ctaPrimary = hero.ctaPrimary ?? 'Get started'
  const ctaSecondary = hero.ctaSecondary ?? 'Watch a demo'
  const tagHint =
    hero.tagHint ?? 'Click a language signal to add it to your project'
  const scrollLabel = hero.scroll ?? 'Scroll'

  const features = [
    { icon: '🌐', label: hero?.features?.site ?? 'Site builder' },
    { icon: '⭐', label: hero?.features?.reviews ?? 'Review collector' },
    { icon: '🎙️', label: hero?.features?.audio ?? 'Native audio' },
    { icon: '🎬', label: hero?.features?.video ?? 'Video editor' },
  ]

  // ---- region-aware headlines: current language first, then the rest ----
  const headlines: string[] = useMemo(() => {
    const fallback = [
      'Build your brand in English',
      'Construa sua marca em Português',
      'Construye tu marca en Español',
      'Twórz swoją markę po Polsku',
      'Создайте свой бренд на Русском',
    ]
    const list: string[] =
      Array.isArray(hero.headlines) && hero.headlines.length > 0
        ? hero.headlines
        : fallback

    // Move the headline matching the user's current language to the front.
    const currentIdx = LANGS.findIndex(l => l.code === lang)
    if (currentIdx > 0 && currentIdx < list.length) {
      const reordered = [...list]
      const [native] = reordered.splice(currentIdx, 1)
      reordered.unshift(native)
      return reordered
    }
    return list
  }, [hero.headlines, lang])

  // Reset to first headline whenever the ordering changes (language switch).
  useEffect(() => {
    setHeadlineIndex(0)
  }, [headlines])

  // Rotate headlines (paused on hover/tap).
  useEffect(() => {
    if (paused) return
    if (headlines.length <= 1) return

    const t = setInterval(() => {
      setHeadlineIndex(i => (i + 1) % headlines.length)
    }, HEADLINE_INTERVAL)

    return () => clearInterval(t)
  }, [paused, headlines.length])

  // ---- ticker items (static now, feed-ready later) ----
  const tickerItems: string[] = useMemo(() => {
    const fallback = [
      'New review · São Paulo',
      'Site published · Madrid',
      'Audio generated · pl-PL',
      'Video rendered · ru-RU',
      'Review collected · Lisbon',
      'Site live · Mexico City',
      'Broadcast sent · 5 languages',
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

        {/* Rotating headline — hover/tap to pause */}
        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
          style={{
            position: 'relative',
            minHeight: 'clamp(96px, 12vw, 168px)',
            cursor: 'default',
          }}
          aria-live="polite"
        >
          <h1
            key={headlineIndex}
            className="font-black leading-none"
            style={{
              fontSize: 'clamp(40px, 5vw, 68px)',
              letterSpacing: '-0.03em',
              animation: 'fadeSlide 0.6s ease-out',
              margin: 0,
              color: '#fff',
            }}
          >
            {headlines[headlineIndex]}
          </h1>

          {/* Subtle ticker underneath */}
          <div
            style={{
              marginTop: 14,
              maxWidth: 480,
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

        <p
          style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 16,
            lineHeight: 1.7,
            maxWidth: 340,
            margin: 0,
          }}
        >
          {subhead}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
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
