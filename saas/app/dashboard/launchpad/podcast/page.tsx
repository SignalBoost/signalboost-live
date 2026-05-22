'use client'

import { useEffect, useState } from 'react'

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
  const [experience, setExperience] = useState('guided')
  const [topic, setTopic] = useState('')
  const [format, setFormat] = useState('solo')

  const [loading, setLoading] = useState(false)
  const [sketch, setSketch] = useState<Sketch | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setExperience(params.get('experience') || 'guided')
  }, [])

  async function generateSketch() {
    if (!topic.trim()) return

    try {
      setLoading(true)

      const response = await fetch(
        '/api/launchpad/podcast',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            topic,
            format,
            experience,
          }),
        }
      )

      const data = await response.json()

      if (data.sketch) {
        setSketch(data.sketch)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
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
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(38px,7vw,70px)',
            marginBottom: 10,
          }}
        >
          🎙️ Podcast Launchpad
        </h1>

        <p
          style={{
            color: 'rgba(255,255,255,.5)',
            marginBottom: 30,
          }}
        >
          Build your podcast in guided steps
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
            onChange={e =>
              setTopic(e.target.value)
            }
            placeholder='Describe your podcast idea'
            style={{
              width: '100%',
              minHeight: 120,
              padding: 15,
              borderRadius: 16,
              border: 'none',
              resize: 'vertical',
              background:
                'rgba(255,255,255,.05)',
              color: '#fff',
            }}
          />

          <select
            value={format}
            onChange={e =>
              setFormat(
                e.target.value
              )
            }
            style={{
              width: '100%',
              marginTop: 20,
              padding: 14,
              borderRadius: 16,
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

          <button
            onClick={generateSketch}
            disabled={loading}
            style={{
              marginTop: 25,
              border: 'none',
              padding: '14px 30px',
              borderRadius: 999,
              background: GOLD,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {loading
              ? 'Generating...'
              : 'Generate Podcast Sketch'}
          </button>
        </div>

        {sketch && (
          <div
            style={{
              marginTop: 30,
              display: 'grid',
              gap: 20,
            }}
          >
            <Card
              title='🎙️ Podcast Names'
              items={
                sketch.showNames
              }
            />

            <Card
              title='📝 Description'
              text={
                sketch.showDescription
              }
            />

            <Card
              title='👥 Audience'
              text={
                sketch.targetAudience
              }
            />

            <Card
              title='🎬 First Episodes'
              items={
                sketch.firstEpisodes
              }
            />

            <Card
              title='🎤 Intro Script'
              text={
                sketch.introScript
              }
            />

            <Card
              title='✅ Launch Checklist'
              items={
                sketch.launchChecklist
              }
            />
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
}:{
title:string
items?:string[]
text?:string
}){

return(

<div
style={{
padding:20,
borderRadius:20,
background:
'rgba(255,255,255,.03)',
border:
'1px solid rgba(255,255,255,.08)'
}}
>

<h3>{title}</h3>

{text && (
<p
style={{
color:
'rgba(255,255,255,.7)',
lineHeight:1.6
}}
>
{text}
</p>
)}

{items?.map(item=>(
<div
key={item}
style={{
marginBottom:8,
color:
'rgba(255,255,255,.7)'
}}
>
• {item}
</div>
))}

</div>

)

}
