'use client'

// saas/components/AssistantMessage.tsx
// Rich assistant renderer for text, images, audio briefs, diagrams, and media JSON.
// Important: video results from the AI often arrive as JSON-ish text, not perfect
// JSON. This component deliberately extracts playable media even when the model
// inserts line breaks, apostrophes, curly quotes, or minor formatting mistakes.

import { useState } from 'react'

const TTS_VOICE = 'EXAVITQu4vr4xnSDxMaL'

const codeBlock: React.CSSProperties = {
  margin: 0,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(3,7,18,.6)',
  border: '1px solid rgba(255,255,255,.10)',
  color: '#cfe3ff',
  fontSize: 11.5,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  whiteSpace: 'pre-wrap',
  overflowX: 'auto',
  maxHeight: 320,
  overflowY: 'auto',
}

const linkStyle: React.CSSProperties = {
  color: '#1af0ff',
  textDecoration: 'underline',
  wordBreak: 'break-word',
}

function b64url(s: string): string {
  const b = btoa(unescape(encodeURIComponent(s)))
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeJsonString(value?: string): string | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`)
  } catch {
    return value.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\'/g, "'").trim()
  }
}

// ── Media IDs ────────────────────────────────────────────────────────────────
function ytId(u: string): string | null {
  const clean = u.trim()
  const m =
    clean.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    clean.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    clean.match(/youtube\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})/) ||
    clean.match(/^([A-Za-z0-9_-]{11})$/)
  return m ? m[1] : null
}

function playlistId(u: string): string | null {
  const m = u.match(/[?&]list=([A-Za-z0-9_-]+)/) || u.match(/^(PL[A-Za-z0-9_-]+)$/)
  return m ? m[1] : null
}

function vimeoId(u: string): string | null {
  const m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  return m ? m[1] : null
}

function archiveId(u: string): string | null {
  const m = u.match(/archive\.org\/(?:details|embed)\/([^/?#]+)/)
  return m ? m[1] : null
}

function isImageUrl(u: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(u)
}

type MediaRef = { kind: 'youtube' | 'vimeo' | 'playlist' | 'archive'; id: string }
type MediaItem = { refr: MediaRef; title?: string }

function mediaRefFromUrl(url: string): MediaRef | null {
  const clean = url.trim()
  const pl = playlistId(clean)
  if (pl) return { kind: 'playlist', id: pl }
  const yt = ytId(clean)
  if (yt) return { kind: 'youtube', id: yt }
  const vm = vimeoId(clean)
  if (vm) return { kind: 'vimeo', id: vm }
  const ar = archiveId(clean)
  if (ar) return { kind: 'archive', id: ar }
  return null
}

function mediaRefFromTypeAndId(type: string | undefined, id: string): MediaRef | null {
  const fromUrl = mediaRefFromUrl(id)
  if (fromUrl) return fromUrl

  const cleanType = (type || '').toLowerCase()
  const cleanId = id.trim()

  if (cleanType === 'playlist') return { kind: 'playlist', id: cleanId }
  if (cleanType === 'archive') return { kind: 'archive', id: cleanId }
  if (cleanType === 'vimeo') return { kind: 'vimeo', id: cleanId }
  if (cleanType === 'video' || cleanType === 'youtube' || /^[A-Za-z0-9_-]{11}$/.test(cleanId)) return { kind: 'youtube', id: cleanId }

  return null
}

function embedSrc(ref: MediaRef): string {
  if (ref.kind === 'playlist') return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(ref.id)}&autoplay=1`
  if (ref.kind === 'vimeo') return `https://player.vimeo.com/video/${encodeURIComponent(ref.id)}?autoplay=1`
  if (ref.kind === 'archive') return `https://archive.org/embed/${encodeURIComponent(ref.id)}`
  return `https://www.youtube.com/embed/${encodeURIComponent(ref.id)}?autoplay=1`
}

function watchUrl(ref: MediaRef): string {
  if (ref.kind === 'playlist') return `https://www.youtube.com/playlist?list=${encodeURIComponent(ref.id)}`
  if (ref.kind === 'vimeo') return `https://vimeo.com/${encodeURIComponent(ref.id)}`
  if (ref.kind === 'archive') return `https://archive.org/details/${encodeURIComponent(ref.id)}`
  return `https://www.youtube.com/watch?v=${encodeURIComponent(ref.id)}`
}

function thumbFor(ref: MediaRef): string | null {
  if (ref.kind === 'youtube') return `https://img.youtube.com/vi/${encodeURIComponent(ref.id)}/hqdefault.jpg`
  if (ref.kind === 'archive') return `https://archive.org/services/img/${encodeURIComponent(ref.id)}`
  return null
}

