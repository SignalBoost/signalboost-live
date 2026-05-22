'use client'

import { useEffect, useState } from 'react'

const GOLD = '#ffc300'

export default function PodcastLaunchpad() {
  const [experience, setExperience] = useState('guided')
  const [topic, setTopic] = useState('')
  const [format, setFormat] = useState('solo')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setExperience(params.get('experience') || 'guided')
  }, [])

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
          'Generate brand options',
          'Create episode structure',
          'Prepare publishing assets',
          'Configure workflow',
        ]
      : [
          'Choose topic',
          'Pick podcast name',
          'Generate episode ideas',
          'Create podcast page',
          'Open Studio',
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
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
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
              fontSize: 'clamp(38px,7vw,70px)',
              lineHeight: 1,
              margin: 0,
            }}
          >
            {isGuided
              ? 'Start your podcast'
              : 'Build your podcast'}

            <br />

            <span style={{ color: GOLD }}>
              {isGuided
                ? 'one step at a time'
                : 'in 5 steps'}
            </span>
          </h1>

          <p
            style={{
              marginTop: 20,
              maxWidth: 700,
              color: 'rgba(255,255,255,.55)',
              lineHeight: 1.7,
            }}
          >
            {isGuided
              ? 'No technical experience needed. SignalBoost guides you through every step.'
              : 'Build and organize your podcast with AI assistance.'}
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              '1fr minmax(320px,.8fr)',
            gap: 24,
          }}
        >
          <div
            style={{
              padding: 25,
              borderRadius: 24,
              background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            <h2>Podcast topic</h2>

            <textarea
              value={topic}
              onChange={e =>
                setTopic(e.target.value)
              }
              placeholder='What do you want your podcast to talk about?'
              style={{
                width: '100%',
                minHeight: 120,
                padding: 14,
                borderRadius: 14,
                border: 'none',
                background:
                  'rgba(255,255,255,.05)',
                color: '#fff',
                resize: 'vertical',
              }}
            />

            <div
              style={{
                marginTop: 20,
              }}
            >
              <div
                style={{
                  marginBottom: 8,
                }}
              >
                Podcast format
              </div>

              <select
                value={format}
                onChange={e =>
                  setFormat(
                    e.target.value
                  )
                }
                style={{
                  width: '100%',
                  padding: 14,
                  borderRadius: 14,
                  background:
                    'rgba(255,255,255,.05)',
                  color: '#fff',
                }}
              >
                <option value='solo'>
                  Solo
                </option>

                <option value='interview'>
                  Interview
                </option>

                <option value='cohost'>
                  Co-host
                </option>

                <option value='story'>
                  Storytelling
                </option>
              </select>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                marginTop: 25,
              }}
            >
              {ideas.map(item => (
                <button
                  key={item}
                  onClick={() =>
                    setTopic(item)
                  }
                  style={{
                    border: 'none',
                    padding:
                      '8px 12px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    background:
                      'rgba(255,195,0,.08)',
                    color: '#fff',
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: 25,
              borderRadius: 24,
              background:
                'rgba(255,255,255,.03)',
              border:
                '1px solid rgba(255,255,255,.08)',
            }}
          >
            <h2>5-step path</h2>

            <div
              style={{
                display: 'grid',
                gap: 14,
                marginTop: 20,
              }}
            >
              {steps.map(
                (step, index) => (
                  <div
                    key={step}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems:
                        'center',
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius:
                          '50%',
                        background:
                          'rgba(255,195,0,.1)',
                        display:
                          'flex',
                        alignItems:
                          'center',
                        justifyContent:
                          'center',
                        color:
                          GOLD,
                        fontWeight: 700,
                      }}
                    >
                      {index + 1}
                    </div>

                    <span>
                      {step}
                    </span>
                  </div>
                )
              )}
            </div>

            <div
              style={{
                marginTop: 25,
                padding: 15,
                borderRadius: 16,
                background:
                  'rgba(255,195,0,.08)',
              }}
            >
              <strong>
                Suggested names
              </strong>

              <div
                style={{
                  marginTop: 10,
                  display: 'grid',
                  gap: 8,
                  color:
                    'rgba(255,255,255,.7)',
                }}
              >
                {generatedNames.map(
                  name => (
                    <div
                      key={name}
                    >
                      🎙️ {name}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          style={{
            marginTop: 30,
            border: 'none',
            padding: '14px 30px',
            borderRadius: 999,
            background: GOLD,
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Generate Podcast Sketch →
        </button>
      </div>
    </main>
  )
}
