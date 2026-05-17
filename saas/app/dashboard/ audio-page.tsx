'use client'
import { useState, useRef } from 'react'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

const VOICES = [
  { id: 'en-female', lang: 'English',    flag: '🇺🇸', name: 'Sarah',    style: 'Professional' },
  { id: 'en-male',   lang: 'English',    flag: '🇺🇸', name: 'James',    style: 'Warm' },
  { id: 'pt-female', lang: 'Português',  flag: '🇧🇷', name: 'Ana',      style: 'Natural' },
  { id: 'pt-male',   lang: 'Português',  flag: '🇧🇷', name: 'Ricardo',  style: 'Energetic' },
  { id: 'es-female', lang: 'Español',    flag: '🇪🇸', name: 'Sofia',    style: 'Warm' },
  { id: 'es-male',   lang: 'Español',    flag: '🇪🇸', name: 'Miguel',   style: 'Professional' },
  { id: 'pl-female', lang: 'Polski',     flag: '🇵🇱', name: 'Zofia',    style: 'Natural' },
  { id: 'ru-female', lang: 'Русский',    flag: '🇷🇺', name: 'Natasha',  style: 'Professional' },
]

type Job = {
  id: string
  name: string
  voice: string
  status: 'processing' | 'done' | 'error'
  progress: number
  created: string
}

const SAMPLE_JOBS: Job[] = [
  { id: '1', name: 'Episode 1 - Portuguese', voice: 'Ana (Português)', status: 'done', progress: 100, created: '2026-05-15' },
  { id: '2', name: 'Intro narration - Spanish', voice: 'Sofia (Español)', status: 'done', progress: 100, created: '2026-05-14' },
]