// ── UI blocks ────────────────────────────────────────────────────────────────
function Card({ accent, label, children }: { accent: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${accent}55`, borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(3,7,18,.65))' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: accent, padding: '7px 12px', borderBottom: `1px solid ${accent}33` }}>{label}</div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  )
}

function LazyMedia({ refr, title }: { refr: MediaRef; title?: string }) {
  const [play, setPlay] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)
  const thumb = thumbFailed ? null : thumbFor(refr)
  const label = refr.kind === 'playlist' ? 'Playlist' : 'Video'

  return (
    <Card accent="#1af0ff" label={label}>
      {title ? <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{title}</div> : null}
      <div
        onClick={() => !play && setPlay(true)}
        style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 8, overflow: 'hidden', background: '#000', cursor: play ? 'default' : 'pointer' }}
      >
        {play ? (
          <iframe
            src={embedSrc(refr)}
            title={title || label}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        ) : (
          <>
            {thumb ? (
              <img src={thumb} alt={title || label} onError={() => setThumbFailed(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1af0ff', fontSize: 12, fontWeight: 700 }}>{label}</div>
            )}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,0,0,.55)', border: '2px solid rgba(255,255,255,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, paddingLeft: 4 }}>▶</div>
            </div>
          </>
        )}
      </div>
      <a href={watchUrl(refr)} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, display: 'inline-block', marginTop: 8, fontSize: 11.5 }}>
        Watch on source ↗
      </a>
    </Card>
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
        <img src={`https://mermaid.ink/img/${b64url(clean)}?type=png&theme=dark`} alt="Architecture diagram" onError={() => setFailed(true)} style={{ maxWidth: '100%', display: 'block', borderRadius: 8, background: '#fff' }} />
      )}
    </Card>
  )
}

function ImageEmbed({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <a href={src} target="_blank" rel="noopener noreferrer" style={linkStyle}>{src}</a>
  return <img src={src} alt="" onError={() => setFailed(true)} style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 10, display: 'block', margin: '6px 0', border: '1px solid rgba(255,255,255,.12)' }} />
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
      if (!res.ok || !data?.audioUrl) {
        setState('error')
        return
      }
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
      <button onClick={play} disabled={state === 'loading' || state === 'playing'} style={{ background: 'rgba(255,195,0,.14)', border: '1px solid rgba(255,195,0,.45)', color: '#ffc300', borderRadius: 8, padding: '6px 14px', fontWeight: 800, fontSize: 12, cursor: state === 'loading' || state === 'playing' ? 'default' : 'pointer', opacity: state === 'loading' ? 0.7 : 1 }}>{label}</button>
      {state === 'error' && <span style={{ marginLeft: 10, fontSize: 11, color: '#fca5a5' }}>Couldn’t synthesize audio.</span>}
    </Card>
  )
}

// ── Inline text ──────────────────────────────────────────────────────────────
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const token = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0

  while ((m = token.exec(text))) {
    const before = text.slice(last, m.index)
    if (before) out.push(<span key={`${keyBase}-x${i}`}>{before}</span>)

    const label = m[1]
    let link = m[2] || m[3]
    let trailing = ''

    if (m[3]) {
      const tm = link.match(/[.,;:!?)\]]+$/)
      if (tm) {
        trailing = tm[0]
        link = link.slice(0, link.length - trailing.length)
      }
    }

    const refr = mediaRefFromUrl(link)
    if (refr) out.push(<LazyMedia key={`${keyBase}-v${i}`} refr={refr} title={label} />)
    else if (isImageUrl(link)) out.push(<ImageEmbed key={`${keyBase}-i${i}`} src={link} />)
    else out.push(<a key={`${keyBase}-l${i}`} href={link} target="_blank" rel="noopener noreferrer" style={linkStyle}>{label || link}</a>)

    if (trailing) out.push(<span key={`${keyBase}-tr${i}`}>{trailing}</span>)
    last = m.index + m[0].length
    i++
  }

  const tail = text.slice(last)
  if (tail) out.push(<span key={`${keyBase}-xtail`}>{tail}</span>)
  return out
}

