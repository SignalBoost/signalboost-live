'use client'

import { useEffect, useState } from 'react'

const GOLD = '#ffc300'

type Sketch = {
  showNames?: string[]
}

type Clip = {
  title: string
  hook: string
  whyItWorks: string
  suggestedCaption: string
}

export default function PodcastStudioPage() {
  const [podcastName, setPodcastName] = useState('My Podcast')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loadingTranscript, setLoadingTranscript] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [clips, setClips] = useState<Clip[]>([])
  const [loadingClips, setLoadingClips] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('podcastSketch')

    if (saved) {
      try {
        const sketch: Sketch = JSON.parse(saved)

        if (sketch.showNames?.length) {
          setPodcastName(sketch.showNames[0])
        }
      } catch {}
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

  async function generateClips() {
    if (!transcript) return

    try {
      setLoadingClips(true)

      const response = await fetch(
        '/api/podcast/clips',
        {
          method: 'POST',
          headers: {
            'Content-Type':'application/json'
          },
          body: JSON.stringify({
            transcript
          })
        }
      )

      const data = await response.json()

      if (data.clips) {
        setClips(data.clips)
      }

    } catch(error){
      console.error(error)
    }
    finally{
      setLoadingClips(false)
    }
  }

  return (
    <main
      style={{
        minHeight:'100vh',
        padding:'40px 24px',
        background:
        'linear-gradient(180deg,#050505,#10141f)',
        color:'#fff'
      }}
    >
      <div
        style={{
          maxWidth:1200,
          margin:'0 auto'
        }}
      >
        <h1
          style={{
            fontSize:'clamp(40px,7vw,70px)'
          }}
        >
          🎙️ {podcastName}
        </h1>

        <div
          style={{
            marginTop:30,
            padding:25,
            borderRadius:24,
            background:
            'rgba(255,255,255,.04)',
            border:
            '1px solid rgba(255,255,255,.08)'
          }}
        >
          <h2>Upload Episode</h2>

          <input
            type="file"
            accept="audio/*,video/*"
            onChange={e=>{
              const file=
              e.target.files?.[0]

              if(file){
                setSelectedFile(file)
              }
            }}
          />

          {selectedFile && (

            <div
            style={{
              marginTop:12
            }}
            >
              {selectedFile.name}
            </div>

          )}

          <div
            style={{
              display:'flex',
              gap:12,
              marginTop:20,
              flexWrap:'wrap'
            }}
          >

            <button
              onClick={generateTranscript}
              style={buttonStyle}
            >
              {loadingTranscript
              ? 'Generating...'
              : '📝 Transcript Agent'}
            </button>

            <button
              onClick={generateClips}
              disabled={!transcript}
              style={{
                ...buttonStyle,
                opacity:
                transcript
                ?1
                :.4
              }}
            >
              {loadingClips
              ? 'Finding Clips...'
              : '✂️ Clip Agent'}
            </button>

          </div>
        </div>

        {transcript && (

        <div
        style={cardStyle}
        >
          <h2>
          Transcript
          </h2>

          <div
          style={{
            lineHeight:1.8,
            color:
            'rgba(255,255,255,.7)'
          }}
          >
          {transcript}
          </div>

        </div>

        )}

        {clips.length>0 && (

        <div
        style={{
          marginTop:30
        }}
        >

        <h2>
        Suggested Clips
        </h2>

        <div
        style={{
          display:'grid',
          gap:20
        }}
        >

        {clips.map((clip,index)=>(

        <div
        key={index}
        style={cardStyle}
        >

        <h3>
        {clip.title}
        </h3>

        <p>
        <strong>Hook:</strong>
        {' '}
        {clip.hook}
        </p>

        <p>
        <strong>Why:</strong>
        {' '}
        {clip.whyItWorks}
        </p>

        <p>
        <strong>Caption:</strong>
        {' '}
        {clip.suggestedCaption}
        </p>

        </div>

        ))}

        </div>

        </div>

        )}

      </div>
    </main>
  )
}

const buttonStyle={
border:'none',
padding:'14px 24px',
borderRadius:999,
background:'#ffc300',
fontWeight:800,
cursor:'pointer'
} as const

const cardStyle={
marginTop:30,
padding:24,
borderRadius:24,
background:'rgba(255,255,255,.04)',
border:'1px solid rgba(255,255,255,.08)'
} as const
