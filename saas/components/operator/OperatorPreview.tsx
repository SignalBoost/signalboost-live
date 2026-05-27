'use client'

// Rich preview that mirrors the published renderer (saas/app/s/[handle]/page.tsx).
// Shows the REAL design (theme, fonts, palette, hero/section styles) so the
// preview matches what will publish. Scaled down to fit a dashboard card.

import { useEffect } from 'react'

type Palette = { primary?: string; accent?: string; background?: string; surface?: string; text?: string; muted?: string }
type FeatureItem = { title?: string; body?: string; icon?: string }
type StatItem = { value?: string; label?: string }
type Testimonial = { quote?: string; author?: string; role?: string }
type Section = {
  type: string; eyebrow?: string; heading?: string; subheading?: string; body?: string
  cta?: string; ctaSecondary?: string; items?: FeatureItem[]; stats?: StatItem[]
  testimonials?: Testimonial[]; videoUrl?: string; email?: string; phone?: string; address?: string
}
export type SitePreviewContent = {
  businessName?: string
  theme?: 'light' | 'dark'
  fonts?: { display?: string; body?: string }
  palette?: Palette
  sections?: Section[]
}

const FONT_HREF: Record<string, string> = {
  'Fraunces': 'Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900',
  'Playfair Display': 'Playfair+Display:wght@400;600;800',
  'Bricolage Grotesque': 'Bricolage+Grotesque:wght@400;600;800',
  'Space Grotesk': 'Space+Grotesk:wght@400;600;700',
  'Syne': 'Syne:wght@400;600;800',
  'Sora': 'Sora:wght@400;600;800',
  'DM Serif Display': 'DM+Serif+Display:ital@0;1',
  'Archivo': 'Archivo:wght@400;600;800',
  'Unbounded': 'Unbounded:wght@400;600;800',
  'DM Sans': 'DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700',
  'Manrope': 'Manrope:wght@400;500;700',
  'Work Sans': 'Work+Sans:wght@400;500;600',
  'Outfit': 'Outfit:wght@400;500;600',
  'Spline Sans': 'Spline+Sans:wght@400;500;600',
  'Newsreader': 'Newsreader:opsz,wght@6..72,400;6..72,500',
  'IBM Plex Sans': 'IBM+Plex+Sans:wght@400;500;600',
}

