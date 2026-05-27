'use client'

// Rich preview that mirrors the published renderer's visual language so the
// Operator preview card looks like the real site (not a plain text list).
// Scaled-down, scrollable card version.

import type { CSSProperties } from 'react'

const FONT_FALLBACK: Record<string, string> = {
  display: 'Georgia, "Times New Roman", serif',
  body: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

type Item = { title?: string; body?: string; icon?: string }
type Stat = { value?: string; label?: string }
type Section = {
  type: string
  eyebrow?: string
  heading?: string
  subheading?: string
  body?: string
  cta?: string
  ctaSecondary?: string
  items?: Item[]
  stats?: Stat[]
  videoUrl?: string
  email?: string
  phone?: string
}
export type SiteContent = {
  businessName?: string
  theme?: 'light' | 'dark'
  fonts?: { display?: string; body?: string }
  palette?: { primary?: string; accent?: string; background?: string; surface?: string; text?: string; muted?: string }
  sections?: Section[]
}

function withAlpha(color: string, alpha: number): string {
  if (!color || color[0] !== '#') return color
  let hex = color.slice(1)
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('')
  if (hex.length !== 6) return color
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function OperatorPreview({ content }: { content: SiteContent }) {
  const dark = content.theme === 'dark'
  const p = content.palette || {}
  const primary = p.primary || (dark ? '#7c5cff' : '#1d4ed8')
  const accent = p.accent || (dark ? '#22d3ee' : '#f59e0b')
  const background = p.background || (dark ? '#0a0a12' : '#ffffff')
  const surface = p.surface || (dark ? 'rgba(255,255,255,0.04)' : '#f6f7fb')
  const text = p.text || (dark ? '#f3f4f8' : '#15161c')
  const muted = p.muted || (dark ? 'rgba(243,244,248,0.65)' : 'rgba(21,22,28,0.62)')
  const displayFont = content.fonts?.display ? `'${content.fonts.display}', ${FONT_FALLBACK.display}` : FONT_FALLBACK.display
  const bodyFont = content.fonts?.body ? `'${content.fonts.body}', ${FONT_FALLBACK.body}` : FONT_FALLBACK.body
  const sections = Array.isArray(content.sections) ? content.sections : []

  const h: CSSProperties = { fontFamily: displayFont, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background, color: text, fontFamily: bodyFont, maxHeight: '72vh', overflowY: 'auto' }}>
      {sections.map((s, i) => {
        const heading = s.heading?.trim()
        const sub = s.subheading?.trim()
        const body = s.body?.trim()
        const eyebrow = s.eyebrow?.trim()
        const t = s.type

        if (t === 'hero' || t === 'hero-split') {
          const split = t === 'hero-split'
          const bg = dark
            ? `radial-gradient(500px 260px at 12% -10%, ${withAlpha(primary, 0.5)}, transparent 60%), radial-gradient(400px 220px at 100% 0%, ${withAlpha(accent, 0.35)}, transparent 55%), ${background}`
            : `radial-gradient(480px 240px at 12% -10%, ${withAlpha(primary, 0.2)}, transparent 60%), ${background}`
          return (
            <div key={i} style={{ background: bg, padding: 28 }}>
              <div style={{ display: split ? 'grid' : 'block', gridTemplateColumns: split ? '1.1fr 0.9fr' : undefined, gap: 18, alignItems: 'center' }}>
                <div>
                  {eyebrow && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent, marginBottom: 8 }}>{eyebrow}</div>}
                  {heading && <div style={{ ...h, fontSize: 30, fontWeight: 900, lineHeight: 1.05 }}>{heading}</div>}
                  {sub && <div style={{ fontSize: 14, color: muted, marginTop: 10, lineHeight: 1.5 }}>{sub}</div>}
                  {(s.cta || s.ctaSecondary) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                      {s.cta && <span style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff', fontWeight: 800, fontSize: 12, padding: '9px 16px', borderRadius: 9 }}>{s.cta}</span>}
                      {s.ctaSecondary && <span style={{ color: text, fontWeight: 700, fontSize: 12, padding: '9px 14px', borderRadius: 9, border: `1px solid ${withAlpha(text, 0.25)}` }}>{s.ctaSecondary}</span>}
                    </div>
                  )}
                </div>
                {split && (
                  <div style={{ borderRadius: 14, minHeight: 120, background: `linear-gradient(135deg, ${withAlpha(primary, 0.9)}, ${withAlpha(accent, 0.8)})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: displayFont, fontWeight: 800, fontSize: 14, padding: 16, textAlign: 'center' }}>
                    {body || heading}
                  </div>
                )}
              </div>
            </div>
          )
        }

        if (t === 'feature-grid' && Array.isArray(s.items) && s.items.length > 0) {
          return (
            <div key={i} style={{ padding: 28 }}>
              {heading && <div style={{ ...h, fontSize: 20, textAlign: 'center', marginBottom: 16 }}>{heading}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                {s.items.map((it, j) => (
                  <div key={j} style={{ background: surface, border: `1px solid ${withAlpha(text, 0.08)}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg, ${primary}, ${accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginBottom: 10 }}>{it.icon || '◆'}</div>
                    {it.title && <div style={{ fontFamily: displayFont, fontSize: 14, fontWeight: 800, marginBottom: 5 }}>{it.title}</div>}
                    {it.body && <div style={{ color: muted, fontSize: 12, lineHeight: 1.5 }}>{it.body}</div>}
                  </div>
                ))}
              </div>
            </div>
          )
        }

        if (t === 'stats' && Array.isArray(s.stats) && s.stats.length > 0) {
          return (
            <div key={i} style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff', padding: 24, display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(90px, 1fr))`, gap: 14, textAlign: 'center' }}>
              {s.stats.map((st, j) => (
                <div key={j}>
                  <div style={{ fontFamily: displayFont, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{st.value}</div>
                  <div style={{ fontSize: 11, opacity: 0.9, marginTop: 5 }}>{st.label}</div>
                </div>
              ))}
            </div>
          )
        }

        if (t === 'video') {
          return (
            <div key={i} style={{ padding: 28, background: surface, textAlign: 'center' }}>
              {heading && <div style={{ ...h, fontSize: 18, marginBottom: 12 }}>{heading}</div>}
              <div style={{ borderRadius: 12, paddingTop: '52%', position: 'relative', background: '#000', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
                  🎬 Video {s.videoUrl ? 'ready' : 'will be generated on publish'}
                </div>
              </div>
            </div>
          )
        }

        if (t === 'cta') {
          return (
            <div key={i} style={{ padding: 28 }}>
              <div style={{ borderRadius: 16, padding: 28, textAlign: 'center', background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff' }}>
                {heading && <div style={{ ...h, fontSize: 20, color: '#fff' }}>{heading}</div>}
                {sub && <div style={{ fontSize: 13, opacity: 0.95, marginTop: 8 }}>{sub}</div>}
                {s.cta && <div style={{ marginTop: 14 }}><span style={{ background: '#fff', color: primary, fontWeight: 800, fontSize: 12, padding: '9px 18px', borderRadius: 9 }}>{s.cta}</span></div>}
              </div>
            </div>
          )
        }

        if (t === 'contact') {
          return (
            <div key={i} style={{ padding: 28, background: surface, textAlign: 'center' }}>
              {heading && <div style={{ ...h, fontSize: 18 }}>{heading}</div>}
              {body && <div style={{ color: muted, fontSize: 13, margin: '10px 0', lineHeight: 1.5 }}>{body}</div>}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', fontSize: 13, fontWeight: 700 }}>
                {s.email && <span style={{ color: primary }}>✉ {s.email}</span>}
                {s.phone && <span style={{ color: primary }}>☎ {s.phone}</span>}
              </div>
            </div>
          )
        }

        // about / text / default
        return (
          <div key={i} style={{ padding: 28, textAlign: 'center' }}>
            {eyebrow && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent, marginBottom: 8 }}>{eyebrow}</div>}
            {heading && <div style={{ ...h, fontSize: 18, marginBottom: 10 }}>{heading}</div>}
            {body && <div style={{ color: muted, fontSize: 13, lineHeight: 1.6 }}>{body}</div>}
          </div>
        )
      })}
    </div>
  )
}
