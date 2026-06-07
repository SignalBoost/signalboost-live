// saas/app/s/[handle]/page.tsx
// Rich public website renderer — a design engine.
// The AI (content generator) decides the aesthetic: theme (light/dark),
// font pairing, palette, media, and an ordered list of rich section types.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

type Palette = { primary?: string; accent?: string; background?: string; surface?: string; text?: string; muted?: string }
type MediaAsset = { url?: string; alt?: string; caption?: string; overlay?: string }
type ContentItem = {
  title?: string
  body?: string
  role?: string
  icon?: string
  size?: 'sm' | 'md' | 'lg' | 'wide' | 'tall' | 'featured' | string
  image?: MediaAsset
  logo?: MediaAsset
  imageUrl?: string
  image_url?: string
  logoUrl?: string
  logo_url?: string
  wiki_url?: string
}
type StatItem = { value?: string; label?: string }
type Testimonial = { quote?: string; author?: string; role?: string }
type Section = {
  type: string
  variant?: string
  layout?: 'grid' | 'mosaic' | 'bento' | string
  eyebrow?: string
  heading?: string
  subheading?: string
  body?: string
  cta?: string
  ctaSecondary?: string
  heroImage?: MediaAsset
  backgroundImage?: MediaAsset
  posterImage?: MediaAsset
  heroImageUrl?: string
  hero_image_url?: string
  backgroundImageUrl?: string
  background_image_url?: string
  posterImageUrl?: string
  poster_image_url?: string
  items?: ContentItem[]
  stats?: StatItem[]
  testimonials?: Testimonial[]
  videoUrl?: string
  email?: string
  phone?: string
  address?: string
}
type FontPair = { display?: string; body?: string }
type SiteContent = {
  businessName?: string
  theme?: 'light' | 'dark'
  fonts?: FontPair
  palette?: Palette
  sections?: Section[]
}