function withAlpha(color: string, alpha: number): string {
  if (!color || color[0] !== '#') return color
  let hex = color.slice(1)
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('')
  if (hex.length !== 6) return color
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function useFonts(content: SitePreviewContent) {
  useEffect(() => {
    const fams: string[] = []
    for (const f of [content.fonts?.display, content.fonts?.body]) {
      if (f && FONT_HREF[f]) fams.push(FONT_HREF[f])
    }
    if (fams.length === 0) return
    const id = 'sb-preview-fonts'
    let link = document.getElementById(id) as HTMLLinkElement | null
    const href = `https://fonts.googleapis.com/css2?${fams.map(f => `family=${f}`).join('&')}&display=swap`
    if (!link) {
      link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    link.href = href
  }, [content.fonts?.display, content.fonts?.body])
}

export default function SitePreview({ content }: { content: SitePreviewContent }) {
  useFonts(content)
  const dark = content.theme === 'dark'
  const p = content.palette || {}
  const primary = p.primary || (dark ? '#7c5cff' : '#1d4ed8')
  const accent = p.accent || (dark ? '#22d3ee' : '#f59e0b')
  const background = p.background || (dark ? '#0a0a12' : '#ffffff')
  const surface = p.surface || (dark ? 'rgba(255,255,255,0.04)' : '#f6f7fb')
  const text = p.text || (dark ? '#f3f4f8' : '#15161c')
  const muted = p.muted || (dark ? 'rgba(243,244,248,0.65)' : 'rgba(21,22,28,0.62)')
  const display = content.fonts?.display ? `'${content.fonts.display}', Georgia, serif` : 'Georgia, serif'
  const bodyFont = content.fonts?.body ? `'${content.fonts.body}', -apple-system, sans-serif` : '-apple-system, sans-serif'
  const sections = Array.isArray(content.sections) ? content.sections : []

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background, color: text, fontFamily: bodyFont, maxHeight: '70vh', overflowY: 'auto' }}>
      {sections.map((s, i) => {
        const h = s.heading?.trim(); const sub = s.subheading?.trim(); const body = s.body?.trim(); const eb = s.eyebrow?.trim()
        const eyebrow = eb ? <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent, marginBottom: 8 }}>{eb}</div> : null

        if (s.type === 'hero' || s.type === 'hero-split') {
          const heroBg = dark
            ? `radial-gradient(500px 260px at 15% -10%, ${withAlpha(primary, 0.45)}, transparent 60%), radial-gradient(400px 220px at 100% 0%, ${withAlpha(accent, 0.3)}, transparent 55%), ${background}`
            : `radial-gradient(500px 260px at 12% -10%, ${withAlpha(primary, 0.18)}, transparent 60%), ${background}`
          return (
            <div key={i} style={{ background: heroBg, padding: '40px 24px', textAlign: 'center' }}>
              {eyebrow}
              {h && <div style={{ fontFamily: display, fontWeight: 900, fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{h}</div>}
              {sub && <div style={{ color: muted, fontSize: 14, marginTop: 12, lineHeight: 1.5, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>{sub}</div>}
              {(s.cta || s.ctaSecondary) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {s.cta && <span style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 20px', borderRadius: 10 }}>{s.cta}</span>}
                  {s.ctaSecondary && <span style={{ color: text, fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 10, border: `1px solid ${withAlpha(text, 0.25)}` }}>{s.ctaSecondary}</span>}
                </div>
              )}
            </div>
          )
        }
        if (s.type === 'feature-grid' && Array.isArray(s.items) && s.items.length > 0) {
          return (
            <div key={i} style={{ padding: '32px 24px' }}>
              {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20, textAlign: 'center', marginBottom: 18 }}>{h}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                {s.items.map((it, j) => (
                  <div key={j} style={{ background: surface, border: `1px solid ${withAlpha(text, 0.08)}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${primary}, ${accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginBottom: 10 }}>{it.icon || '◆'}</div>
                    {it.title && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 14 }}>{it.title}</div>}
                    {it.body && <div style={{ color: muted, fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{it.body}</div>}
                  </div>
                ))}
              </div>
            </div>
          )
        }
        if (s.type === 'stats' && Array.isArray(s.stats) && s.stats.length > 0) {
          return (
            <div key={i} style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff', padding: '28px 24px', display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(90px, 1fr))`, gap: 14, textAlign: 'center' }}>
              {s.stats.map((st, j) => (
                <div key={j}>
                  <div style={{ fontFamily: display, fontWeight: 900, fontSize: 26, lineHeight: 1 }}>{st.value}</div>
                  <div style={{ fontSize: 11, opacity: 0.9, marginTop: 4 }}>{st.label}</div>
                </div>
              ))}
            </div>
          )
        }
        if (s.type === 'video') {
          return (
            <div key={i} style={{ padding: '32px 24px', textAlign: 'center', background: dark ? background : surface }}>
              {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 18, marginBottom: 12 }}>{h}</div>}
              <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ position: 'absolute', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>🎬 Video</span>
              </div>
            </div>
          )
        }
        if (s.type === 'cta') {
          return (
            <div key={i} style={{ padding: '24px' }}>
              <div style={{ borderRadius: 16, padding: '28px 22px', textAlign: 'center', background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff' }}>
                {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20 }}>{h}</div>}
                {sub && <div style={{ fontSize: 13, opacity: 0.95, marginTop: 6 }}>{sub}</div>}
                {s.cta && <div style={{ marginTop: 14 }}><span style={{ background: '#fff', color: primary, fontWeight: 800, fontSize: 13, padding: '10px 22px', borderRadius: 10 }}>{s.cta}</span></div>}
              </div>
            </div>
          )
        }
        if (s.type === 'contact') {
          return (
            <div key={i} style={{ padding: '32px 24px', textAlign: 'center', background: dark ? surface : '#f6f7fb' }}>
              {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20 }}>{h}</div>}
              {body && <div style={{ color: muted, fontSize: 13, margin: '10px 0 14px', lineHeight: 1.5 }}>{body}</div>}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', fontSize: 13, fontWeight: 700, color: primary }}>
                {s.email && <span>✉ {s.email}</span>}
                {s.phone && <span>☎ {s.phone}</span>}
              </div>
            </div>
          )
        }
        // about / text / fallback
        return (
          <div key={i} style={{ padding: '28px 24px', textAlign: 'center' }}>
            {eyebrow}
            {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{h}</div>}
            {body && <div style={{ color: muted, fontSize: 13, lineHeight: 1.6 }}>{body}</div>}
          </div>
        )
      })}
    </div>
  )
}
