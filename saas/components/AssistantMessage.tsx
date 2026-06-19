'use client'

// saas/components/AssistantMessage.tsx
// Renders an assistant message with awareness of the COS "visual brain" output:
//   <ARCHITECTURE_DIAGRAM> → rendered Mermaid diagram (with graceful fallback)
//   <STRATEGIC_PITCH>      → gold pitch card
//   <AUDIO_BRIEF_SOURCE>   → audio card with a Play button (ElevenLabs /api/tts)
//   <COMPILED_SPEC>        → cyan spec card
//   ```mermaid / ``` code  → diagram / code blocks inside ordinary text
// Anything else renders as normal pre-wrapped text, so plain chat is unaffected.

import { useState } from 'react'

const TTS_VOICE = 'EXAVITQu4vr4xnSDxMaL' // a curated ElevenLabs voice (allow-listed)

const codeBlock: React.CSSProperties = {
  margin: 0, padding: '10px 12px', borderRadius: 8, background: 'rgba(3,7,18,.6)',
  border: '1px solid rgba(255,255,255,.10)', color: '#cfe3ff', fontSize: 11.5,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap',
  overflowX: 'auto', maxHeight: 320, overflowY: 'auto',
}

// Unicode-safe base64url for the mermaid.ink renderer.
function b64url(s: string): string {
  const b = btoa(unescape(encodeURIComponent(s)))
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function Card({ accent, label, children }: { accent: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: `1px solid ${accent}55`, borderRadius: 12, overflow: 'hidden',
      background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(3,7,18,.65))',
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
        color: accent, padding: '7px 12px', borderBottom: `1px solid ${accent}33`,
      }}>{label}</div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  )
}

function Diagram({ code }: { code: string }) {
  const [failed, setFailed] = useState(false)
  const clean = code.trim()
  return (
    <Card accent="#1af0ff" label="Architecture diagram">
      {failed ? (
        <pre style={codeBlock}>{clean}</pre>
      ) : (
        <img
          src={`https://mermaid.ink/img/${b64url(clean)}?type=png&theme=dark`}
          alt="Architecture diagram"
          onError={() => setFailed(true)}
          style={{ maxWidth: '100%', display: 'block', borderRadius: 8, background: '#fff' }}
        />
      )}
    </Card>
  )
}

function AudioBrief({ script }: { script: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle')
  const clean = script.trim()

  async function play() {
    setState('loading')
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: clean.slice(0, 1800), voiceId: TTS_VOICE }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.audioUrl) { setState('error'); return }
      const audio = new Audio(data.audioUrl)
      audio.onended = () => setState('idle')
      audio.onerror = () => setState('error')
      await audio.play()
      setState('playing')
    } catch {
      setState('error')
    }
  }

  const label = state === 'loading' ? 'Synthesizing…' : state === 'playing' ? '▶ Playing' : state === 'error' ? 'Retry ▶' : '▶ Play brief'
  return (
    <Card accent="#ffc300" label="Audio brief">
      <p style={{ margin: '0 0 10px 0', fontSize: 12.5, lineHeight: 1.6, color: 'rgba(255,255,255,.85)' }}>{clean}</p>
      <button
        onClick={play}
        disabled={state === 'loading' || state === 'playing'}
        style={{
          background: 'rgba(255,195,0,.14)', border: '1px solid rgba(255,195,0,.45)', color: '#ffc300',
          borderRadius: 8, padding: '6px 14px', fontWeight: 800, fontSize: 12,
          cursor: state === 'loading' || state === 'playing' ? 'default' : 'pointer',
          opacity: state === 'loading' ? 0.7 : 1,
        }}
      >{label}</button>
      {state === 'error' && (
        <span style={{ marginLeft: 10, fontSize: 11, color: '#fca5a5' }}>Couldn’t synthesize audio.</span>
      )}
    </Card>
  )
}

// ── Inline media: turn URLs into players / images / clickable links ──────
const linkStyle: React.CSSProperties = { color: '#1af0ff', textDecoration: 'underline', wordBreak: 'break-word' }

function ytId(u: string): string | null {
  const m = u.match(/[?&]v=([A-Za-z0-9_-]{11})/) || u.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) || u.match(/youtube\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}
function vimeoId(u: string): string | null {
  const m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  return m ? m[1] : null
}
function isImageUrl(u: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(u)
}

function VideoEmbed({ src }: { src: string }) {
  return (
    <Card accent="#1af0ff" label="Video">
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
        <iframe
          src={src}
          title="Embedded video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
        />
      </div>
    </Card>
  )
}

