'use client'

// saas/components/AssistantMessage.tsx
// Renders an assistant message with awareness of rich blocks produced by the COS:
//   <ARCHITECTURE_DIAGRAM> → rendered Mermaid diagram
//   <STRATEGIC_PITCH>      → pitch card
//   <AUDIO_BRIEF_SOURCE>   → playable audio brief (ElevenLabs /api/tts)
//   <COMPILED_SPEC>        → spec card
//   <VIDEO> / <PLAYLIST> / <IMAGE> → lazy media blocks
//   a JSON array of {title,type,id} → lazy video/playlist thumbnails (play on click)
//   markdown links, bare URLs, image URLs, ```mermaid / ``` code, plain text
//
// Security: embeds are built here from the id + type. Model-supplied iframe/embed
// HTML is never injected.

import { useState } from 'react'

const TTS_VOICE = 'EXAVITQu4vr4xnSDxMaL'

const codeBlock: React.CSSProperties = {
  margin: 0, padding: '10px 12px', borderRadius: 8, background: 'rgba(3,7,18,.6)',
  border: '1px solid rgba(255,255,255,.10)', color: '#cfe3ff', fontSize: 11.5,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap',
  overflowX: 'auto', maxHeight: 320, overflowY: 'auto',
}
const linkStyle: React.CSSProperties = { color: '#1af0ff', textDecoration: 'underline', wordBreak: 'break-word' }

