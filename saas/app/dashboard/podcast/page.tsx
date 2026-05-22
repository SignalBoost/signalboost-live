
'use client'

const GOLD = '#ffc300'

export default function PodcastPage() {
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
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            marginBottom: 40,
          }}
        >
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
            }}
          >
            Your Podcast
          </h1>

          <p
            style={{
              marginTop: 15,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.6,
            }}
          >
            This page will become the public home of your podcast.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr .7fr',
            gap: 24,
          }}
        >
          <div
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
              Your podcast description generated from Launchpad
              will appear here.
            </p>

            <h2 style={{ marginTop: 30 }}>
              Episodes
            </h2>

            {[1,2,3].map(item=>(
              <div
                key={item}
                style={{
                  padding:16,
                  marginTop:12,
                  borderRadius:14,
                  background:
                    'rgba(255,255,255,.05)'
                }}
              >
                🎧 Episode {item}
              </div>
            ))}
          </div>

          <div
            style={{
              padding:25,
              borderRadius:24,
              background:
                'rgba(255,255,255,.04)',
              border:
                '1px solid rgba(255,255,255,.08)',
            }}
          >
            <h2>Host</h2>

            <div
              style={{
                marginTop:20,
                width:100,
                height:100,
                borderRadius:'50%',
                background:
                  'rgba(255,195,0,.15)',
              }}
            />

            <p
              style={{
                marginTop:20,
                color:
                  'rgba(255,255,255,.7)'
              }}
            >
              Host information will appear here.
            </p>

          </div>
        </div>
      </div>
    </main>
  )
}
