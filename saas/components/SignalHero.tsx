'use client'
import { useCallback, useState, useEffect } from 'react'
import SignalCanvas from './SignalCanvas'

const LANGS = [
  { name: 'English',   flag: '🇺🇸' },
  { name: 'Português', flag: '🇧🇷' },
  { name: 'Español',   flag: '🇪🇸' },
  { name: 'Polski',    flag: '🇵🇱' },
  { name: 'Русский',   flag: '🇷🇺' },
]

const POSITIONS = [
  { tx:  140, ty: -160 },
  { tx: -140, ty: -160 },
  { tx:  170, ty:  -80 },
  { tx: -170, ty:  -80 },
  { tx:   60, ty: -200 },
]

type Tag = { id: number; lang: typeof LANGS[0]; pos: typeof POSITIONS[0] }

export default function SignalHero() {
  const [selected, setSelected] = useState<string[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [headlineLang, setHeadlineLang] = useState(0)
  const idxRef = { lang: 0, pos: 0, id: 0 }

  useEffect(() => {
    const t = setInterval(() => setHeadlineLang(i => (i + 1) % LANGS.length), 2000)
    return () => clearInterval(t)
  }, [])

  const spawnTag = useCallback(() => {
    const lang = LANGS[idxRef.lang % LANGS.length]
    const pos  = POSITIONS[idxRef.pos % POSITIONS.length]
    idxRef.lang++
    idxRef.pos++
    const id = idxRef.id++
    setTags(prev => [...prev, { id, lang, pos }])
    setTimeout(() => setTags(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  const toggleLang = (name: string) =>
    setSelected(prev => prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name])

  return (
    <section style={{ minHeight: 'calc(100vh - 65px)' }} className="grid grid-cols-2 items-center">
      <div className="flex flex-col gap-7 px-16">
        <div className="flex items-center gap-2 w-fit rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase"
          style={{ background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)', color: '#ffc300' }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ffc300' }} />
          Build · Review · Broadcast
        </div>

        <h1 className="font-black leading-none" style={{ fontSize: 'clamp(40px,5vw,68px)', letterSpacing: '-0.03em' }}>
          Build your brand<br />in{' '}
          <span key={headlineLang} style={{ color: '#ffc300', display: 'inline-block', animation: 'fadeSlide 0.4s ease-out' }}>
            {LANGS[headlineLang].name}
          </span>
        </h1>

        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, lineHeight: 1.7, maxWidth: 340 }}>
          Create your website, collect customer reviews, and produce native audio & video content — all in your language, not a translation.
        </p>

        <div className="flex items-center gap-4">
          <button className="font-bold rounded-full text-black"
            style={{ background: '#ffc300', padding: '12px 32px', fontSize: 15, border: 'none', cursor: 'pointer' }}>
            Get started
          </button>
          <button style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
            Watch a demo →
          </button>
        </div>

        <div className="flex gap-6 flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 24 }}>
          {[
            { icon: '🌐', label: 'Site builder' },
            { icon: '⭐', label: 'Review collector' },
            { icon: '🎙️', label: 'Native audio' },
            { icon: '🎬', label: 'Video editor' },
          ].map(f => (
            <div key={f.label} className="flex items-center gap-2">
              <span style={{ fontSize: 16 }}>{f.icon}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{f.label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" style={{ minHeight: 36 }}>
          {selected.length === 0
            ? <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: 13 }}>Click a language signal to add it to your project</p>
            : selected.map(name => {
                const l = LANGS.find(x => x.name === name)!
                return (
                  <div key={name} className="flex items-center gap-2 rounded-full"
                    style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, background: 'rgba(255,195,0,0.12)', border: '1px solid rgba(255,195,0,0.3)', color: '#ffc300' }}>
                    <span>{l.flag}</span><span>{l.name}</span>
                    <button onClick={() => toggleLang(name)}
                      style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4, fontSize: 16 }}>×</button>
                  </div>
                )
              })
          }
        </div>
      </div>

      <div className="flex items-center justify-center" style={{ borderLeft: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
        <div style={{ position: 'relative', width: 560, height: 560 }}>
          <SignalCanvas onSpawn={spawnTag} />
          {tags.map(t => (
            <button key={t.id} onClick={() => toggleLang(t.lang.name)}
              style={{
                position: 'absolute', left: '50%', top: 'calc(100% - 100px)',
                transform: `translate(calc(-50% + ${t.pos.tx}px), calc(-50% + ${t.pos.ty}px))`,
                animation: 'tagFloat 3.5s ease-out forwards',
                background: selected.includes(t.lang.name) ? '#ffc300' : 'rgba(255,195,0,0.08)',
                border: `1px solid ${selected.includes(t.lang.name) ? '#ffc300' : 'rgba(255,195,0,0.3)'}`,
                color: selected.includes(t.lang.name) ? '#000' : '#ffc300',
                borderRadius: 999, padding: '8px 18px', fontSize: 13, fontWeight: 700,
                letterSpacing: '0.05em', whiteSpace: 'nowrap', cursor: 'pointer',
              }}>
              {t.lang.flag} {t.lang.name}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes tagFloat {
          0% { opacity:0; transform:translate(calc(-50% + 0px),calc(-50% + 0px)) scale(0.8); }
          12% { opacity:1; }
          75% { opacity:1; }
          100% { opacity:0; }
        }
        @keyframes fadeSlide {
          from { opacity:0; transform:translateY(8px); }
          to { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </section>
  )
}