export default function AudioPage() {
  const [tab, setTab] = useState<'generate' | 'jobs' | 'credits'>('generate')
  const [text, setText] = useState('')
  const [selectedVoice, setSelectedVoice] = useState('')
  const [generating, setGenerating] = useState(false)
  const [jobs, setJobs] = useState<Job[]>(SAMPLE_JOBS)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadedFile, setUploadedFile] = useState<string>('')
  const [mode, setMode] = useState<'text' | 'file'>('text')

  async function generate() {
    if ((!text.trim() && mode === 'text') || !selectedVoice) return
    setGenerating(true)
    const voice = VOICES.find(v => v.id === selectedVoice)
    const newJob: Job = {
      id: Date.now().toString(),
      name: mode === 'file' ? uploadedFile : text.slice(0, 40) + '...',
      voice: `${voice?.name} (${voice?.lang})`,
      status: 'processing',
      progress: 0,
      created: new Date().toISOString().split('T')[0],
    }
    setJobs(prev => [newJob, ...prev])
    setTab('jobs')

    // Simulate progress
    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 20
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
        setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: 'done', progress: 100 } : j))
        setGenerating(false)
      }
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, progress: Math.min(progress, 99) } : j))
    }, 500)
  }

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20, marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>🎙️ Native audio</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
            Generate natural-sounding AI voiceover in 5 languages.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,195,0,0.08)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 12, padding: '10px 16px' }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: GOLD }}>750</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>credits remaining</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { id: 'generate', label: '+ Generate' },
          { id: 'jobs',     label: 'My audio files' },
          { id: 'credits',  label: 'Credits' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === t.id ? BLUE : 'transparent', color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.45)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Generate */}
      {tab === 'generate' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          <div>
            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
              {[{ id: 'text', label: '✍️ Type text' }, { id: 'file', label: '📁 Upload file' }].map(m => (
                <button key={m.id} onClick={() => setMode(m.id as any)}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: mode === m.id ? 'rgba(255,255,255,0.1)' : 'transparent', color: mode === m.id ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                  {m.label}
                </button>
              ))}
            </div>

            {mode === 'text' ? (
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>
                  Text to convert *
                </label>
                <textarea value={text} onChange={e => setText(e.target.value)}
                  placeholder="Type or paste the text you want to convert to audio. The AI will generate a natural-sounding voiceover in your chosen language."
                  rows={8}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'system-ui', lineHeight: 1.6 }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                  {text.length} characters · ~{Math.ceil(text.length / 800)} credit{Math.ceil(text.length / 800) !== 1 ? 's' : ''}
                </div>
              </div>
            ) : (
              <div>
                <input ref={fileRef} type="file" accept=".mp3,.mp4,.wav,.txt,.pdf" style={{ display: 'none' }}
                  onChange={e => setUploadedFile(e.target.files?.[0]?.name || '')} />
                <div onClick={() => fileRef.current?.click()}
                  style={{ border: '2px dashed rgba(255,255,255,0.15)', borderRadius: 12, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)')}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
                  {uploadedFile ? (
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#4ade80' }}>✓ {uploadedFile}</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Drop your file here or click to browse</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Supports MP3, MP4, WAV, TXT, PDF</div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Voice selector */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 12 }}>Choose a voice *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {VOICES.map(voice => (
                <div key={voice.id} onClick={() => setSelectedVoice(voice.id)}
                  style={{
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    background: selectedVoice === voice.id ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${selectedVoice === voice.id ? BLUE : 'rgba(255,255,255,0.07)'}`,
                    display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                  }}>
                  <span style={{ fontSize: 18 }}>{voice.flag}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{voice.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{voice.lang} · {voice.style}</div>
                  </div>
                  {selectedVoice === voice.id && <span style={{ color: BLUE }}>✓</span>}
                </div>
              ))}
            </div>
            <button onClick={generate} disabled={generating || (!text.trim() && mode === 'text' && !uploadedFile) || !selectedVoice}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12, fontSize: 14, fontWeight: 800,
                background: GOLD, color: '#000', border: 'none',
                cursor: 'pointer', opacity: (generating || (!text.trim() && mode === 'text' && !uploadedFile) || !selectedVoice) ? 0.5 : 1,
              }}>
              {generating ? 'Generating...' : '🎙️ Generate audio'}
            </button>
          </div>
        </div>
      )}

      {/* Jobs */}
      {tab === 'jobs' && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Your audio files</h2>
          {jobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.3)' }}>
              No audio files yet. Generate your first voiceover above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobs.map(job => (
                <div key={job.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: job.status === 'processing' ? 10 : 0 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{job.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{job.voice} · {job.created}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: job.status === 'done' ? 'rgba(74,222,128,0.1)' : 'rgba(59,130,246,0.1)', color: job.status === 'done' ? '#4ade80' : BLUE }}>
                        {job.status === 'done' ? '✓ Ready' : 'Processing...'}
                      </span>
                      {job.status === 'done' && (
                        <button style={{ padding: '6px 14px', borderRadius: 8, background: BLUE, color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                          Download
                        </button>
                      )}
                    </div>
                  </div>
                  {job.status === 'processing' && (
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
                      <div style={{ height: '100%', background: BLUE, borderRadius: 999, width: `${job.progress}%`, transition: 'width 0.5s' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Credits */}
      {tab === 'credits' && (
        <div style={{ maxWidth: 500 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Audio credits</h2>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px', marginBottom: 20 }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: GOLD, marginBottom: 4 }}>750</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>credits remaining on your Free plan</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: '1 credit', value: '~800 characters of text' },
                { label: '1 credit', value: '~1 minute of audio' },
                { label: 'Free plan', value: '50 credits/month included' },
                { label: 'Starter plan', value: '200 credits/month' },
                { label: 'Pro plan', value: '500 credits/month' },
              ].map(item => (
                <div key={item.label + item.value} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{item.label}</span>
                  <span style={{ fontWeight: 600 }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
          <a href="/pricing" style={{ display: 'block', textAlign: 'center', background: GOLD, color: '#000', fontWeight: 800, fontSize: 14, padding: '13px 0', borderRadius: 12, textDecoration: 'none' }}>
            Upgrade for more credits
          </a>
        </div>
      )}
    </div>
  )
}