const FONT_SAFE: Record<string, string> = {
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

function fontStack(name: string | undefined, fallback: string): string {
  if (!name) return fallback
  return `'${name}', ${fallback}`
}

function buildGoogleFontsHref(fonts: FontPair): string | null {
  const families: string[] = []
  for (const f of [fonts.display, fonts.body]) {
    if (f && FONT_SAFE[f]) families.push(FONT_SAFE[f])
  }
  if (families.length === 0) return null
  return `https://fonts.googleapis.com/css2?${families.map(f => `family=${f}`).join('&')}&display=swap`
}

async function getSite(handle: string) {
  const supabase = getAdminSupabase()
  const { data, error } = await supabase
    .from('projects')
    .select('name, content, status, handle, language')
    .eq('handle', handle)
    .eq('status', 'live')
    .maybeSingle()
  if (error || !data || !data.content) return null
  return data as { name: string; content: SiteContent; status: string; handle: string; language: string }
}

export async function generateMetadata(
  { params }: { params: Promise<{ handle: string }> }
): Promise<Metadata> {
  const { handle } = await params
  const site = await getSite(handle)
  if (!site) return { title: 'Site not found' }
  const c = site.content
  const firstHeading = c.sections?.find(s => s.heading)?.heading
  const hero = c.sections?.find(s => s.type === 'hero' || s.type === 'hero-split')
  return {
    title: c.businessName || firstHeading || site.name,
    description: c.sections?.find(s => s.subheading || s.body)?.subheading || undefined,
    openGraph: mediaUrl(hero?.heroImage, hero?.heroImageUrl || hero?.hero_image_url) ? { images: [mediaUrl(hero?.heroImage, hero?.heroImageUrl || hero?.hero_image_url)!] } : undefined,
  }
}

function resolveTheme(c: SiteContent) {
  const dark = c.theme === 'dark'
  const p = c.palette || {}
  const primary = p.primary || (dark ? '#7c5cff' : '#1d4ed8')
  const accent = p.accent || (dark ? '#22d3ee' : '#f59e0b')
  const background = p.background || (dark ? '#0a0a12' : '#ffffff')
  const surface = p.surface || (dark ? 'rgba(255,255,255,0.04)' : '#f6f7fb')
  const text = p.text || (dark ? '#f3f4f8' : '#15161c')
  const muted = p.muted || (dark ? 'rgba(243,244,248,0.65)' : 'rgba(21,22,28,0.62)')
  return { dark, primary, accent, background, surface, text, muted }
}

function withAlpha(color: string, alpha: number): string {
  if (!color || color[0] !== '#') return color
  let hex = color.slice(1)
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('')
  if (hex.length !== 6) return color
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
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

function itemImageUrl(item: ContentItem): string | undefined {
  return mediaUrl(item.image, item.imageUrl || item.image_url)
}

function itemLogoUrl(item: ContentItem): string | undefined {
  return mediaUrl(item.logo, item.logoUrl || item.logo_url)
}

function sizeStyle(size?: string): CSSProperties {
  if (size === 'featured') return { gridColumn: 'span 2', gridRow: 'span 2', minHeight: 360 }
  if (size === 'wide') return { gridColumn: 'span 2', minHeight: 230 }
  if (size === 'tall') return { gridRow: 'span 2', minHeight: 360 }
  if (size === 'lg') return { gridColumn: 'span 2', minHeight: 280 }
  if (size === 'sm') return { minHeight: 180 }
  return { minHeight: 230 }
}

type Theme = ReturnType<typeof resolveTheme>

function SectionBackground({ section, theme }: { section: Section; theme: Theme }) {
  const url = mediaUrl(section.backgroundImage, section.backgroundImageUrl || section.background_image_url)
  if (!url) return null
  return (
    <>
      <img src={url} alt={section.backgroundImage?.alt || ''} aria-hidden={!section.backgroundImage?.alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: theme.dark ? 0.28 : 0.2 }} />
      <div style={{ position: 'absolute', inset: 0, background: section.backgroundImage?.overlay || `linear-gradient(135deg, ${withAlpha(theme.background, 0.92)}, ${withAlpha(theme.background, 0.76)})` }} />
    </>
  )
}

function MediaPanel({ item, section, theme, displayFont, label }: { item?: ContentItem; section?: Section; theme: Theme; displayFont: string; label?: string }) {
  const { primary, accent } = theme
  const imageUrl = item ? itemImageUrl(item) : mediaUrl(section?.heroImage, section?.heroImageUrl || section?.hero_image_url)
  const logoUrl = item ? itemLogoUrl(item) : undefined
  const title = item?.title || label || section?.heading || 'Visual story'
  const alt = item?.image?.alt || item?.logo?.alt || section?.heroImage?.alt || title
  return (
    <div style={{ position: 'relative', minHeight: '100%', borderRadius: 24, overflow: 'hidden', background: `linear-gradient(135deg, ${withAlpha(primary, 0.92)}, ${withAlpha(accent, 0.85)})`, boxShadow: `0 30px 80px ${withAlpha(primary, 0.35)}` }}>
      {imageUrl && <img src={imageUrl} alt={alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, background: imageUrl ? 'linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.48))' : `radial-gradient(circle at 20% 20%, ${withAlpha('#ffffff', 0.32)}, transparent 28%)` }} />
      <div style={{ position: 'relative', zIndex: 1, minHeight: 320, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 28, color: '#fff' }}>
        {logoUrl && <img src={logoUrl} alt={item?.logo?.alt || title} style={{ width: 76, height: 76, objectFit: 'contain', borderRadius: 18, background: 'rgba(255,255,255,0.9)', padding: 10, marginBottom: 'auto' }} />}
        <div style={{ fontFamily: displayFont, fontWeight: 900, fontSize: 28, lineHeight: 1.05 }}>{title}</div>
        {(item?.body || section?.heroImage?.caption || section?.body) && <div style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.9, marginTop: 10 }}>{item?.body || section?.heroImage?.caption || section?.body}</div>}
      </div>
    </div>
  )
}

