'use client'

import { useEffect, useState } from 'react'

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

  const title = sketch?.showNames?.[0] || 'Your Podcast'
  const episodes = sketch?.firstEpisodes || [
    'Episode 1',
    'Episode 2',
    'Episode 3',
  ]

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '40px 24px',
        background:
          'radial-gradient(circle at top right, rgba(255,195,0,.12), transparent 25%), linear-gradient(180deg,#06070c,#0e1119)',
        color: '#fff',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 40 }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '6px 14px',
              borderRadius: 999,
              background: 'rgba(255,195,0,.1)',
              border: '1px solid rgba(255,195,0,.2)',
              color: GOLD,
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 20,
            }}
          >
            🎙️ PODCAST_PAGE
          </div>

          <h1
            style={{
              fontSize: 'clamp(40px,7vw,70px)',
              margin: 0,
              lineHeight: 1,
            }}
          >
            {title}
          </h1>

          <p
            style={{
              marginTop: 18,
              color: 'rgba(255,255,255,.65)',
              lineHeight: 1.7,
              maxWidth: 760,
              fontSize: 17,
            }}
          >
            {sketch?.showDescription ||
              'This page will become the public home of your podcast.'}
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) minmax(300px,.7fr)',
            gap: 24,
          }}
        >
          <section
            style={{
              padding: 25,
              borderRadius: 24,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            <h2>About the show</h2>

            <p
              style={{
                color: 'rgba(255,255,255,.7)',
                lineHeight: 1.6,
              }}
            >
              {sketch?.showDescription ||
                'Your podcast description generated from Launchpad will appear here.'}
            </p>

            {sketch?.targetAudience && (
              <>
                <h2 style={{ marginTop: 30 }}>Audience</h2>
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

            <h2 style={{ marginTop: 30 }}>Episodes</h2>

            {episodes.map((episode, index) => (
              <div
                key={episode}
                style={{
                  padding: 16,
                  marginTop: 12,
                  borderRadius: 16,
                  background: 'rgba(255,255,255,.05)',
                  border: '1px solid rgba(255,255,255,.08)',
                }}
              >
                <strong>🎧 Episode {index + 1}</strong>
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

          <aside
            style={{
              padding: 25,
              borderRadius: 24,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            <h2>Host</h2>

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
              Host information will appear here.
            </p>

            {sketch?.introScript && (
              <>
                <h2 style={{ marginTop: 30 }}>Intro Script</h2>
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
              Open Podcast Studio
            </button>
          </aside>
        </div>
      </div>
    </main>
  )
}
