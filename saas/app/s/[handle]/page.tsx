// saas/app/s/[handle]/page.tsx
// Public website renderer. Anyone can visit /s/<handle>.
// It looks up a LIVE project by its handle and renders the stored content
// as a real webpage. Drafts and non-live sites are not shown (handled by
// both the query and the RLS policy added in the migration).

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

type SectionItem = { title?: string; body?: string }
type Section = {
  type: 'hero' | 'about' | 'services' | 'contact' | string
  heading?: string
  body?: string
  cta?: string
  items?: SectionItem[]
  email?: string
  phone?: string
}
type SiteContent = {
  businessName?: string
  headline?: string
  tagline?: string
  colors?: { primary?: string; accent?: string; background?: string; text?: string }
  sections?: Section[]
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
  return {
    title: c.businessName || c.headline || site.name,
    description: c.tagline || c.headline || undefined,
  }
}

export default async function PublicSitePage(
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params
  const site = await getSite(handle)
  if (!site) notFound()

  const c = site.content
  const colors = {
    primary: c.colors?.primary || '#3b82f6',
    accent: c.colors?.accent || '#ffc300',
    background: c.colors?.background || '#ffffff',
    text: c.colors?.text || '#1a1a1a',
  }
  const sections = Array.isArray(c.sections) ? c.sections : []

  return (
    <main style={{ background: colors.background, color: colors.text, minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0 }}>
      {sections.map((section, i) => {
        const heading = section.heading?.trim()
        const body = section.body?.trim()

        // ── Hero ──
        if (section.type === 'hero') {
          return (
            <section key={i} style={{ padding: '96px 24px', textAlign: 'center', background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`, color: '#fff' }}>
              <div style={{ maxWidth: 820, margin: '0 auto' }}>
                {(c.businessName || c.headline) && (
                  <h1 style={{ fontSize: 'clamp(34px, 6vw, 60px)', fontWeight: 900, margin: '0 0 16px', lineHeight: 1.1 }}>
                    {heading || c.headline || c.businessName}
                  </h1>
                )}
                {(body || c.tagline) && (
                  <p style={{ fontSize: 'clamp(16px, 2.4vw, 22px)', opacity: 0.95, margin: '0 0 32px', lineHeight: 1.5 }}>
                    {body || c.tagline}
                  </p>
                )}
                {section.cta && (
                  <span style={{ display: 'inline-block', background: '#fff', color: colors.primary, fontWeight: 800, fontSize: 16, padding: '14px 32px', borderRadius: 999 }}>
                    {section.cta}
                  </span>
                )}
              </div>
            </section>
          )
        }

        // ── Services / features ──
        if (section.type === 'services' && Array.isArray(section.items) && section.items.length > 0) {
          return (
            <section key={i} style={{ padding: '72px 24px', maxWidth: 1080, margin: '0 auto' }}>
              {heading && <h2 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800, textAlign: 'center', margin: '0 0 40px' }}>{heading}</h2>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
                {section.items.map((item, j) => (
                  <div key={j} style={{ border: `1px solid ${colors.primary}22`, borderRadius: 16, padding: 28, background: `${colors.primary}08` }}>
                    {item.title && <h3 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px', color: colors.primary }}>{item.title}</h3>}
                    {item.body && <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0, opacity: 0.85 }}>{item.body}</p>}
                  </div>
                ))}
              </div>
            </section>
          )
        }

        // ── Contact ──
        if (section.type === 'contact') {
          return (
            <section key={i} style={{ padding: '72px 24px', textAlign: 'center', background: `${colors.primary}0d` }}>
              <div style={{ maxWidth: 640, margin: '0 auto' }}>
                {heading && <h2 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800, margin: '0 0 16px' }}>{heading}</h2>}
                {body && <p style={{ fontSize: 17, lineHeight: 1.6, margin: '0 0 24px', opacity: 0.85 }}>{body}</p>}
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', fontSize: 16, fontWeight: 700 }}>
                  {section.email && <a href={`mailto:${section.email}`} style={{ color: colors.primary, textDecoration: 'none' }}>✉ {section.email}</a>}
                  {section.phone && <a href={`tel:${section.phone}`} style={{ color: colors.primary, textDecoration: 'none' }}>☎ {section.phone}</a>}
                </div>
              </div>
            </section>
          )
        }

        // ── About / generic text section (default) ──
        return (
          <section key={i} style={{ padding: '64px 24px', maxWidth: 760, margin: '0 auto' }}>
            {heading && <h2 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 800, margin: '0 0 18px' }}>{heading}</h2>}
            {body && <p style={{ fontSize: 17, lineHeight: 1.7, margin: 0, opacity: 0.88 }}>{body}</p>}
          </section>
        )
      })}

      {/* Footer */}
      <footer style={{ padding: '32px 24px', textAlign: 'center', borderTop: `1px solid ${colors.text}1a`, fontSize: 13, opacity: 0.6 }}>
        {(c.businessName || site.name)} · Powered by SignalBoost
      </footer>
    </main>
  )
}
