'use client'

import { useEffect, useState } from 'react'

const GOLD = '#ffc300'

type Sketch = {
  showNames?: string[]
}

export default function PodcastStudioPage() {
  const [podcastName, setPodcastName] = useState('My Podcast')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loadingTranscript, setLoadingTranscript] = useState(false)
  const [transcript, setTranscript] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('podcastSketch')

    if (saved) {
      try {
        const sketch: Sketch = JSON.parse(saved)

        if (sketch.showNames?.length) {
          setPodcastName(sketch.showNames[0])
        }
      } catch {
        console.log('No podcast sketch found')
      }
    }
  }, [])

  async function generateTranscript() {
    if (!selectedFile) return

    try {
      setLoadingTranscript(true)

      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch(
        '/api/podcast/transcript',
        {
          method: 'POST',
          body: formData,
        }
      )

      const data = await response.json()

      if (data.text) {
        setTranscript(data.text)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingTranscript(false)
    }
  }

  const agents = [
    {
      icon: '📝',
      title: 'Transcript Agent',
      desc: 'Turn recordings into text',
      action: generateTranscript,
    },
    {
      icon: '✂️',
      title: 'Clip Agent',
      desc: 'Find highlights and short clips',
    },
    {
      icon: '🌍',
      title: 'Translation Agent',
      desc: 'Translate podcast content',
    },
    {
      icon: '📣',
      title: 'Distribution Agent',
      desc: 'Prepare content for social media',
    },
  ]

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '40px 24px',
        background:
          'linear-gradient(180deg,#050505,#10141f)',
        color: '#fff',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
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
            fontWeight: 800,
            fontSize: 12,
            marginBottom: 20,
          }}
        >
          🎙️ PODCAST_STUDIO
        </div>

        <h1
          style={{
            fontSize: 'clamp(40px,7vw,70px)',
            margin: 0,
          }}
        >
          {podcastName}
        </h1>

        <p
          style={{
            marginTop: 20,
            color: 'rgba(255,255,255,.6)',
            lineHeight: 1.7,
          }}
        >
          Upload once. Let SignalBoost help transform your content.
        </p>

        <div
          style={{
            marginTop: 35,
            padding: 24,
            borderRadius: 24,
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.08)',
          }}
        >
          <h2>Upload Episode</h2>

          <input
            type="file"
            accept="audio/*,video/*"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) {
                setSelectedFile(file)
              }
            }}
            style={{
              marginTop: 20,
            }}
          />

          {selectedFile && (
            <div
              style={{
                marginTop: 15,
                color: 'rgba(255,255,255,.6)',
              }}
            >
              Selected: {selectedFile.name}
            </div>
          )}
        </div>

        <div
          style={{
            display:'grid',
            gridTemplateColumns:
              'repeat(auto-fit,minmax(240px,1fr))',
            gap:20,
            marginTop:35
          }}
        >
          {agents.map(agent => (

            <button
              key={agent.title}
              onClick={()=>{
                if(agent.action){
                  agent.action()
                }
              }}
              style={{
                padding:24,
                borderRadius:22,
                border:'1px solid rgba(255,255,255,.08)',
                background:'rgba(255,255,255,.04)',
                color:'#fff',
                cursor:'pointer',
                textAlign:'left'
              }}
            >
              <div
                style={{
                  fontSize:36,
                  marginBottom:15
                }}
              >
                {agent.icon}
              </div>

              <h3>
                {agent.title}
              </h3>

              <p
                style={{
                  color:'rgba(255,255,255,.5)',
                  lineHeight:1.6
                }}
              >
                {agent.desc}
              </p>

            </button>

          ))}
        </div>

        {loadingTranscript && (

          <div
            style={{
              marginTop:35,
              padding:20,
              borderRadius:20,
              background:
                'rgba(255,195,0,.08)'
            }}
          >
            Generating transcript...
          </div>

        )}

        {transcript && (

          <div
            style={{
              marginTop:35,
              padding:24,
              borderRadius:24,
              background:
                'rgba(255,255,255,.04)',
              border:
                '1px solid rgba(255,255,255,.08)'
            }}
          >
            <h2>
              Transcript
            </h2>

            <div
              style={{
                color:
                  'rgba(255,255,255,.75)',
                lineHeight:1.8,
                whiteSpace:'pre-wrap'
              }}
            >
              {transcript}
            </div>

          </div>

        )}

      </div>
    </main>
  )
}
