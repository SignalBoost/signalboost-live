'use client'
import Link from 'next/link'

const FEATURES = [
  {
    icon: '🎙️',
    title: 'Native AI voiceover',
    desc: 'Your episode in Portuguese, Spanish, Polish or Russian — not subtitles, actual native voice.',
  },
  {
    icon: '✂️',
    title: 'Clip factory',
    desc: 'Auto-generate TikTok and Reels clips from your episodes in every language.',
  },
  {
    icon: '🌐',
    title: 'Podcast website',
    desc: 'Branded show site with episode player, show notes and listener reviews — multilingual.',
  },
  {
    icon: '⭐',
    title: 'Listener reviews',
    desc: 'Collect and showcase listener testimonials in their native language.',
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
      padding: '100px 32px',
      maxWidth: 1100,
      margin: '0 auto',
      fontFamily: 'system-ui',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>

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
            fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 900,
            lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 16px', color: '#fff',
          }}>
            Your podcast,<br />
            heard in <span style={{ color: '#ffc300' }}>every language</span>
          </h2>

          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 16, lineHeight: 1.7, maxWidth: 400, margin: '0 0 32px' }}>
            Joe Rogan has millions of fans in Brazil who would rather hear his guest in Portuguese than read subtitles. That's your market.
          </p>

          <div style={{ display: 'flex', gap: 12, marginBottom: 40, flexWrap: 'wrap' }}>
            <Link href="/podcasters"
              style={{
                background: '#ffc300', color: '#000', fontWeight: 800,
                fontSize: 14, padding: '12px 28px', borderRadius: 999,
                textDecoration: 'none', display: 'inline-block',
              }}>
              See podcast plans
            </Link>
            <Link href="/podcasters#demo"
              style={{
                background: 'transparent', color: 'rgba(255,255,255,0.5)',
                fontWeight: 600, fontSize: 14, padding: '12px 28px',
                borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)',
                textDecoration: 'none', display: 'inline-block',
              }}>
              Hear a sample →
            </Link>
          </div>

          {/* Social proof */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div key={f.title} style={{
              display: 'flex', gap: 16, alignItems: 'flex-start',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14, padding: '18px 20px',
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
