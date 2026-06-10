'use client'

// saas/app/dashboard/podcasters/page.tsx
//
// Fully i18n'd. Every visible string uses t(dict, key, fallback) so the
// page renders in the user's selected language across en / pt / es / pl / ru.

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

type Sketch = {
  showNames?: string[]
  showDescription?: string
  targetAudience?: string
  firstEpisodes?: string[]
  introScript?: string
  launchChecklist?: string[]
  nextStep?: string
}

export default function PodcastPage() {
  const { dict } = useI18n()
  const tr = (key: string, fallback: string) => t(dict, key, fallback)

  const [sketch, setSketch] = useState<Sketch | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('podcastSketch')
    if (saved) {
      try {
        setSketch(JSON.parse(saved))
      } catch {
        setSketch(null)
      }
    }
  }, [])

  const title = sketch?.showNames?.[0] || tr('podcasters.title.fallback', 'Your Podcast')

  // Episode labels: only fall back to translated "Episode N" placeholders if there's no real episode data.
  const episodes =
    sketch?.firstEpisodes && sketch.firstEpisodes.length > 0
      ? sketch.firstEpisodes
      : [
          tr('podcasters.episode.fallback1', 'Episode 1'),
          tr('podcasters.episode.fallback2', 'Episode 2'),
          tr('podcasters.episode.fallback3', 'Episode 3'),
        ]

  const episodeCount = sketch?.firstEpisodes?.length ?? 0
  const checklistCount = sketch?.launchChecklist?.length ?? 0

  return (
    <main style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header className="sb-console" style={{ marginBottom: 28 }}>
          <span className="sb-eyebrow">🎙️ {tr('podcasters.badge', 'Podcast page')}</span>

          <h1>{title}</h1>

          <p className="sb-body">
            {sketch?.showDescription ||
              tr('podcasters.subtitle.fallback', 'This page will become the public home of your podcast.')}
          </p>

          <div className="sb-telemetry">
            <div><b className="gold">{episodeCount || 3}</b><span>{tr('podcasters.episodes', 'Episodes')}</span></div>
            <div><b className={sketch ? 'ok' : 'warn'} style={{ fontSize: 14 }}>{sketch ? 'READY' : 'DRAFT'}</b><span>{tr('podcasters.badge', 'Podcast page')}</span></div>
            {checklistCount ? <div><b>{checklistCount}</b><span>{tr('podcasters.checklist', 'Launch checklist')}</span></div> : null}
          </div>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24,
          }}
        >
          <section style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-.02em', margin: '0 0 10px' }}>{tr('podcasters.aboutShow', 'About the show')}</h2>

            <p
              style={{
                color: 'rgba(255,255,255,.7)',
                lineHeight: 1.6,
              }}
            >
              {sketch?.showDescription ||
                tr('podcasters.description.fallback', 'Your podcast description generated from Launchpad will appear here.')}
            </p>

            {sketch?.targetAudience && (
              <>
                <h2 style={{ marginTop: 26, fontSize: 16, fontWeight: 900, letterSpacing: '-.02em', marginBottom: 10 }}>{tr('podcasters.audience', 'Audience')}</h2>
                <p
                  style={{
                    color: 'rgba(255,255,255,.7)',
                    lineHeight: 1.6,
                  }}
                >
                  {sketch.targetAudience}
                </p>
              </>
            )}

            <h2 style={{ marginTop: 26, fontSize: 16, fontWeight: 900, letterSpacing: '-.02em', marginBottom: 4 }}>{tr('podcasters.episodes', 'Episodes')}</h2>

            {episodes.map((episode, index) => (
              <div
                key={`${index}-${episode}`}
                style={{
                  padding: '14px 0',
                  borderTop: '1px solid rgba(255,255,255,.07)',
                }}
              >
                <strong>🎧 {tr('podcasters.episodeLabel', 'Episode {n}').replace('{n}', String(index + 1))}</strong>
                <div
                  style={{
                    marginTop: 6,
                    color: 'rgba(255,255,255,.65)',
                    lineHeight: 1.5,
                  }}
                >
                  {episode}
                </div>
              </div>
            ))}
          </section>

          <aside style={{ minWidth: 0, borderLeft: '1px solid rgba(255,255,255,.08)', paddingLeft: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-.02em', margin: '0 0 10px' }}>{tr('podcasters.host', 'Host')}</h2>

            <div
              style={{
                marginTop: 20,
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: 'rgba(255,195,0,.15)',
                border: '1px solid rgba(255,195,0,.35)',
              }}
            />

            <p
              style={{
                marginTop: 20,
                color: 'rgba(255,255,255,.7)',
                lineHeight: 1.6,
              }}
            >
              {tr('podcasters.host.fallback', 'Host information will appear here.')}
            </p>

            {sketch?.introScript && (
              <>
                <h2 style={{ marginTop: 26, fontSize: 16, fontWeight: 900, letterSpacing: '-.02em', marginBottom: 10 }}>{tr('podcasters.introScript', 'Intro script')}</h2>
                <p
                  style={{
                    color: 'rgba(255,255,255,.7)',
                    lineHeight: 1.6,
                  }}
                >
                  {sketch.introScript}
                </p>
              </>
            )}

            <button
              onClick={() => {
                window.location.href = '/dashboard/podcast/studio'
              }}
              style={{
                marginTop: 28,
                width: '100%',
                border: 'none',
                padding: '14px 20px',
                borderRadius: 999,
                background: GOLD,
                color: '#000',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {tr('podcasters.openStudio', 'Open Podcast Studio')}
            </button>
          </aside>
        </div>
      </div>
    </main>
  )
}
