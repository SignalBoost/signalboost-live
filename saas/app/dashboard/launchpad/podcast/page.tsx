'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import ResetButton from '@/components/ResetButton'

const GOLD = '#ffc300'

type Sketch = {
  showNames: string[]
  showDescription: string
  targetAudience: string
  firstEpisodes: string[]
  introScript: string
  launchChecklist: string[]
  nextStep: string
}

export default function PodcastLaunchpad() {
  const { t } = useTranslation()
  const [experience, setExperience] = useState('guided')
  const [topic, setTopic] = useState('')
  const [format, setFormat] = useState('solo')
  const [loading, setLoading] = useState(false)
  const [sketch, setSketch] = useState<Sketch | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setExperience(params.get('experience') || 'guided')
  }, [])

  async function generateSketch() {
    if (!topic.trim()) return

    try {
      setLoading(true)
      setError('')

      const response = await fetch('/api/launchpad/podcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic,
          format,
          experience,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || t('podcast.launchpad.error', 'Could not generate podcast sketch.'))
      }

      if (data.sketch) {
        setSketch(data.sketch)
        localStorage.setItem(
          'podcastSketch',
          JSON.stringify(data.sketch)
        )
      }
    } catch (error: any) {
      console.error(error)
      setError(error?.message || t('podcast.launchpad.error', 'Could not generate podcast sketch.'))
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setTopic('')
    setSketch(null)
    setLoading(false)
    setError('')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

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
        <h1
          style={{
            fontSize: 'clamp(38px,7vw,70px)',
            marginBottom: 10,
          }}
        >
          {t('podcast.launchpad.title', '🎙️ Podcast Launchpad')}
        </h1>

        <p
          style={{
            color: 'rgba(255,255,255,.5)',
            marginBottom: 30,
          }}
        >
          {t('podcast.launchpad.subtitle', 'Build your podcast in guided steps')}
        </p>

        <div
          style={{
            padding: 25,
            borderRadius: 24,
            background: 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.08)',
          }}
        >
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder={t('podcast.launchpad.input.placeholder', 'Describe your podcast idea')}
            style={{
              width: '100%',
              minHeight: 120,
              padding: 15,
              borderRadius: 16,
              border: 'none',
              resize: 'vertical',
              background: 'rgba(255,255,255,.05)',
              color: '#fff',
            }}
          />

          <select
            value={format}
            onChange={e => setFormat(e.target.value)}
            style={{
              width: '100%',
              marginTop: 20,
              padding: 14,
              borderRadius: 16,
              background: 'rgba(255,255,255,.05)',
              color: '#fff',
            }}
          >
            <option value="solo">{t('podcast.launchpad.format.solo', 'Solo')}</option>
            <option value="interview">{t('podcast.launchpad.format.interview', 'Interview')}</option>
            <option value="cohost">{t('podcast.launchpad.format.cohost', 'Co-host')}</option>
            <option value="story">{t('podcast.launchpad.format.story', 'Storytelling')}</option>
          </select>

          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 25,
            }}
          >
            <button
              onClick={generateSketch}
              disabled={loading || !topic.trim()}
              style={{
                border: 'none',
                padding: '14px 30px',
                borderRadius: 999,
                background:
                  loading || !topic.trim()
                    ? 'rgba(255,255,255,.08)'
                    : GOLD,
                color:
                  loading || !topic.trim()
                    ? 'rgba(255,255,255,.35)'
                    : '#000',
                fontWeight: 900,
                cursor:
                  loading || !topic.trim()
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {loading ? t('podcast.launchpad.cta.loading', 'Generating...') : t('podcast.launchpad.cta.generate', 'Generate Podcast Sketch')}
            </button>
            {(sketch || error) && <ResetButton onReset={reset} />}

            {sketch && (
              <>
                <button
                  onClick={() => {
                    window.location.href = '/dashboard/podcast'
                  }}
                  style={{
                    border: 'none',
                    padding: '14px 30px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,.08)',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {t('podcast.launchpad.cta.createPage', 'Create Podcast Page')}
                </button>

                <button
                  onClick={() => {
                    window.location.href = '/dashboard/podcast/studio'
                  }}
                  style={{
                    border: 'none',
                    padding: '14px 30px',
                    borderRadius: 999,
                    background: 'rgba(59,130,246,.2)',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {t('podcast.launchpad.cta.openStudio', 'Open Podcast Studio')}
                </button>
              </>
            )}
          </div>
          {error && <p style={{ color: '#fca5a5', marginTop: 12 }}>{error}</p>}
        </div>

        {sketch && (
          <div
            style={{
              marginTop: 30,
              display: 'grid',
              gap: 20,
            }}
          >
            <Card title={t('podcast.launchpad.cards.names', '🎙️ Podcast Names')} items={sketch.showNames} />
            <Card title={t('podcast.launchpad.cards.description', '📝 Description')} text={sketch.showDescription} />
            <Card title={t('podcast.launchpad.cards.audience', '👥 Audience')} text={sketch.targetAudience} />
            <Card title={t('podcast.launchpad.cards.episodes', '🎬 First Episodes')} items={sketch.firstEpisodes} />
            <Card title={t('podcast.launchpad.cards.intro', '🎤 Intro Script')} text={sketch.introScript} />
            <Card title={t('podcast.launchpad.cards.checklist', '✅ Launch Checklist')} items={sketch.launchChecklist} />
            <Card title={t('podcast.launchpad.cards.next', '➡️ Next Step')} text={sketch.nextStep} />
          </div>
        )}
      </div>
    </main>
  )
}

function Card({
  title,
  items,
  text,
}: {
  title: string
  items?: string[]
  text?: string
}) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 20,
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.08)',
      }}
    >
      <h3>{title}</h3>

      {text && (
        <p
          style={{
            color: 'rgba(255,255,255,.7)',
            lineHeight: 1.6,
          }}
        >
          {text}
        </p>
      )}

      {items?.map(item => (
        <div
          key={item}
          style={{
            marginBottom: 8,
            color: 'rgba(255,255,255,.7)',
          }}
        >
          • {item}
        </div>
      ))}
    </div>
  )
}