function ImageEmbed({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <a href={src} target="_blank" rel="noopener noreferrer" style={linkStyle}>{src}</a>
  return (
    <img src={src} alt="" onError={() => setFailed(true)}
      style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 10, display: 'block', margin: '6px 0', border: '1px solid rgba(255,255,255,.12)' }} />
  )
}

// Tokenize a run of text, turning URLs into video players, images, or clickable links.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const url = /(https?:\/\/[^\s<>]+)/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = url.exec(text))) {
    const before = text.slice(last, m.index)
    if (before) out.push(<span key={`${keyBase}-x${i}`}>{before}</span>)
    let link = m[0]
    let trailing = ''
    const tm = link.match(/[.,;:!?)\]]+$/)
    if (tm) { trailing = tm[0]; link = link.slice(0, link.length - trailing.length) }
    const yt = ytId(link), vm = vimeoId(link)
    if (yt) out.push(<VideoEmbed key={`${keyBase}-v${i}`} src={`https://www.youtube.com/embed/${yt}`} />)
    else if (vm) out.push(<VideoEmbed key={`${keyBase}-v${i}`} src={`https://player.vimeo.com/video/${vm}`} />)
    else if (isImageUrl(link)) out.push(<ImageEmbed key={`${keyBase}-i${i}`} src={link} />)
    else out.push(<a key={`${keyBase}-l${i}`} href={link} target="_blank" rel="noopener noreferrer" style={linkStyle}>{link}</a>)
    if (trailing) out.push(<span key={`${keyBase}-tr${i}`}>{trailing}</span>)
    last = m.index + m[0].length
    i++
  }
  const tail = text.slice(last)
  if (tail) out.push(<span key={`${keyBase}-xtail`}>{tail}</span>)
  return out
}

// Render ordinary text, lifting ```mermaid blocks into diagrams and ``` blocks into code.
function renderText(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const fence = /```(\w*)\n([\s\S]*?)```/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = fence.exec(text))) {
    const before = text.slice(last, m.index)
    if (before.trim()) out.push(<div key={`${keyBase}-t${i}`} style={{ whiteSpace: 'pre-wrap' }}>{renderInline(before, `${keyBase}-t${i}`)}</div>)
    const lang = (m[1] || '').toLowerCase()
    const body = m[2]
    if (lang === 'mermaid') out.push(<Diagram key={`${keyBase}-d${i}`} code={body} />)
    else out.push(<pre key={`${keyBase}-c${i}`} style={codeBlock}>{body.replace(/\n$/, '')}</pre>)
    last = m.index + m[0].length
    i++
  }
  const tail = text.slice(last)
  if (tail.trim()) out.push(<div key={`${keyBase}-tail`} style={{ whiteSpace: 'pre-wrap' }}>{renderInline(tail, `${keyBase}-tail`)}</div>)
  return out
}

export default function AssistantMessage({ content }: { content: string }) {
  const blocks: React.ReactNode[] = []
  const slot = /<(ARCHITECTURE_DIAGRAM|STRATEGIC_PITCH|AUDIO_BRIEF_SOURCE|COMPILED_SPEC)>([\s\S]*?)<\/\1>/g
  let last = 0, m: RegExpExecArray | null, i = 0

  while ((m = slot.exec(content))) {
    const before = content.slice(last, m.index)
    if (before.trim()) blocks.push(<div key={`pre${i}`}>{renderText(before, `pre${i}`)}</div>)

    const tag = m[1]
    const body = m[2].trim()
    if (tag === 'ARCHITECTURE_DIAGRAM') {
      const mer = /```mermaid\n([\s\S]*?)```/.exec(body)
      blocks.push(<Diagram key={`slot${i}`} code={mer ? mer[1] : body} />)
    } else if (tag === 'STRATEGIC_PITCH') {
      blocks.push(
        <Card key={`slot${i}`} accent="#ffc300" label="Strategic pitch">
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(255,255,255,.9)', whiteSpace: 'pre-wrap' }}>{body}</div>
        </Card>,
      )
    } else if (tag === 'AUDIO_BRIEF_SOURCE') {
      blocks.push(<AudioBrief key={`slot${i}`} script={body} />)
    } else {
      // COMPILED_SPEC
      blocks.push(
        <Card key={`slot${i}`} accent="#1af0ff" label="Compiled spec">
          <pre style={codeBlock}>{body}</pre>
        </Card>,
      )
    }
    last = m.index + m[0].length
    i++
  }

  const tail = content.slice(last)
  if (tail.trim() || blocks.length === 0) blocks.push(<div key="tail">{renderText(tail, 'tail')}</div>)

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{blocks}</div>
}