function renderText(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const fence = /```(\w*)\n([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0

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

// ── Tolerant structured media extraction ─────────────────────────────────────
function normalizeJsonish(raw: string): string {
  return raw
    .replace(/[\u201C\u201D\u2033\uFF02]/g, '"')
    .replace(/[\u2018\u2019\u2032\uFF07]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
}

function quotedValue(obj: string, key: string): string | undefined {
  const re = new RegExp(`['"]${key}['"]\\s*:\\s*['"]((?:\\\\.|[\\s\\S])*?)['"](?=\\s*[,}])`, 'i')
  const m = obj.match(re)
  return decodeJsonString(m?.[1])
}

function extractMediaItemsFromArray(rawArray: string): MediaItem[] {
  const normalized = normalizeJsonish(rawArray)

  // First try proper JSON.
  try {
    const parsed = JSON.parse(normalized)
    if (Array.isArray(parsed)) {
      return parsed
        .map((o: any): MediaItem | null => {
          if (!o || typeof o !== 'object') return null
          const id = typeof o.id === 'string' ? o.id : typeof o.url === 'string' ? o.url : typeof o.embed === 'string' ? o.embed : ''
          if (!id) return null
          const refr = mediaRefFromTypeAndId(typeof o.type === 'string' ? o.type : undefined, id)
          if (!refr) return null
          return { refr, title: typeof o.title === 'string' ? o.title : undefined }
        })
        .filter(Boolean) as MediaItem[]
    }
  } catch {
    // fall through to regex extraction
  }

  // Regex fallback: this handles invalid JSON caused by model line breaks inside titles.
  const items: MediaItem[] = []
  const objRe = /\{[\s\S]*?\}/g
  let objMatch: RegExpExecArray | null

  while ((objMatch = objRe.exec(normalized))) {
    const obj = objMatch[0]
    const id = quotedValue(obj, 'id') || quotedValue(obj, 'url') || quotedValue(obj, 'embed')
    if (!id) continue
    const type = quotedValue(obj, 'type')
    const title = quotedValue(obj, 'title')
    const refr = mediaRefFromTypeAndId(type, id)
    if (!refr) continue
    items.push({ refr, title })
  }

  return items
}

function findMediaArray(content: string): { before: string; items: MediaItem[]; after: string } | null {
  const text = normalizeJsonish(content)

  const fenced = /```(?:json)?\s*(\[[\s\S]*?\])\s*```/i.exec(text)
  if (fenced) {
    const items = extractMediaItemsFromArray(fenced[1])
    if (items.length > 0) {
      return {
        before: text.slice(0, fenced.index),
        items,
        after: text.slice(fenced.index + fenced[0].length),
      }
    }
  }

  const startMatch = /\[\s*\{/.exec(text)
  if (!startMatch) return null

  // Use the last closing bracket so we tolerate titles containing ] or wrapped output.
  const start = startMatch.index
  const end = text.lastIndexOf(']')
  if (end <= start) return null

  const candidate = text.slice(start, end + 1)
  const items = extractMediaItemsFromArray(candidate)
  if (items.length === 0) return null

  return {
    before: text.slice(0, start),
    items,
    after: text.slice(end + 1),
  }
}

export default function AssistantMessage({ content }: { content: string }) {
  const mediaArray = findMediaArray(content)

  if (mediaArray) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mediaArray.before.trim() ? <div>{renderText(mediaArray.before, 'media-before')}</div> : null}
        {mediaArray.items.map((item, i) => <LazyMedia key={`${item.refr.kind}-${item.refr.id}-${i}`} refr={item.refr} title={item.title} />)}
        {mediaArray.after.trim() ? <div>{renderText(mediaArray.after, 'media-after')}</div> : null}
      </div>
    )
  }

  const blocks: React.ReactNode[] = []
  const slot = /<(ARCHITECTURE_DIAGRAM|STRATEGIC_PITCH|AUDIO_BRIEF_SOURCE|COMPILED_SPEC|VIDEO|PLAYLIST|IMAGE)>([\s\S]*?)<\/\1>/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0

  while ((m = slot.exec(content))) {
    const before = content.slice(last, m.index)
    if (before.trim()) blocks.push(<div key={`pre${i}`}>{renderText(before, `pre${i}`)}</div>)

    const tag = m[1]
    const body = m[2].trim()

    if (tag === 'ARCHITECTURE_DIAGRAM') {
      const mer = /```mermaid\n([\s\S]*?)```/.exec(body)
      blocks.push(<Diagram key={`slot${i}`} code={mer ? mer[1] : body} />)
    } else if (tag === 'STRATEGIC_PITCH') {
      blocks.push(<Card key={`slot${i}`} accent="#ffc300" label="Strategic pitch"><div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(255,255,255,.9)', whiteSpace: 'pre-wrap' }}>{body}</div></Card>)
    } else if (tag === 'AUDIO_BRIEF_SOURCE') {
      blocks.push(<AudioBrief key={`slot${i}`} script={body} />)
    } else if (tag === 'VIDEO' || tag === 'PLAYLIST') {
      const u = (body.match(/https?:\/\/[^\s<>]+/) || [body])[0]
      const refr = mediaRefFromUrl(u) || (tag === 'PLAYLIST' ? { kind: 'playlist' as const, id: body } : { kind: 'youtube' as const, id: body })
      blocks.push(<LazyMedia key={`slot${i}`} refr={refr} />)
    } else if (tag === 'IMAGE') {
      const u = (body.match(/https?:\/\/[^\s<>]+/) || [body])[0]
      blocks.push(<ImageEmbed key={`slot${i}`} src={u} />)
    } else {
      blocks.push(<Card key={`slot${i}`} accent="#1af0ff" label="Compiled spec"><pre style={codeBlock}>{body}</pre></Card>)
    }

    last = m.index + m[0].length
    i++
  }

  const tail = content.slice(last)
  if (tail.trim() || blocks.length === 0) blocks.push(<div key="tail">{renderText(tail, 'tail')}</div>)

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{blocks}</div>
}
