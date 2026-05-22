'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

const GOLD = '#ffc300'
const BLUE = '#3b82f6'

export default function PodcastLaunchpad() {
  const searchParams = useSearchParams()
  const experience = searchParams.get('experience') || 'guided'

  const [topic, setTopic] = useState('')
  const [format, setFormat] = useState('solo')

  const isGuided = experience === 'guided'
  const isPower = experience === 'power'

  const ideas = [
    'Technology & AI',
    'Travel stories',
    'Business',
    'Sports',
    'Health',
    'True crime',
    'Personal growth',
  ]

  const generatedNames = [
    'The Daily Signal',
    'Beyond Tomorrow',
    'Ideas Unfiltered',
    'Next Horizon',
    'Coffee & Conversations',
  ]

  const steps = isGuided
    ? [
        'Tell us your podcast idea',
        'Pick a name you like',
        'Choose your first episode topic',
        'Create your podcast page',
        'Open your Podcast Studio',
      ]
    : isPower
      ? [
          'Define show positioning',
          'Generate brand and naming options',
          'Create episode structure',
          'Prepare publishing assets',
          'Configure studio workflow',
        ]
      : [
          'Choose your topic',
          'Pick your podcast name',
          'Create episode ideas',
          'Generate your podcast page',
          'Open Podcast Studio',
        ]

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '40px 24px 80px',
        background:
          'radial-gradient(circle at top right, rgba(255,195,0,.12), transparent 25%),linear-gradient(180deg,#06070c,#0e1119)',
        color: '#fff',
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
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
            🎙️ PODCAST_LAUNCHPAD · {experience.toUpperCase()}
          </div>

          <h1
            style={{
              fontSize: 'clamp(38px,7vw,72px)',
              lineHeight: 1,
              margin: 0,
              letterSpacing: '-.05em',
            }}
          >
            {isGuided ? 'Start your podcast' : 'Build your podcast'}
            <br />
            <span style={{ color: GOLD }}>
              {isGuided ? 'one step at a time' : 'in 5 steps'}
            </span>
          </h1>

          <p
            style={{
              marginTop: 20,
              fontSize: 16,
              lineHeight: 1.7,
              color: 'rgba(255,255,255,.52)',
              maxWidth: 740,
            }}
          >
            {isGuided
              ? 'No technical experience needed. SignalBoost will guide you through the basics and help create your podcast idea, name, first episodes and podcast page.'
              : isPower
                ? 'Use SignalBoost to define the show concept, generate production assets and prepare a more advanced podcast workflow.'
                : 'SignalBoost helps you shape your podcast idea, generate names, plan episodes and prepare your studio workspace.'}
          </p>
        </div>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) minmax(320px,.9fr)',
            gap: 24,
          }}
        >
          <div
            style={{
              padding: 26,
              borderRadius: 26,
              background: 'rgba(255,255,255,.035)',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              {isGuided ? 'Step 1: What do you want to talk about?' : 'Step 1: Define your show'}
            </h2>

            <p
              style={{
                color: 'rgba(255,255,255,.45)',
                lineHeight: 1.6,
                marginTop: -4,
              }}
            >
              {isGuided
                ? 'A podcast starts with a topic. Write it in your own words.'
                : 'Describe the core topic, audience and angle for the podcast.'}
            </p>

            <label style={{ display: 'grid', gap: 8, marginTop: 18 }}>
              <span style={labelStyle}>
                {isGuided ? 'Your podcast idea' : 'Podcast positioning'}
              </span>

              <textarea
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder={
                  isGuided
                    ? 'Example: I want to talk about travel stories, family, food, or business lessons...'
                    : 'Example: A weekly interview show for founders building AI-powered small businesses...'
                }
                style={{
                  ...inputStyle,
                  minHeight: 130,
                  resize: 'vertical',
                  lineHeight: 1.6,
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              <span style={labelStyle}>
                {isGuided ? 'How do you want to record?' : 'Show format'}
              </span>

              <select
                value={format}
                onChange={e => setFormat(e.target.value)}
                style={inputStyle}
              >
                <option value="solo">Solo podcast</option>
                <option value="interview">Interview podcast</option>
                <option value="cohost">Two hosts</option>
                <option value="story">Storytelling</option>
                <option value="education">Educational show</option>
              </select>
            </label>

            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                marginTop: 20,
              }}
            >
              {ideas.map(idea => (
                <button
                  key={idea}
                  onClick={() => setTopic(idea)}
                  style={{
                    border: '1px solid rgba(255,195,0,.22)',
                    background: 'rgba(255,195,0,.08)',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>

          <aside
            style={{
              padding: 26,
              borderRadius: 26,
              background:
                'linear-gradient(180deg, rgba(255,195,0,.10), rgba(255,255,255,.035))',
              border: '1px solid rgba(255,195,0,.22)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: '.12em',
                color: GOLD,
                marginBottom: 16,
              }}
            >
              YOUR 5-STEP PATH
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {steps.map((step, index) => (
                <div
                  key={step}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    color: 'rgba(255,255,255,.72)',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background:
                        index === 0 ? 'rgba(255,195,0,.18)' : 'rgba(255,255,255,.06)',
                      color: index === 0 ? GOLD : 'rgba(255,255,255,.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                    }}
                  >
                    {index + 1}
                  </div>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 22,
                padding: 14,
                borderRadius: 18,
                background: 'rgba(59,130,246,.08)',
                border: '1px solid rgba(59,130,246,.22)',
                color: 'rgba(255,255,255,.68)',
                lineHeight: 1.55,
                fontSize: 14,
              }}
            >
              {isGuided
                ? 'We will keep the process simple and avoid technical language.'
                : isPower
                  ? 'Advanced options can include publishing workflow, distribution strategy and technical configuration.'
                  : 'SignalBoost will guide you while still giving you room to decide.'}
            </div>
          </aside>
        </section>

        <section
          style={{
            marginTop: 26,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
            gap: 14,
          }}
        >
          <LaunchCard
            icon="🎙️"
            title="Possible podcast names"
            items={generatedNames}
          />

          <LaunchCard
            icon="🧠"
            title="What SignalBoost helps create"
            items={[
              'Podcast concept',
              'Show name',
              'Episode ideas',
              'Intro script',
              'Podcast page',
            ]}
          />

          <LaunchCard
            icon="🎬"
            title="Later in Podcast Studio"
            items={[
              'Upload episodes',
              'Find short clips',
              'Create captions',
              'Translate content',
              'Prepare distribution',
            ]}
          />
        </section>

        <div style={{ marginTop: 30 }}>
          <button
            style={{
              border: 'none',
              padding: '14px 28px',
              borderRadius: 999,
              background: GOLD,
              color: '#000',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Generate podcast sketch →
          </button>

          <button
            style={{
              marginLeft: 12,
              border: '1px solid rgba(255,255,255,.14)',
              padding: '14px 28px',
              borderRadius: 999,
              background: 'rgba(255,255,255,.05)',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Open Podcast Studio
          </button>
        </div>
      </div>
    </main>
  )
}

function LaunchCard({
  icon,
  title,
  items,
}: {
  icon: string
  title: string
  items: string[]
}) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 22,
        background: 'rgba(255,255,255,.035)',
        border: '1px solid rgba(255,255,255,.08)',
      }}
    >
      <div style={{ fontSize: 28 }}>{icon}</div>
      <h3 style={{ margin: '12px 0 10px' }}>{title}</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(item => (
          <div
            key={item}
            style={{
              color: 'rgba(255,255,255,.5)',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  color: '#fff',
  fontWeight: 850,
  fontSize: 13,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(0,0,0,.25)',
  color: '#fff',
  padding: '13px 14px',
  outline: 'none',
}
