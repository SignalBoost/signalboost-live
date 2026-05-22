'use client'

import Link from 'next/link'
import { useState } from 'react'

const GOLD = '#ffc300'

const PATHS = [
  {
    icon: '🏪',
    id: 'business',
    title: 'Small Business',
    desc: 'Launch a bakery, restaurant, travel company, local service and more.',
    href: '/dashboard/launchpad/business',
  },
  {
    icon: '🎙️',
    id: 'podcast',
    title: 'Podcast',
    desc: 'Build your podcast in guided steps — even if you never created one.',
    href: '/dashboard/launchpad/podcast',
  },
  {
    icon: '🎬',
    id: 'creator',
    title: 'Creator Brand',
    desc: 'Build a content creator ecosystem and grow an audience.',
    href: '/dashboard/launchpad/creator',
  },
  {
    icon: '🛒',
    id: 'store',
    title: 'Online Store',
    desc: 'Sell products online with website and marketing support.',
    href: '/dashboard/launchpad/store',
  },
]

export default function LaunchpadPage() {
  const [selected, setSelected] = useState('')

  const selectedPath = PATHS.find(path => path.id === selected)

  const podcastSteps = [
    'Choose your podcast topic',
    'Pick your podcast name',
    'Create first episode ideas',
    'Generate your podcast page',
    'Launch your show',
  ]

  const businessSteps = [
    'Describe your business',
    'Create business name',
    'Generate website',
    'Prepare marketing',
    'Launch business',
  ]

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '40px 24px 80px',
        background:
          'radial-gradient(circle at top left, rgba(255,195,0,.15), transparent 30%),linear-gradient(180deg,#050505,#0f1117)',
        color: '#fff',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '6px 14px',
              borderRadius: 999,
              background: 'rgba(255,195,0,.1)',
              border: '1px solid rgba(255,195,0,.2)',
              color: GOLD,
              fontWeight: 800,
              fontSize: 12,
              marginBottom: 20,
            }}
          >
            🚀 SIGNALBOOST_LAUNCHPAD
          </div>

          <h1
            style={{
              fontSize: 'clamp(40px,7vw,80px)',
              lineHeight: 1,
              margin: 0,
              letterSpacing: '-.05em',
            }}
          >
            Tell us what you want
            <br />
            <span style={{ color: GOLD }}>to build</span>
          </h1>

          <p
            style={{
              maxWidth: 700,
              margin: '20px auto',
              color: 'rgba(255,255,255,.5)',
              lineHeight: 1.8,
              fontSize: 16,
            }}
          >
            You bring the idea. SignalBoost helps build and launch it.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
            gap: 20,
            marginBottom: 40,
          }}
        >
          {PATHS.map(path => {
            const active = selected === path.id

            return (
              <button
                key={path.id}
                onClick={() => setSelected(path.id)}
                style={{
                  cursor: 'pointer',
                  padding: 28,
                  borderRadius: 24,
                  background: active
                    ? 'rgba(255,195,0,.08)'
                    : 'rgba(255,255,255,.03)',
                  border: active
                    ? '1px solid rgba(255,195,0,.4)'
                    : '1px solid rgba(255,255,255,.08)',
                  transition: 'all .2s',
                  color: '#fff',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 38, marginBottom: 12 }}>
                  {path.icon}
                </div>

                <h2>{path.title}</h2>

                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'rgba(255,255,255,.45)',
                  }}
                >
                  {path.desc}
                </p>
              </button>
            )
          })}
        </div>

        {selectedPath && (
          <div
            style={{
              padding: 30,
              borderRadius: 28,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              {selected === 'podcast'
                ? '🎙️ Build your podcast in 5 steps'
                : selected === 'creator'
                  ? '🎬 Build your creator brand in 5 steps'
                  : selected === 'store'
                    ? '🛒 Build your online store in 5 steps'
                    : '🏪 Build your business in 5 steps'}
            </h2>

            <div style={{ display: 'grid', gap: 12, marginTop: 25 }}>
              {(selected === 'podcast' ? podcastSteps : businessSteps).map(
                (step, index) => (
                  <div
                    key={step}
                    style={{
                      display: 'flex',
                      gap: 14,
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: 'rgba(255,195,0,.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        color: GOLD,
                      }}
                    >
                      {index + 1}
                    </div>

                    <div style={{ color: 'rgba(255,255,255,.7)' }}>
                      {step}
                    </div>
                  </div>
                )
              )}
            </div>

            <Link
              href={selectedPath.href}
              style={{
                display: 'inline-flex',
                marginTop: 30,
                border: 'none',
                padding: '14px 28px',
                borderRadius: 999,
                background: GOLD,
                color: '#000',
                fontWeight: 900,
                cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              Continue →
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