function b64url(s: string): string {
  const b = btoa(unescape(encodeURIComponent(s)))
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ── ID extractors ────────────────────────────────────────────────────────────
function ytId(u: string): string | null {
  const m = u.match(/[?&]v=([A-Za-z0-9_-]{11})/) || u.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) || u.match(/youtube\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}
function playlistId(u: string): string | null {
  const m = u.match(/[?&]list=([A-Za-z0-9_-]+)/)
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

// Resolve a URL (or bare id) to a playable media reference.
function mediaRefFromUrl(url: string): MediaRef | null {
  const pl = playlistId(url); if (pl) return { kind: 'playlist', id: pl }
  const yt = ytId(url); if (yt) return { kind: 'youtube', id: yt }
  const vm = vimeoId(url); if (vm) return { kind: 'vimeo', id: vm }
  const ar = archiveId(url); if (ar) return { kind: 'archive', id: ar }
  return null
}

function embedSrc(ref: MediaRef): string {
  if (ref.kind === 'playlist') return `https://www.youtube.com/embed/videoseries?list=${ref.id}&autoplay=1`
  if (ref.kind === 'vimeo') return `https://player.vimeo.com/video/${ref.id}?autoplay=1`
  if (ref.kind === 'archive') return `https://archive.org/embed/${ref.id}`
  return `https://www.youtube.com/embed/${ref.id}?autoplay=1`
}
function watchUrl(ref: MediaRef): string {
  if (ref.kind === 'playlist') return `https://www.youtube.com/playlist?list=${ref.id}`
  if (ref.kind === 'vimeo') return `https://vimeo.com/${ref.id}`
  if (ref.kind === 'archive') return `https://archive.org/details/${ref.id}`
  return `https://www.youtube.com/watch?v=${ref.id}`
}
function thumbFor(ref: MediaRef): string | null {
  if (ref.kind === 'youtube') return `https://img.youtube.com/vi/${ref.id}/hqdefault.jpg`
  if (ref.kind === 'archive') return `https://archive.org/services/img/${ref.id}`
  return null // vimeo/playlist thumbnails need an API; show a placeholder instead
}

// ── Building blocks ──────────────────────────────────────────────────────────
function Card({ accent, label, children }: { accent: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${accent}55`, borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(3,7,18,.65))' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: accent, padding: '7px 12px', borderBottom: `1px solid ${accent}33` }}>{label}</div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  )
}

// Lazy media: shows a thumbnail with a play button; loads the iframe only on click.
function LazyMedia({ refr, title }: { refr: MediaRef; title?: string }) {
  const [play, setPlay] = useState(false)
  const thumb = thumbFor(refr)
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
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
          />
        ) : (
          <>
            {thumb ? (
              <img src={thumb} alt={title || label} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1af0ff', fontSize: 12, fontWeight: 700 }}>{label}</div>
            )}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ text: clean.slice(0, 1800), voiceId: TTS_VOICE }) })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.audioUrl) { setState('error'); return }
      const audio = new Audio(data.audioUrl)
      audio.onended = () => setState('idle'); audio.onerror = () => setState('error')
      await audio.play(); setState('playing')
    } catch { setState('error') }
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

// ── Inline text: markdown links / bare urls → media, image, or link ──────────
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const token = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = token.exec(text))) {
    const before = text.slice(last, m.index)
    if (before) out.push(<span key={`${keyBase}-x${i}`}>{before}</span>)
    const label = m[1]
    let link = m[2] || m[3]
    let trailing = ''
    if (m[3]) { const tm = link.match(/[.,;:!?)\]]+$/); if (tm) { trailing = tm[0]; link = link.slice(0, link.length - trailing.length) } }
    const refr = mediaRefFromUrl(link)
    if (refr) out.push(<LazyMedia key={`${keyBase}-v${i}`} refr={refr} />)
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

// Render ordinary text, lifting ```mermaid into diagrams and ``` into code.
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

// ── Structured video-array support (the COS structured-output format) ────────
// Models routinely "prettify" their JSON: curly quotes (“ ” ‘ ’), trailing
// commas, code fences, stray whitespace. Strict JSON.parse fails on all of
// those, which would drop the player back to raw text — the exact symptom we
// are fixing. So this is deliberately tolerant: normalize the candidate, try a
// strict parse, and if that still fails, regex-extract the {type,id,title}
// triples directly. A non-media JSON array (no usable media id) returns null
// and falls through to normal text rendering.
type VidTriple = { id: string; type?: string; title?: string }

function mediaKindFor(type: string | undefined): MediaRef['kind'] {
  return type === 'playlist' ? 'playlist' : type === 'archive' ? 'archive' : 'youtube'
}

// Does this id/type pair actually look like playable media? Guards against
// rendering an unrelated array that merely happens to contain an "id" field.
function isMediaItem(t: VidTriple): boolean {
  if (t.type === 'video' || t.type === 'playlist' || t.type === 'archive' || t.type === 'youtube' || t.type === 'vimeo') return true
  if (mediaRefFromUrl(t.id)) return true
  if (/^[A-Za-z0-9_-]{11}$/.test(t.id)) return true // bare YouTube id
  return false
}

function normalizeJsonish(raw: string): string {
  return raw
    .replace(/[\u201C\u201D\u2033\uFF02]/g, '"') // “ ” ″ ＂ → "
    .replace(/[\u2018\u2019\u2032\uFF07]/g, "'") // ‘ ’ ′ ＇ → '
    .replace(/,\s*([}\]])/g, '$1')               // trailing commas
}

function findVideoArray(content: string): { before: string; items: { refr: MediaRef; title?: string }[]; after: string } | null {
  // 1) Locate a candidate array span. Prefer a fenced ```json [ ... ] ``` block;
  //    otherwise span from the first "[{" to the last "]" (tolerates trailing
  //    commas and pretty-printing that the simple non-greedy regex would miss).
  let start = -1
  let end = -1
  let raw = ''
  const fence = /```(?:json)?\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/.exec(content)
  if (fence) {
    raw = fence[1]
    start = fence.index
    end = fence.index + fence[0].length
  } else {
    const open = /\[\s*\{/.exec(content)
    if (open) {
      start = open.index
      end = content.lastIndexOf(']') + 1
      if (end > start) raw = content.slice(start, end)
    }
  }
  if (!raw || start < 0 || end <= start) return null

  const normalized = normalizeJsonish(raw)

  // 2) Strict parse first; if it fails, regex-extract the triples.
  let triples: VidTriple[] = []
  let parsed: any = null
  try { parsed = JSON.parse(normalized) } catch { parsed = null }
  if (Array.isArray(parsed) && parsed.length && parsed.every(o => o && typeof o === 'object')) {
    triples = parsed
      .map((o: any): VidTriple => ({
        id: typeof o.id === 'string' ? o.id : typeof o.url === 'string' ? o.url : typeof o.embed === 'string' ? o.embed : '',
        type: typeof o.type === 'string' ? o.type : undefined,
        title: typeof o.title === 'string' ? o.title : undefined,
      }))
      .filter((t: VidTriple) => t.id)
  } else {
    const objRe = /\{[^{}]*?["']id["']\s*:\s*["']([^"']+)["'][^{}]*?\}/g
    let mm: RegExpExecArray | null
    while ((mm = objRe.exec(normalized))) {
      const obj = mm[0]
      const typeM = /["']type["']\s*:\s*["']([^"']+)["']/.exec(obj)
      const titleM = /["']title["']\s*:\s*["']([^"']+)["']/.exec(obj)
      triples.push({ id: mm[1], type: typeM ? typeM[1] : undefined, title: titleM ? titleM[1] : undefined })
    }
  }

  // 3) Require every parsed item to be real media — otherwise this was an
  //    ordinary JSON array, not a video block. Don't hijack it.
  if (!triples.length || !triples.every(isMediaItem)) return null

  const items = triples.map((t: VidTriple) => {
    const refr = mediaRefFromUrl(t.id) || { kind: mediaKindFor(t.type), id: t.id }
    return { refr, title: t.title }
  })
  return { before: content.slice(0, start), items, after: content.slice(end) }
}

export default function AssistantMessage({ content }: { content: string }) {
  // Structured video array first (lazy thumbnails that play on click).
  const va = findVideoArray(content)
  if (va) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {va.before.trim() ? <div>{renderText(va.before, 'vb')}</div> : null}
        {va.items.map((v, i) => <LazyMedia key={`va${i}`} refr={v.refr} title={v.title} />)}
        {va.after.trim() ? <div>{renderText(va.after, 'va')}</div> : null}
      </div>
    )
  }

  const blocks: React.ReactNode[] = []
  const slot = /<(ARCHITECTURE_DIAGRAM|STRATEGIC_PITCH|AUDIO_BRIEF_SOURCE|COMPILED_SPEC|VIDEO|PLAYLIST|IMAGE)>([\s\S]*?)<\/\1>/g
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