function SectionView({ section, theme, displayFont }: { section: Section; theme: Theme; displayFont: string; idx: number }) {
  const { dark, primary, accent, surface, text, muted, background } = theme
  const heading = section.heading?.trim()
  const body = section.body?.trim()
  const sub = section.subheading?.trim()
  const eyebrow = section.eyebrow?.trim()
  const t = section.type

  const headingStyle: CSSProperties = { fontFamily: displayFont, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }
  const eyebrowEl = eyebrow ? (
    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: accent, marginBottom: 14 }}>{eyebrow}</div>
  ) : null
  const hasBg = Boolean(mediaUrl(section.backgroundImage, section.backgroundImageUrl || section.background_image_url))

  if (t === 'hero' || t === 'hero-split') {
    const split = t === 'hero-split' || Boolean(mediaUrl(section.heroImage, section.heroImageUrl || section.hero_image_url))
    const heroBg = dark
      ? `radial-gradient(1200px 600px at 15% -10%, ${withAlpha(primary, 0.45)}, transparent 60%), radial-gradient(900px 500px at 100% 0%, ${withAlpha(accent, 0.30)}, transparent 55%), ${background}`
      : `radial-gradient(1100px 550px at 12% -10%, ${withAlpha(primary, 0.18)}, transparent 60%), radial-gradient(800px 460px at 100% 0%, ${withAlpha(accent, 0.16)}, transparent 55%), ${background}`
    return (
      <section style={{ background: heroBg, color: text, padding: split ? '112px 28px' : '140px 28px', position: 'relative', overflow: 'hidden' }}>
        <SectionBackground section={section} theme={theme} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto', display: split ? 'grid' : 'block', gridTemplateColumns: split ? '1.1fr 0.9fr' : undefined, gap: 48, alignItems: 'center', textAlign: split ? 'left' : 'center' }}>
          <div style={{ maxWidth: split ? 'none' : 860, margin: split ? '0' : '0 auto' }}>
            {eyebrowEl}
            {heading && <h1 style={{ ...headingStyle, fontSize: 'clamp(40px, 7vw, 78px)', fontWeight: 900, lineHeight: 1.02 }}>{heading}</h1>}
            {sub && <p style={{ fontSize: 'clamp(17px, 2.4vw, 23px)', color: muted, lineHeight: 1.5, margin: '20px 0 0', maxWidth: 640, marginLeft: split ? 0 : 'auto', marginRight: split ? 0 : 'auto' }}>{sub}</p>}
            {(section.cta || section.ctaSecondary) && (
              <div style={{ display: 'flex', gap: 14, marginTop: 36, justifyContent: split ? 'flex-start' : 'center', flexWrap: 'wrap' }}>
                {section.cta && <span style={{ display: 'inline-block', background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff', fontWeight: 800, fontSize: 16, padding: '16px 34px', borderRadius: 14, boxShadow: `0 18px 40px ${withAlpha(primary, 0.45)}` }}>{section.cta}</span>}
                {section.ctaSecondary && <span style={{ display: 'inline-block', background: 'transparent', color: text, fontWeight: 700, fontSize: 16, padding: '16px 30px', borderRadius: 14, border: `1px solid ${withAlpha(text, 0.25)}` }}>{section.ctaSecondary}</span>}
              </div>
            )}
          </div>
          {split && <MediaPanel section={section} theme={theme} displayFont={displayFont} />}
        </div>
      </section>
    )
  }

  if ((t === 'feature-grid' || t === 'bento') && Array.isArray(section.items) && section.items.length > 0) {
    const bento = t === 'bento' || section.layout === 'bento' || section.layout === 'mosaic'
    return (
      <section style={{ background, color: text, padding: '96px 28px', position: 'relative', overflow: 'hidden' }}>
        <SectionBackground section={section} theme={theme} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>{eyebrowEl}{heading && <h2 style={{ ...headingStyle, fontSize: 'clamp(30px, 4.5vw, 46px)' }}>{heading}</h2>}{sub && <p style={{ color: muted, fontSize: 18, marginTop: 14, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>{sub}</p>}</div>
          <div style={{ display: 'grid', gridTemplateColumns: bento ? 'repeat(auto-fit, minmax(220px, 1fr))' : 'repeat(auto-fit, minmax(260px, 1fr))', gridAutoRows: bento ? 'minmax(180px, auto)' : undefined, gap: 22 }}>
            {section.items.map((item, j) => {
              const image = itemImageUrl(item)
              const logo = itemLogoUrl(item)
              return (
                <div key={j} style={{ ...sizeStyle(bento ? item.size : undefined), position: 'relative', overflow: 'hidden', background: surface, border: `1px solid ${withAlpha(text, dark ? 0.08 : 0.06)}`, borderRadius: 22, padding: image ? 0 : 30, boxShadow: dark ? 'none' : `0 10px 30px ${withAlpha(text, 0.05)}` }}>
                  {image ? <MediaPanel item={item} theme={theme} displayFont={displayFont} /> : <>
                    <div style={{ width: 54, height: 54, borderRadius: logo ? 16 : 14, background: logo ? '#fff' : `linear-gradient(135deg, ${primary}, ${accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 18, overflow: 'hidden' }}>{logo ? <img src={logo} alt={item.logo?.alt || item.title || ''} style={{ width: '82%', height: '82%', objectFit: 'contain' }} /> : item.icon || '◆'}</div>
                    {item.title && <h3 style={{ fontFamily: displayFont, fontSize: bento && item.size === 'featured' ? 28 : 21, fontWeight: 800, margin: '0 0 10px' }}>{item.title}</h3>}
                    {item.body && <p style={{ color: muted, fontSize: 15, lineHeight: 1.6, margin: 0 }}>{item.body}</p>}
                  </>}
                </div>
              )
            })}
          </div>
        </div>
      </section>
    )
  }

  if (t === 'stats' && Array.isArray(section.stats) && section.stats.length > 0) {
    return <section style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff', padding: '72px 28px' }}><div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 28, textAlign: 'center' }}>{section.stats.map((s, j) => <div key={j}><div style={{ fontFamily: displayFont, fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 900, lineHeight: 1 }}>{s.value}</div><div style={{ fontSize: 14, opacity: 0.9, marginTop: 8, letterSpacing: '0.04em' }}>{s.label}</div></div>)}</div></section>
  }

  if (t === 'video') {
    const embed = toEmbedUrl(section.videoUrl)
    const poster = mediaUrl(section.posterImage, section.posterImageUrl || section.poster_image_url)
    return <section style={{ background: dark ? background : surface, color: text, padding: '96px 28px' }}><div style={{ maxWidth: 960, margin: '0 auto', textAlign: 'center' }}>{eyebrowEl}{heading && <h2 style={{ ...headingStyle, fontSize: 'clamp(28px, 4.5vw, 44px)', marginBottom: sub ? 12 : 32 }}>{heading}</h2>}{sub && <p style={{ color: muted, fontSize: 18, margin: '0 0 32px', lineHeight: 1.55 }}>{sub}</p>}<div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 20, overflow: 'hidden', boxShadow: `0 30px 70px ${withAlpha(dark ? primary : text, 0.3)}`, background: '#000' }}>{embed ? (/\.(mp4|webm|ogg)(\?.*)?$/i.test(embed) ? <video src={embed} controls poster={poster} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <iframe src={embed} title={heading || 'Video'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />) : <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#fff', padding: 28, background: poster ? undefined : `linear-gradient(135deg, ${withAlpha(primary, 0.95)}, ${withAlpha(accent, 0.95)})` }}>{poster && <img src={poster} alt={section.posterImage?.alt || heading || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }} />}<span style={{ position: 'relative', fontSize: 44, lineHeight: 1 }} aria-hidden="true">🎬</span><strong style={{ position: 'relative', fontFamily: displayFont, fontSize: 'clamp(20px, 3vw, 30px)' }}>{heading || 'Brand story video'}</strong>{(sub || section.body) && <span style={{ position: 'relative', maxWidth: 560, color: 'rgba(255,255,255,0.86)', fontSize: 15, lineHeight: 1.6 }}>{sub || section.body}</span>}</div>}</div></div></section>
  }

  if (t === 'gallery' && Array.isArray(section.items) && section.items.length > 0) {
    return <section style={{ background, color: text, padding: '96px 28px', position: 'relative', overflow: 'hidden' }}><SectionBackground section={section} theme={theme} /><div style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto' }}>{(heading || eyebrow) && <div style={{ textAlign: 'center', marginBottom: 48 }}>{eyebrowEl}{heading && <h2 style={{ ...headingStyle, fontSize: 'clamp(28px, 4.5vw, 44px)' }}>{heading}</h2>}{sub && <p style={{ color: muted, fontSize: 18, margin: '14px auto 0', maxWidth: 620, lineHeight: 1.55 }}>{sub}</p>}</div>}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gridAutoRows: 'minmax(240px, auto)', gap: 16 }}>{section.items.map((item, j) => <div key={j} style={{ ...sizeStyle(item.size), borderRadius: 18, overflow: 'hidden' }}><MediaPanel item={item} theme={theme} displayFont={displayFont} label={`Gallery item ${j + 1}`} /></div>)}</div></div></section>
  }

  if ((t === 'team' || t === 'sponsors' || t === 'logo-cloud') && Array.isArray(section.items) && section.items.length > 0) {
    const team = t === 'team'
    return <section style={{ background: dark ? surface : '#f6f7fb', color: text, padding: '88px 28px' }}><div style={{ maxWidth: 1120, margin: '0 auto', textAlign: 'center' }}>{eyebrowEl}{heading && <h2 style={{ ...headingStyle, fontSize: 'clamp(28px, 4.5vw, 44px)', marginBottom: sub ? 12 : 42 }}>{heading}</h2>}{sub && <p style={{ color: muted, fontSize: 18, margin: '0 auto 42px', maxWidth: 620, lineHeight: 1.55 }}>{sub}</p>}<div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${team ? 220 : 150}px, 1fr))`, gap: 18 }}>{section.items.map((item, j) => { const logo = itemLogoUrl(item) || itemImageUrl(item); return <div key={j} style={{ background, border: `1px solid ${withAlpha(text, 0.08)}`, borderRadius: 20, padding: team ? 24 : 18, minHeight: team ? 240 : 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{logo ? <img src={logo} alt={item.logo?.alt || item.image?.alt || item.title || ''} style={{ width: team ? 104 : 120, height: team ? 104 : 58, objectFit: team ? 'cover' : 'contain', borderRadius: team ? '50%' : 12, marginBottom: 14 }} /> : <div style={{ width: team ? 104 : 76, height: team ? 104 : 58, borderRadius: team ? '50%' : 16, background: `linear-gradient(135deg, ${primary}, ${accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: team ? 34 : 24, marginBottom: 14 }}>{item.icon || (team ? '👤' : '✦')}</div>}{item.title && <strong style={{ fontFamily: displayFont, fontSize: team ? 19 : 15 }}>{item.title}</strong>}{(item.role || item.body) && <span style={{ color: muted, fontSize: 13, lineHeight: 1.45, marginTop: 6 }}>{item.role || item.body}</span>}</div> })}</div></div></section>
  }

  if (t === 'testimonials' && Array.isArray(section.testimonials) && section.testimonials.length > 0) {
    return <section style={{ background: dark ? surface : '#0a0a12', color: dark ? text : '#f3f4f8', padding: '96px 28px' }}><div style={{ maxWidth: 1120, margin: '0 auto' }}>{heading && <h2 style={{ ...headingStyle, fontSize: 'clamp(28px, 4.5vw, 44px)', textAlign: 'center', marginBottom: 48 }}>{heading}</h2>}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>{section.testimonials.map((q, j) => <div key={j} style={{ background: withAlpha('#ffffff', dark ? 0.04 : 0.06), border: `1px solid ${withAlpha('#ffffff', 0.1)}`, borderRadius: 20, padding: 28 }}><div style={{ fontSize: 30, color: accent, lineHeight: 1, fontFamily: displayFont }}>&ldquo;</div>{q.quote && <p style={{ fontSize: 16, lineHeight: 1.6, margin: '8px 0 18px' }}>{q.quote}</p>}<div style={{ fontWeight: 800, fontSize: 14 }}>{q.author}</div>{q.role && <div style={{ fontSize: 13, opacity: 0.6 }}>{q.role}</div>}</div>)}</div></div></section>
  }

  if (t === 'cta') {
    return <section style={{ background, color: text, padding: '40px 28px 96px', position: 'relative', overflow: 'hidden' }}><SectionBackground section={section} theme={theme} /><div style={{ position: 'relative', zIndex: 1, maxWidth: 960, margin: '0 auto', borderRadius: 28, padding: '64px 40px', textAlign: 'center', background: hasBg ? withAlpha('#000000', dark ? 0.32 : 0.16) : `linear-gradient(135deg, ${primary}, ${accent})`, color: '#fff', boxShadow: `0 30px 80px ${withAlpha(primary, 0.4)}` }}>{heading && <h2 style={{ ...headingStyle, fontSize: 'clamp(28px, 4.5vw, 46px)', color: '#fff' }}>{heading}</h2>}{sub && <p style={{ fontSize: 18, opacity: 0.95, margin: '14px 0 0', lineHeight: 1.5 }}>{sub}</p>}{section.cta && <div style={{ marginTop: 30 }}><span style={{ display: 'inline-block', background: '#fff', color: primary, fontWeight: 800, fontSize: 16, padding: '16px 36px', borderRadius: 14 }}>{section.cta}</span></div>}</div></section>
  }

  if (t === 'contact') {
    return <section style={{ background: dark ? surface : '#f6f7fb', color: text, padding: '96px 28px' }}><div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>{eyebrowEl}{heading && <h2 style={{ ...headingStyle, fontSize: 'clamp(28px, 4.5vw, 44px)' }}>{heading}</h2>}{body && <p style={{ color: muted, fontSize: 18, margin: '16px 0 28px', lineHeight: 1.6 }}>{body}</p>}<div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap', fontSize: 16, fontWeight: 700 }}>{section.email && <a href={`mailto:${section.email}`} style={{ color: primary, textDecoration: 'none' }}>✉ {section.email}</a>}{section.phone && <a href={`tel:${section.phone}`} style={{ color: primary, textDecoration: 'none' }}>☎ {section.phone}</a>}</div>{section.address && <p style={{ color: muted, fontSize: 14, marginTop: 16 }}>{section.address}</p>}</div></section>
  }

  return <section style={{ background, color: text, padding: '88px 28px', position: 'relative', overflow: 'hidden' }}><SectionBackground section={section} theme={theme} /><div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>{eyebrowEl}{heading && <h2 style={{ ...headingStyle, fontSize: 'clamp(26px, 4vw, 40px)', marginBottom: 18 }}>{heading}</h2>}{body && <p style={{ color: muted, fontSize: 18, lineHeight: 1.7, margin: 0 }}>{body}</p>}</div></section>
}

export default async function PublicSitePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const site = await getSite(handle)
  if (!site) notFound()

  const c = site.content
  const theme = resolveTheme(c)
  const fonts = c.fonts || {}
  const fontsHref = buildGoogleFontsHref(fonts)
  const displayFont = fontStack(fonts.display, theme.dark ? 'Georgia, serif' : 'Georgia, serif')
  const bodyFont = fontStack(fonts.body, '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif')
  const sections = Array.isArray(c.sections) ? c.sections : []

  return (
    <>
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
      <main style={{ background: theme.background, color: theme.text, minHeight: '100vh', fontFamily: bodyFont, margin: 0 }}>
        {sections.map((section, i) => (
          <SectionView key={i} section={section} theme={theme} displayFont={displayFont} idx={i} />
        ))}
        <footer style={{ padding: '36px 28px', textAlign: 'center', borderTop: `1px solid ${withAlpha(theme.text, 0.1)}`, fontSize: 13, color: theme.muted, background: theme.background }}>
          {c.businessName || site.name} · Powered by SignalBoost
        </footer>
      </main>
    </>
  )
}
