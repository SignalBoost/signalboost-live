'use client'
import Link from 'next/link'

const FEATURES = [
  {
    icon: '🎙️',
    title: 'Sound like a local',
    desc: 'We convert your episode into native-sounding audio in Portuguese, Spanish, Polish and Russian. Not subtitles — real voices.',
  },
  {
    icon: '✂️',
    title: 'Go viral in 5 languages',
    desc: 'Auto-generate short clips for TikTok, Reels and YouTube Shorts from every episode — in all your languages.',
  },
  {
    icon: '💬',
    title: 'Captions in every language',
    desc: 'Auto-generate subtitles and captions for your videos — burned in or as separate files. Perfect for silent scrollers.',
  },
  {
    icon: '🌐',
    title: 'Your show, your site',
    desc: 'A branded podcast website with episode player, multilingual show notes and listener reviews.',
  },
  {
    icon: '⭐',
    title: 'Build your community',
    desc: 'Collect listener reviews and testimonials in their native language. Show the world your audience loves you.',
  },
]

const PODCASTERS = [
  { name: 'Joe Rogan', flag: '🇺🇸', reach: '190M listeners' },
  { name: 'Flow Podcast', flag: '🇧🇷', reach: '#1 in Brazil' },
  { name: 'Máxima FM', flag: '🇪🇸', reach: 'Top LATAM' },
]

export default function PodcastSection() {
  return (
    <section style={{
      padding: '80px 24px',
      maxWidth: 1100,
      margin: '0 auto',
      fontFamily: 'system-ui',
    }}>
      <style>{`
        @media (max-width: 768px) {
          .podcast-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
          .podcast-buttons {
            flex-direction: column !important;
          }
          .podcast-buttons a {
            text-align: center !important;
          }
        }
      `}</style>

      <div className="podcast-grid" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 80,
        alignItems: 'start',
      }}>

        {/* Left */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)',
            borderRadius: 999, padding: '4px 14px', marginBottom: 20,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#ffc300',
          }}>
            🎙️ For podcasters
          </div>

          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900,
            lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 16px', color: '#fff',
          }}>
            You record it.<br />
            We take it <span style={{ color: '#ffc300' }}>global.</span>
          </h2>

          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' }}>
            Once your episode is recorded, SignalBoost handles everything else — native voiceover in 5 languages, captions, social clips, your show website and listener reviews.
          </p>

          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, lineHeight: 1.6, margin: '0 0 28px', fontStyle: 'italic' }}>
            We do not do hardware or raw audio editing — just bring us your finished episode.
          </p>

          <div className="podcast-buttons" style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
            <Link href="/podcasters"
              style={{
                background: '#ffc300', color: '#000', fontWeight: 800,
                fontSize: 14, padding: '12px 28px', borderRadius: 999,
                textDecoration: 'none', display: 'inline-block',
              }}>
              See podcast plans
            </Link>
            <Link href="/podcasters#how-it-works"
              style={{
                background: 'transparent', color: 'rgba(255,255,255,0.5)',
                fontWeight: 600, fontSize: 14, padding: '12px 28px',
                borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)',
                textDecoration: 'none', display: 'inline-block',
              }}>
              How it works →
            </Link>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {PODCASTERS.map(p => (
              <div key={p.name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 999, padding: '6px 14px',
              }}>
                <span style={{ fontSize: 16 }}>{p.flag}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{p.reach}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14, padding: '16px 18px',
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 17,
              }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
