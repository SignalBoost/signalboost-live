'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import OrchestrationPanel from '@/components/orchestration/OrchestrationPanel'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { supabase } from '@/utils/supabase/client'

type ItLevel = 'beginner' | 'intermediate' | 'advanced'

type WorkshopProfile = {
  it_level: ItLevel | null
  role: string | null
  tone_preference: string | null
}

const LEVEL_COPY: Record<ItLevel, { badge: string; subtitle: string; tasks: string[] }> = {
  beginner: {
    badge: 'Guided beginner path',
    subtitle: 'Every module includes plain-English definitions, safe defaults, and one step at a time.',
    tasks: ['Start with the launch checklist', 'Use templates before advanced settings', 'Review each recommendation before publishing'],
  },
  intermediate: {
    badge: 'Balanced builder path',
    subtitle: 'Modules blend guided explanations with practical shortcuts and configurable workflows.',
    tasks: ['Compare recommended settings', 'Customize automation rules', 'Review analytics after each launch'],
  },
  advanced: {
    badge: 'Advanced operator path',
    subtitle: 'Modules emphasize diagnostics, deployment checks, logs, integrations, and fast execution.',
    tasks: ['Inspect deployment and API logs', 'Tune integrations and data sources', 'Validate performance budgets before release'],
  },
}

export default function ApprenticeWorkshopPage() {
  const { dict } = useI18n()
  const [profile, setProfile] = useState<WorkshopProfile>({ it_level: 'beginner', role: null, tone_preference: 'friendly' })

  useEffect(() => {
    async function loadProfile() {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return

      const { data } = await supabase
        .from('user_profile')
        .select('it_level,role,tone_preference')
        .eq('user_id', auth.user.id)
        .maybeSingle()

      if (data) setProfile(data as WorkshopProfile)
    }

    loadProfile()
  }, [])

  const level = profile.it_level || 'beginner'
  const guidance = LEVEL_COPY[level]
  const items = useMemo(() => [
    { href: '/dashboard/builder', key: 'website', depth: level === 'advanced' ? 'Deployment, DNS, and performance checks' : 'Guided website setup' },
    { href: '/podcasters', key: 'podcast', depth: level === 'beginner' ? 'Script templates and publishing basics' : 'Multilingual show workflow' },
    { href: '/dashboard/outreach/discovery', key: 'outreach', depth: level === 'advanced' ? 'Pipeline rules and data diagnostics' : 'Audience discovery walkthrough' },
    { href: '/dashboard/reviews', key: 'reviews', depth: level === 'intermediate' ? 'Review automations and response tuning' : 'Trust-building review collection' },
    { href: '/dashboard/video', key: 'video', depth: level === 'advanced' ? 'Generation settings and render status' : 'Social video starter flow' },
    { href: '/dashboard/improve', key: 'improve', depth: level === 'advanced' ? 'SEO, accessibility, conversion, and speed audit' : 'Website improvement walkthrough' },
    { href: '/dashboard/podcast/studio', key: 'podcastStudio', depth: level === 'beginner' ? 'Upload, transcript, clips, titles, and publishing checklist' : 'Studio optimization, metadata, and multilingual distribution' },
  ], [level])

  return (
    <main style={{ padding: 'clamp(1rem, 4vw, 2rem)', color: '#fff', background: 'radial-gradient(circle at top left, rgba(56,189,248,.18), transparent 28rem), #0b1020', minHeight: '100vh' }}>
      <section style={{ maxWidth: 1080, margin: '0 auto' }}>
        <span style={{ display: 'inline-flex', padding: '0.4rem 0.75rem', borderRadius: 999, background: 'rgba(255,195,0,.12)', color: '#fde68a', fontWeight: 800 }}>{guidance.badge}</span>
        <h1 style={{ fontSize: 'clamp(2rem, 6vw, 4rem)', letterSpacing: '-0.06em', marginBottom: '.5rem' }}>{t(dict, 'apprentice.title', 'Workshop Apprentice')}</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', maxWidth: 720 }}>{guidance.subtitle} Current tone: <strong>{profile.tone_preference || 'friendly'}</strong>. Current role: <strong>{profile.role || 'not set'}</strong>.</p>

        <OrchestrationPanel module="apprentice" compact />
        <div className="sb-cta-row" style={{ marginTop: 14 }}><Link className="sb-button-secondary" href="/dashboard">{t(dict, 'services.openAnotherWorkspace', 'Open another workspace')}</Link></div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, margin: '1.5rem 0' }}>
          {guidance.tasks.map((task) => (
            <div key={task} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 20, padding: 16, background: 'rgba(255,255,255,.06)' }}>{task}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {items.map((item) => (
            <Link key={item.key} href={item.href} style={{ color: '#fff', textDecoration: 'none', border: '1px solid rgba(56,189,248,.22)', borderRadius: 24, padding: 18, background: 'linear-gradient(145deg, rgba(255,255,255,.11), rgba(255,255,255,.045))' }}>
              <strong>{t(dict, `apprentice.modules.${item.key}`, item.key)}</strong>
              <p style={{ color: 'rgba(255,255,255,.62)', marginBottom: 0 }}>{item.depth}</p>
            </Link>
          ))}
        </div>

        <section style={{ marginTop: 28, display: 'grid', gap: 16 }}>
          <h2 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.6rem)', marginBottom: 0 }}>{t(dict, 'apprentice.tutorials.title', 'New service tutorials')}</h2>
          {['improve', 'podcastStudio'].map((key) => (
            <article key={key} style={{ border: '1px solid rgba(255,195,0,.18)', borderRadius: 24, padding: 20, background: 'rgba(255,195,0,.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <strong>{t(dict, `apprentice.modules.${key}`, key === 'improve' ? 'Improve Website' : 'Optimize Podcast Studio')}</strong>
                  <ol style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.8 }}>
                    <li>{t(dict, `apprentice.tutorials.${key}.step1`, key === 'improve' ? 'Paste the website URL and identify the primary conversion goal.' : 'Upload or link an episode and confirm the show goal.')}</li>
                    <li>{t(dict, `apprentice.tutorials.${key}.step2`, key === 'improve' ? 'Review visual examples for hero, CTA, SEO, accessibility, and speed fixes.' : 'Review visual examples for transcript cleanup, short clips, titles, and metadata.')}</li>
                    <li>{t(dict, `apprentice.tutorials.${key}.step3`, key === 'improve' ? 'Apply the prioritized checklist and open the optimization module.' : 'Approve the distribution checklist and open the podcast studio optimizer.')}</li>
                  </ol>
                </div>
                <Link className="sb-button-primary" href={key === 'improve' ? '/dashboard/improve' : '/dashboard/podcast/studio'}>{t(dict, 'apprentice.tutorials.cta', 'Start tutorial')}</Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(80px, 1fr))', gap: 10, marginTop: 10 }} aria-label={t(dict, 'apprentice.tutorials.visualExamples', 'Visual examples')}>
                {['01', '02', '03'].map((label) => <div key={label} style={{ minHeight: 70, borderRadius: 16, border: '1px solid rgba(255,255,255,.12)', background: 'linear-gradient(135deg, rgba(56,189,248,.18), rgba(255,255,255,.04))', display: 'grid', placeItems: 'center', color: '#fde68a', fontWeight: 900 }}>{label}</div>)}
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  )
}
