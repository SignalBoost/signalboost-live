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

const EXPERIENCE_LEVELS = [
  {
    id: 'guided',
    icon: '🌱',
    title: 'Guided',
    desc: 'Keep it simple. Walk me through each step and handle the technical parts.',
  },
  {
    id: 'assisted',
    icon: '⚙️',
    title: 'Assisted',
    desc: 'Guide me, but let me make some decisions along the way.',
  },
  {
    id: 'power',
    icon: '🚀',
    title: 'Power User',
    desc: 'Show advanced options and give me more technical control.',
  },
]

export default function LaunchpadPage() {
  const [selected, setSelected] = useState('')
  const [experience, setExperience] = useState('')

  const selectedPath = PATHS.find(path => path.id === selected)

  const canContinue = Boolean(selectedPath && experience)

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
              maxWidth: 720,
              margin: '20px auto',
              color: 'rgba(255,255,255,.5)',
              lineHeight: 1.8,
              fontSize: 16,
            }}
          >
            You bring the idea. SignalBoost helps build and launch it.
            To help you better, choose how much guidance you want.
          </p>
        </div>

        <section style={{ marginBottom: 44 }}>
          <h2 style={{ marginBottom: 14 }}>
            1. What do you want to launch?
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
              gap: 20,
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

                  <h3>{path.title}</h3>

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
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={{ marginBottom: 8 }}>
            2. How should SignalBoost help you?
          </h2>

          <p
            style={{
              color: 'rgba(255,255,255,.45)',
              lineHeight: 1.6,
              maxWidth: 720,
              marginTop: 0,
              marginBottom: 18,
            }}
          >
            This helps SignalBoost adjust the language, steps and technical
            details shown to you.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
              gap: 20,
            }}
          >
            {EXPERIENCE_LEVELS.map(level => {
              const active = experience === level.id

              return (
                <button
                  key={level.id}
                  onClick={() => setExperience(level.id)}
                  style={{
                    cursor: 'pointer',
                    padding: 24,
                    borderRadius: 22,
                    background: active
                      ? 'rgba(59,130,246,.12)'
                      : 'rgba(255,255,255,.03)',
                    border: active
                      ? '1px solid rgba(59,130,246,.45)'
                      : '1px solid rgba(255,255,255,.08)',
                    transition: 'all .2s',
                    color: '#fff',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 10 }}>
                    {level.icon}
                  </div>

                  <h3>{level.title}</h3>

                  <p
                    style={{
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: 'rgba(255,255,255,.45)',
                    }}
                  >
                    {level.desc}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

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

            {experience && (
              <div
                style={{
                  marginTop: 22,
                  padding: 14,
                  borderRadius: 16,
                  background: 'rgba(59,130,246,.08)',
                  border: '1px solid rgba(59,130,246,.22)',
                  color: 'rgba(255,255,255,.72)',
                  lineHeight: 1.6,
                  fontSize: 14,
                }}
              >
                SignalBoost will use your selected experience level to keep the
                next steps clear and appropriate for you.
              </div>
            )}

            {canContinue ? (
              <Link
                href={`${selectedPath.href}?experience=${experience}`}
                style={{
                  display: 'inline-flex',
                  marginTop: 30,
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
            ) : (
              <button
                disabled
                style={{
                  marginTop: 30,
                  padding: '14px 28px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,.08)',
                  color: 'rgba(255,255,255,.35)',
                  fontWeight: 900,
                  border: 'none',
                  cursor: 'not-allowed',
                }}
              >
                Choose a path and guidance level
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
