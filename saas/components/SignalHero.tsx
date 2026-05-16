'use client'
import { useCallback, useState, useEffect, useRef } from 'react'
import SignalCanvas from './SignalCanvas'

const LANGS = [
  { name: 'English',   flag: '🇺🇸' },
  { name: 'Português', flag: '🇧🇷' },
  { name: 'Español',   flag: '🇪🇸' },
  { name: 'Polski',    flag: '🇵🇱' },
  { name: 'Русский',   flag: '🇷🇺' },
]

const POSITIONS = [
  { tx:  150, ty: -130 },
  { tx: -150, ty: -130 },
  { tx:  160, ty:  -40 },
  { tx: -160, ty:  -40 },
  { tx:   50, ty: -175 },
]

type Tag = { id: number; lang: typeof LANGS[0]; pos: typeof POSITIONS[0] }

export default function SignalHero() {
  const [selected, setSelected] = useState<string[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [headlineLang, setHeadlineLang] = useState(0)
  const langRef = useRef(0)
  const posRef  = useRef(0)
  const idRef   = useRef(0)

  useEffect(() => {
    const t = setInterval(() => setHeadlineLang(i => (i + 1) % LANGS.length), 2000)
    return () => clearInterval(t)
  }, [])

  const spawnTag = useCallback(() => {
    const lang = LANGS[langRef.current % LANGS.length]
    const pos  = POSITIONS[posRef.current % POSITIONS.length]
    langRef.current++
    posRef.current++
    const id = idRef.current++
    setTags(prev => [...prev, { id, lang, pos }])
    setTimeout(() => setTags(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  const toggleLang = (name: string) =>
    setSelected(prev => prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name])

  return (
    <section
      style={{ minHeight: 'calc(100vh - 65px)', padding: '0' }}
      className="grid grid-cols-2 items-center">

      {/* LEFT */}
      <div className="flex flex-col gap-6 px-16 py-12">

        <div className="flex items-center gap-2 w-fit rounded-full px-4 py-2"
          style={{ background: 'rgba(255,195,0,0.12)', border: '1px solid rgba(255,195,0,0.3)', color: '#ffc300', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffc300', display: 'inline-block', animation: 'pulse 2s infinite' }} />
          Build · Review · Broadcast
        </div>

        <h1 style={{ fontSize: 'clamp(44px, 5.5vw, 76px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', margin: 0 }}>
          Build your brand<br />
          in{' '}
          <span key={headlineLang}
            style={{ color: '#ffc300', display: 'inline-block', animation: 'fadeSlide 0.35s ease-out' }}>
            {LANGS[headlineLang].name}
          </span>
        </h1>

        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 360, margin: 0 }}>
          Create your website, collect customer reviews, and produce native audio & video content — in your language, not a translation.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button style={{ background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 15, padding: '13px 34px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
            Get started
          </button>
          <button
            style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>
            Watch a demo →
          </button>
        </div>

        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20 }}>
          {[
            { icon: '🌐', label: 'Site builder' },
            { icon: '⭐', label: 'Review collector' },
            { icon: '🎙️', label: 'Native audio' },
            { icon: '🎬', label: 'Video editor' },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{f.icon}</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>{f.label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 36 }}>
          {selected.length === 0
            ? <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13, margin: 0 }}>Click a language signal to add it to your project</p>
            : selected.map(name => {
                const l = LANGS.find(x => x.name === name)!
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, background: 'rgba(255,195,0,0.12)', border: '1px solid rgba(255,195,0,0.35)', color: '#ffc300', borderRadius: 999 }}>
                    <span>{l.flag}</span>
                    <span>{l.name}</span>
                    <button onClick={() => toggleLang(name)}
                      style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, marginLeft: 4 }}>×</button>
                  </div>
                )
              })
          }
        </div>
      </div>

      {/* RIGHT — signal perfectly centered */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ position: 'relative', width: 500, height: 500 }}>
          <SignalCanvas onSpawn={spawnTag} />
          {tags.map(t => (
            <button key={t.id} onClick={() => toggleLang(t.lang.name)}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${t.pos.tx}px), calc(-50% + ${t.pos.ty}px))`,
                animation: 'tagFloat 3.5s ease-out forwards',
                background: selected.includes(t.lang.name) ? '#ffc300' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${selected.includes(t.lang.name) ? '#ffc300' : 'rgba(255,255,255,0.3)'}`,
                color: selected.includes(t.lang.name) ? '#000' : '#ffffff',
                borderRadius: 999,
                padding: '9px 20px',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}>
              {t.lang.flag} {t.lang.name}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes tagFloat {
          0%   { opacity:0; transform:translate(calc(-50% + 0px),calc(-50% + 0px)) scale(0.8); }
          12%  { opacity:1; }
          75%  { opacity:1; }
          100% { opacity:0; }
        }
        @keyframes fadeSlide {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%     { opacity:0.4; }
        }
      `}</style>
    </section>
  )
}
