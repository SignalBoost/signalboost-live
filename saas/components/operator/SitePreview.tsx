'use client'

// Rich preview that mirrors the published renderer (saas/app/s/[handle]/page.tsx).

import { useEffect } from 'react'

type Palette = { primary?: string; accent?: string; background?: string; surface?: string; text?: string; muted?: string }
type FeatureItem = { title?: string; body?: string; icon?: string; image_url?: string; logo_url?: string; imageAlt?: string; logoAlt?: string }
type GalleryItem = { title?: string; body?: string; image_url?: string; logo_url?: string; imageAlt?: string; logoAlt?: string; wiki_url?: string }
type StatItem = { value?: string; label?: string }
type Testimonial = { quote?: string; author?: string; role?: string }
type Section = {
  type: string; eyebrow?: string; heading?: string; subheading?: string; body?: string
  cta?: string; ctaSecondary?: string; items?: (FeatureItem | GalleryItem)[]; stats?: StatItem[]
  testimonials?: Testimonial[]; videoUrl?: string; email?: string; phone?: string; address?: string
  image_url?: string; imageAlt?: string
}
export type SitePreviewContent = {
  businessName?: string
  theme?: 'light' | 'dark'
  fonts?: { display?: string; body?: string }
  palette?: Palette
  sections?: Section[]
  logo_url?: string
  logoAlt?: string
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


function hideBrokenImage(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none'
}

function toEmbedUrl(url?: string): string | null {
  if (!url || typeof url !== 'string') return null

  const u = url.trim()
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`

  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`

  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(u)) return u
  if (/\/embed\//.test(u) || /player\./.test(u)) return u

  return null
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
  const primary    = p.primary    || (dark ? '#7c5cff' : '#1d4ed8')
  const accent     = p.accent     || (dark ? '#22d3ee' : '#f59e0b')
  const background = p.background || (dark ? '#0a0a12' : '#ffffff')
  const surface    = p.surface    || (dark ? 'rgba(255,255,255,0.04)' : '#f6f7fb')
  const text       = p.text       || (dark ? '#f3f4f8' : '#15161c')
  const muted      = p.muted      || (dark ? 'rgba(243,244,248,0.65)' : 'rgba(21,22,28,0.62)')
  const display    = content.fonts?.display ? `'${content.fonts.display}', Georgia, serif` : 'Georgia, serif'
  const bodyFont   = content.fonts?.body    ? `'${content.fonts.body}', -apple-system, sans-serif` : '-apple-system, sans-serif'
  const sections   = Array.isArray(content.sections) ? content.sections : []
  const heroImageUrl = sections.find(section => (section.type === 'hero' || section.type === 'hero-split') && section.image_url)?.image_url || ''
  const galleryImageUrls = sections.flatMap(section => (section.type === 'gallery' || section.type === 'bento' || section.type === 'team' || section.type === 'feature-grid') && Array.isArray(section.items) ? section.items.map(item => item.image_url).filter(Boolean) as string[] : [])
  const logoImageUrls = [content.logo_url, ...sections.flatMap(section => /logo|sponsor|partner/i.test(section.type) && Array.isArray(section.items) ? section.items.map(item => item.logo_url || item.image_url).filter(Boolean) as string[] : [])].filter(Boolean) as string[]
  const firstImageUrls = [heroImageUrl, ...galleryImageUrls, ...logoImageUrls].filter(Boolean).slice(0, 3)
  const mediaDetected = Boolean(heroImageUrl || galleryImageUrls.length > 0 || logoImageUrls.length > 0)

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background, color: text, fontFamily: bodyFont, maxHeight: '70vh', overflowY: 'auto' }}>
      <div style={{ margin: 12, padding: 12, borderRadius: 12, border: `1px solid ${withAlpha(text, 0.14)}`, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)', color: text, fontSize: 11, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Media debug</div>
        <div>mediaDetected: {mediaDetected ? 'yes' : 'no'}</div>
        <div>hero image URL: {heroImageUrl || 'none'}</div>
        <div>gallery images: {galleryImageUrls.length}</div>
        <div>logo images: {logoImageUrls.length}</div>
        <div>first 3 image URLs:</div>
        <ol style={{ margin: '4px 0 0 18px', padding: 0, wordBreak: 'break-all' }}>
          {firstImageUrls.length > 0 ? firstImageUrls.map((url, index) => <li key={index}>{url}</li>) : <li>none</li>}
        </ol>
      </div>
      {sections.map((s, i) => {
        const h    = s.heading?.trim()
        const sub  = s.subheading?.trim()
        const body = s.body?.trim()
        const eb   = s.eyebrow?.trim()
        const eyebrow = eb ? (
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent, marginBottom: 8 }}>
            {eb}
          </div>
        ) : null

        // ── Hero ──────────────────────────────────────────────────────────
        if (s.type === 'hero' || s.type === 'hero-split') {
          const heroBg = dark
            ? `radial-gradient(500px 260px at 15% -10%, ${withAlpha(primary, 0.45)}, transparent 60%), radial-gradient(400px 220px at 100% 0%, ${withAlpha(accent, 0.3)}, transparent 55%), ${background}`
            : `radial-gradient(500px 260px at 12% -10%, ${withAlpha(primary, 0.18)}, transparent 60%), ${background}`
          const hasImage = Boolean(s.image_url)
          return (
            <div key={i} style={{ background: heroBg, padding: '40px 24px', textAlign: hasImage ? 'left' : 'center' }}>
              <div style={{ display: hasImage ? 'grid' : 'block', gridTemplateColumns: hasImage ? '1fr minmax(160px, 0.85fr)' : undefined, gap: 18, alignItems: 'center' }}>
                <div>
                  {content.logo_url && i === 0 && <img src={content.logo_url} alt={content.logoAlt || `${content.businessName || 'Site'} logo`} style={{ width: 42, height: 42, borderRadius: 12, marginBottom: 12, objectFit: 'cover' }} onError={hideBrokenImage} />}
                  {eyebrow}
                  {h && <div style={{ fontFamily: display, fontWeight: 900, fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{h}</div>}
                  {sub && <div style={{ color: muted, fontSize: 14, marginTop: 12, lineHeight: 1.5, maxWidth: 420, marginLeft: hasImage ? 0 : 'auto', marginRight: hasImage ? 0 : 'auto' }}>{sub}</div>}
                  {(s.cta || s.ctaSecondary) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: hasImage ? 'flex-start' : 'center', flexWrap: 'wrap' }}>
                      {s.cta && <span style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 20px', borderRadius: 10 }}>{s.cta}</span>}
                      {s.ctaSecondary && <span style={{ color: text, fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 10, border: `1px solid ${withAlpha(text, 0.25)}` }}>{s.ctaSecondary}</span>}
                    </div>
                  )}
                </div>
                {hasImage && (
                  <div style={{ minHeight: 180, borderRadius: 18, overflow: 'hidden', background: `linear-gradient(135deg, ${withAlpha(primary, 0.32)}, ${withAlpha(accent, 0.32)})` }}>
                    <img src={s.image_url} alt={s.imageAlt || h || ''} style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} onError={hideBrokenImage} />
                  </div>
                )}
              </div>
            </div>
          )
        }

        // ── Feature grid ──────────────────────────────────────────────────
        if (s.type === 'feature-grid' && Array.isArray(s.items) && s.items.length > 0) {
          return (
            <div key={i} style={{ padding: '32px 24px' }}>
              {eyebrow}
              {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20, textAlign: 'center', marginBottom: 18 }}>{h}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                {(s.items as FeatureItem[]).map((it, j) => (
                  <div key={j} style={{ background: surface, border: `1px solid ${withAlpha(text, 0.08)}`, borderRadius: 12, padding: it.image_url ? 0 : 16, overflow: 'hidden' }}>
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.imageAlt || it.title || ''} style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} onError={hideBrokenImage} />
                    ) : (
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${primary}, ${accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginBottom: 10 }}>
                        {it.icon || '◆'}
                      </div>
                    )}
                    <div style={{ padding: it.image_url ? 12 : 0 }}>
                      {it.title && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 14 }}>{it.title}</div>}
                      {it.body  && <div style={{ color: muted, fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{it.body}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        }

        // ── Gallery — rich cards with image, title, description ───────────
        if (s.type === 'gallery' && Array.isArray(s.items) && s.items.length > 0) {
          return (
            <div key={i} style={{ padding: '32px 24px' }}>
              {eyebrow}
              {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20, textAlign: 'center', marginBottom: 18 }}>{h}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
                {(s.items as GalleryItem[]).map((it, j) => (
                  <div
                    key={j}
                    style={{
                      background: surface,
                      border: `1px solid ${withAlpha(text, 0.08)}`,
                      borderRadius: 14,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div style={{ width: '100%', height: 100, background: surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: muted }}>
                      {it.image_url ? (
                        <img
                          src={it.image_url}
                          alt={it.imageAlt || it.title || ''}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={hideBrokenImage}
                        />
                      ) : 'No image URL'}
                    </div>
                    <div style={{ padding: '10px 12px', flex: 1 }}>
                      {it.title && (
                        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 13, lineHeight: 1.3, marginBottom: 4 }}>
                          {it.title}
                        </div>
                      )}
                      {it.body && (
                        <div style={{ color: muted, fontSize: 11, lineHeight: 1.5 }}>
                          {it.body.slice(0, 100)}{it.body.length > 100 ? '…' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* CC-BY-SA attribution if this is Wikipedia content */}
              <div style={{ marginTop: 12, fontSize: 10, color: muted, textAlign: 'center' }}>
                Content from Wikipedia · CC BY-SA 4.0
              </div>
            </div>
          )
        }

        // ── Logos / sponsors ──────────────────────────────────────────────
        if ((s.type === 'logos' || s.type === 'sponsors') && Array.isArray(s.items) && s.items.length > 0) {
          return (
            <div key={i} style={{ padding: '28px 24px', background: dark ? surface : '#f6f7fb' }}>
              {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 18, textAlign: 'center', marginBottom: 16 }}>{h}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                {(s.items as GalleryItem[]).map((it, j) => {
                  const url = it.logo_url || it.image_url
                  return (
                    <div key={j} style={{ background, border: `1px solid ${withAlpha(text, 0.08)}`, borderRadius: 12, overflow: 'hidden' }}>
                      {url && <img src={url} alt={it.logoAlt || it.imageAlt || it.title || ''} style={{ width: '100%', height: 88, objectFit: 'cover', display: 'block' }} onError={hideBrokenImage} />}
                      {it.title && <div style={{ padding: 10, fontWeight: 800, fontSize: 12 }}>{it.title}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }

        // ── Stats ─────────────────────────────────────────────────────────
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

        // ── Video ─────────────────────────────────────────────────────────
        if (s.type === 'video') {
          const embed = toEmbedUrl(s.videoUrl)
          return (
            <div key={i} style={{ padding: '32px 24px', textAlign: 'center', background: dark ? background : surface }}>
              {eyebrow}
              {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 18, marginBottom: sub || body ? 8 : 12 }}>{h}</div>}
              {sub && <div style={{ color: muted, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>{sub}</div>}
              <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: `linear-gradient(135deg, ${withAlpha(primary, 0.9)}, ${withAlpha(accent, 0.9)})` }}>
                {embed ? (
                  /\.(mp4|webm|ogg)(\?.*)?$/i.test(embed) ? (
                    <video src={embed} controls style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <iframe src={embed} title={h || 'SignalBoost video preview'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
                  )
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#fff', padding: 20 }}>
                    <span style={{ fontSize: 28, lineHeight: 1 }}>🎬</span>
                    <span style={{ fontFamily: display, fontWeight: 800, fontSize: 15 }}>{h || 'Brand story video'}</span>
                    {body && <span style={{ maxWidth: 320, fontSize: 11, lineHeight: 1.5, opacity: 0.85 }}>{body}</span>}
                  </div>
                )}
              </div>
            </div>
          )
        }

        // ── Testimonials ──────────────────────────────────────────────────
        if (s.type === 'testimonials' && Array.isArray(s.testimonials) && s.testimonials.length > 0) {
          return (
            <div key={i} style={{ padding: '32px 24px', background: dark ? surface : '#f6f7fb' }}>
              {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 18, textAlign: 'center', marginBottom: 16 }}>{h}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {s.testimonials.map((tm, j) => (
                  <div key={j} style={{ background, border: `1px solid ${withAlpha(text, 0.08)}`, borderRadius: 12, padding: 16 }}>
                    {tm.quote && <div style={{ color: muted, fontSize: 13, lineHeight: 1.6, fontStyle: 'italic', marginBottom: 10 }}>"{tm.quote}"</div>}
                    {tm.author && <div style={{ fontWeight: 700, fontSize: 12 }}>{tm.author}</div>}
                    {tm.role   && <div style={{ color: accent, fontSize: 11 }}>{tm.role}</div>}
                  </div>
                ))}
              </div>
            </div>
          )
        }

        // ── CTA ───────────────────────────────────────────────────────────
        if (s.type === 'cta') {
          return (
            <div key={i} style={{ padding: '24px' }}>
              <div style={{ borderRadius: 16, padding: '28px 22px', textAlign: 'center', background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff' }}>
                {h   && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20 }}>{h}</div>}
                {sub && <div style={{ fontSize: 13, opacity: 0.95, marginTop: 6 }}>{sub}</div>}
                {s.cta && <div style={{ marginTop: 14 }}><span style={{ background: '#fff', color: primary, fontWeight: 800, fontSize: 13, padding: '10px 22px', borderRadius: 10 }}>{s.cta}</span></div>}
              </div>
            </div>
          )
        }

        // ── Contact ───────────────────────────────────────────────────────
        if (s.type === 'contact') {
          return (
            <div key={i} style={{ padding: '32px 24px', textAlign: 'center', background: dark ? surface : '#f6f7fb' }}>
              {eyebrow}
              {h    && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20 }}>{h}</div>}
              {body && <div style={{ color: muted, fontSize: 13, margin: '10px 0 14px', lineHeight: 1.5 }}>{body}</div>}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', fontSize: 13, fontWeight: 700, color: primary }}>
                {s.email && <span>✉ {s.email}</span>}
                {s.phone && <span>☎ {s.phone}</span>}
              </div>
            </div>
          )
        }

        // ── About / text / fallback ───────────────────────────────────────
        return (
          <div key={i} style={{ padding: '28px 24px', textAlign: 'center' }}>
            {eyebrow}
            {h    && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{h}</div>}
            {body && <div style={{ color: muted, fontSize: 13, lineHeight: 1.6 }}>{body}</div>}
          </div>
        )
      })}
    </div>
  )
}
