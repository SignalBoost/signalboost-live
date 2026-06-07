'use client'

// Rich preview that mirrors the published renderer (saas/app/s/[handle]/page.tsx).

import { useEffect } from 'react'

type Palette = { primary?: string; accent?: string; background?: string; surface?: string; text?: string; muted?: string }
type MediaAsset = { url?: string; alt?: string; caption?: string; overlay?: string }
type FeatureItem = { title?: string; body?: string; role?: string; icon?: string; size?: string; image?: MediaAsset; logo?: MediaAsset; imageUrl?: string; image_url?: string; logoUrl?: string; logo_url?: string }
type GalleryItem = FeatureItem & { wiki_url?: string }
type StatItem = { value?: string; label?: string }
type Testimonial = { quote?: string; author?: string; role?: string }
type Section = {
  type: string; layout?: string; eyebrow?: string; heading?: string; subheading?: string; body?: string
  cta?: string; ctaSecondary?: string; heroImage?: MediaAsset; backgroundImage?: MediaAsset; posterImage?: MediaAsset
  heroImageUrl?: string; hero_image_url?: string; backgroundImageUrl?: string; background_image_url?: string; posterImageUrl?: string; poster_image_url?: string
  items?: (FeatureItem | GalleryItem)[]; stats?: StatItem[]
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


function mediaUrl(asset?: MediaAsset, fallback?: string): string | undefined {
  const url = asset?.url || fallback
  return typeof url === 'string' && url.trim() ? url.trim() : undefined
}

function itemImageUrl(item: FeatureItem | GalleryItem): string | undefined {
  return mediaUrl(item.image, item.imageUrl || item.image_url)
}

function itemLogoUrl(item: FeatureItem | GalleryItem): string | undefined {
  return mediaUrl(item.logo, item.logoUrl || item.logo_url)
}

function tileSpan(size?: string): string | undefined {
  if (size === 'featured' || size === 'wide' || size === 'lg') return 'span 2'
  return undefined
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

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background, color: text, fontFamily: bodyFont, maxHeight: '70vh', overflowY: 'auto' }}>
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
          const heroImage = mediaUrl(s.heroImage, s.heroImageUrl || s.hero_image_url)
          const backgroundImage = mediaUrl(s.backgroundImage, s.backgroundImageUrl || s.background_image_url)
          const split = s.type === 'hero-split' || Boolean(heroImage)
          const heroBg = dark
            ? `radial-gradient(500px 260px at 15% -10%, ${withAlpha(primary, 0.45)}, transparent 60%), radial-gradient(400px 220px at 100% 0%, ${withAlpha(accent, 0.3)}, transparent 55%), ${background}`
            : `radial-gradient(500px 260px at 12% -10%, ${withAlpha(primary, 0.18)}, transparent 60%), ${background}`
          return (
            <div key={i} style={{ background: heroBg, padding: '40px 24px', textAlign: split ? 'left' : 'center', position: 'relative', overflow: 'hidden' }}>
              {backgroundImage && <img src={backgroundImage} alt={s.backgroundImage?.alt || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: dark ? 0.24 : 0.18 }} />}
              <div style={{ position: 'relative', display: split ? 'grid' : 'block', gridTemplateColumns: split ? '1.05fr 0.95fr' : undefined, gap: 18, alignItems: 'center' }}>
                <div>
                  {eyebrow}
                  {h && <div style={{ fontFamily: display, fontWeight: 900, fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{h}</div>}
                  {sub && <div style={{ color: muted, fontSize: 14, marginTop: 12, lineHeight: 1.5, maxWidth: 420, marginLeft: split ? 0 : 'auto', marginRight: split ? 0 : 'auto' }}>{sub}</div>}
                  {(s.cta || s.ctaSecondary) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: split ? 'flex-start' : 'center', flexWrap: 'wrap' }}>
                      {s.cta && <span style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 20px', borderRadius: 10 }}>{s.cta}</span>}
                      {s.ctaSecondary && <span style={{ color: text, fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 10, border: `1px solid ${withAlpha(text, 0.25)}` }}>{s.ctaSecondary}</span>}
                    </div>
                  )}
                </div>
                {split && (
                  <div style={{ minHeight: 210, borderRadius: 16, overflow: 'hidden', position: 'relative', background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff', display: 'flex', alignItems: 'flex-end', padding: 18, fontFamily: display, fontWeight: 900, fontSize: 20 }}>
                    {heroImage && <img src={heroImage} alt={s.heroImage?.alt || h || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    <div style={{ position: 'absolute', inset: 0, background: heroImage ? 'linear-gradient(180deg, transparent, rgba(0,0,0,.5))' : `radial-gradient(circle at 20% 10%, ${withAlpha('#ffffff', 0.35)}, transparent 35%)` }} />
                    <span style={{ position: 'relative' }}>{s.heroImage?.caption || body || h}</span>
                  </div>
                )}
              </div>
            </div>
          )
        }

        // ── Feature grid / bento ─────────────────────────────────────────
        if ((s.type === 'feature-grid' || s.type === 'bento') && Array.isArray(s.items) && s.items.length > 0) {
          const bento = s.type === 'bento' || s.layout === 'bento' || s.layout === 'mosaic'
          return (
            <div key={i} style={{ padding: '32px 24px', position: 'relative', overflow: 'hidden' }}>
              {mediaUrl(s.backgroundImage, s.backgroundImageUrl || s.background_image_url) && <img src={mediaUrl(s.backgroundImage, s.backgroundImageUrl || s.background_image_url)} alt={s.backgroundImage?.alt || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: dark ? 0.18 : 0.12 }} />}
              <div style={{ position: 'relative' }}>
                {eyebrow}
                {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20, textAlign: 'center', marginBottom: 18 }}>{h}</div>}
                {sub && <div style={{ color: muted, fontSize: 12, lineHeight: 1.5, textAlign: 'center', maxWidth: 440, margin: '-10px auto 18px' }}>{sub}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: bento ? 'repeat(auto-fit, minmax(130px, 1fr))' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                  {(s.items as FeatureItem[]).map((it, j) => {
                    const image = itemImageUrl(it)
                    const logo = itemLogoUrl(it)
                    return (
                      <div key={j} style={{ gridColumn: bento ? tileSpan(it.size) : undefined, minHeight: bento && (it.size === 'featured' || it.size === 'tall') ? 220 : undefined, background: surface, border: `1px solid ${withAlpha(text, 0.08)}`, borderRadius: 12, padding: image ? 0 : 16, overflow: 'hidden' }}>
                        {image ? (
                          <div style={{ minHeight: 150, position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 14, color: '#fff' }}>
                            <img src={image} alt={it.image?.alt || it.title || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent, rgba(0,0,0,.55))' }} />
                            <div style={{ position: 'relative' }}>{it.title && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 14 }}>{it.title}</div>}{it.body && <div style={{ fontSize: 11, lineHeight: 1.4, opacity: .9 }}>{it.body}</div>}</div>
                          </div>
                        ) : (
                          <>
                            <div style={{ width: 34, height: 34, borderRadius: 9, background: logo ? '#fff' : `linear-gradient(135deg, ${primary}, ${accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginBottom: 10, overflow: 'hidden' }}>{logo ? <img src={logo} alt={it.logo?.alt || it.title || ''} style={{ width: '80%', height: '80%', objectFit: 'contain' }} /> : it.icon || '◆'}</div>
                            {it.title && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 14 }}>{it.title}</div>}
                            {it.body  && <div style={{ color: muted, fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{it.body}</div>}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
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
                    {/* Image — show if available, otherwise a colored placeholder */}
                    {itemImageUrl(it) ? (
                      <img
                        src={itemImageUrl(it)}
                        alt={it.image?.alt || it.title || ''}
                        style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div style={{
                        width: '100%', height: 100,
                        background: `linear-gradient(135deg, ${withAlpha(primary, 0.3)}, ${withAlpha(accent, 0.3)})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 28,
                      }}>
                        🏛️
                      </div>
                    )}
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

        // ── Team / sponsors / logo cloud ───────────────────────────────────
        if ((s.type === 'team' || s.type === 'sponsors' || s.type === 'logo-cloud') && Array.isArray(s.items) && s.items.length > 0) {
          const team = s.type === 'team'
          return (
            <div key={i} style={{ padding: '32px 24px', textAlign: 'center', background: dark ? surface : '#f6f7fb' }}>
              {eyebrow}
              {h && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20, marginBottom: 16 }}>{h}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${team ? 120 : 100}px, 1fr))`, gap: 12 }}>
                {(s.items as FeatureItem[]).map((it, j) => {
                  const logo = itemLogoUrl(it) || itemImageUrl(it)
                  return (
                    <div key={j} style={{ background, border: `1px solid ${withAlpha(text, 0.08)}`, borderRadius: 14, padding: 14, minHeight: team ? 150 : 96, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      {logo ? <img src={logo} alt={it.logo?.alt || it.image?.alt || it.title || ''} style={{ width: team ? 64 : 78, height: team ? 64 : 42, objectFit: team ? 'cover' : 'contain', borderRadius: team ? '50%' : 8, marginBottom: 8 }} /> : <div style={{ width: team ? 64 : 46, height: team ? 64 : 42, borderRadius: team ? '50%' : 10, background: `linear-gradient(135deg, ${primary}, ${accent})`, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{it.icon || (team ? '👤' : '✦')}</div>}
                      {it.title && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 13 }}>{it.title}</div>}
                      {(it.role || it.body) && <div style={{ color: muted, fontSize: 11, lineHeight: 1.4, marginTop: 3 }}>{it.role || it.body}</div>}
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
