'use client'

import { useMemo, useState } from 'react'
import { QueueVideoPlayer } from '@/lib/cos/ui/QueueVideoPlayer'

const GOLD = '#ffc300'

type Status = 'needs_approval' | 'in_progress' | 'published' | 'rejected'

type Item = {
  id: string
  title: string
  aspect: string
  duration: string
  niche: string
  format: string
  hero: string
  quality: number
  status: Status
  progress?: string
  hook: string
  funnel: string
  scenes: string[]
}

const starterItems: Item[] = [
  {
    id: 'site-trust-short',
    title: '3 website trust fixes for a small business',
    aspect: '9:16',
    duration: '0:48',
    niche: 'SMB trust',
    format: 'short',
    hero: 'faceless tour',
    quality: 84,
    status: 'needs_approval',
    hook: 'I found 3 simple trust fixes in this site in 60 seconds.',
    funnel: 'Funnels to the free website check.',
    scenes: ['Open with a scan animation.', 'Show three improvement cards.', 'Turn the scan into a checklist.', 'Close with the free check CTA.'],
  },
  {
    id: 'platform-tour',
    title: 'Meet Boost — guided tour of SignalBoost',
    aspect: '16:9',
    duration: '2:10',
    niche: 'platform promo',
    format: 'tour',
    hero: 'mascot',
    quality: 71,
    status: 'needs_approval',
    hook: 'One platform: websites, reviews, audio, video, and approvals.',
    funnel: 'Channel trailer for the platform.',
    scenes: ['Boost introduces the platform.', 'Tour websites and reviews.', 'Show approvals.', 'Close with the platform URL.'],
  },
  {
    id: 'reviews-short',
    title: 'Reviews flywheel for local clinics',
    aspect: '9:16',
    duration: '0:32',
    niche: 'local clinics',
    format: 'short',
    hero: 'talking guide',
    quality: 79,
    status: 'in_progress',
    progress: 'rendering',
    hook: 'Your reviews can become your next week of content.',
    funnel: 'Promotes review-to-content workflow.',
    scenes: ['Review enters SignalBoost.', 'COSA creates content.', 'Clinic gets branded posts.'],
  },
  {
    id: 'customer-loss',
    title: 'Why small businesses lose customers',
    aspect: '9:16',
    duration: '0:56',
    niche: 'business growth',
    format: 'educational short',
    hero: 'dashboard tour',
    quality: 82,
    status: 'published',
    hook: 'Most customers leave before they complain.',
    funnel: 'Awareness content for review tools.',
    scenes: ['Show customer friction.', 'Connect reviews and trust.', 'Close with a check CTA.'],
  },
]

function label(status: Status) {
  if (status === 'needs_approval') return 'Waiting approval'
  if (status === 'in_progress') return 'In progress'
  if (status === 'published') return 'Published'
  return 'Rejected'
}

export function VideoQueueClient() {
  const [items, setItems] = useState(starterItems)
  const [selectedId, setSelectedId] = useState(starterItems[0].id)
  const selected = items.find(item => item.id === selectedId) || items[0]

  const counts = useMemo(() => ({
    needs: items.filter(item => item.status === 'needs_approval').length,
    progress: items.filter(item => item.status === 'in_progress').length,
    published: items.filter(item => item.status === 'published').length,
  }), [items])

  function move(id: string, status: Status) {
    setItems(current => current.map(item => item.id === id ? { ...item, status, progress: status === 'in_progress' ? 'rendering' : item.progress } : item))
  }

  return (
    <main style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>COSA Video Review Queue</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 36, letterSpacing: '-0.045em' }}>COSA prepares. You approve.</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 880 }}>Click Preview, then use Play preview in the right panel. This is a browser-rendered draft; final MP4 rendering is the next worker stage.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 16 }}>
          <Metric label="Need approval" value={counts.needs} />
          <Metric label="In progress" value={counts.progress} />
          <Metric label="Published" value={counts.published} />
        </div>
      </section>

      <section className="queueGrid" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px,1fr) minmax(340px,.9fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <Bucket title="Needs your approval" items={items.filter(item => item.status === 'needs_approval')} selectedId={selected.id} onPreview={setSelectedId} onMove={move} />
          <Bucket title="In progress — no action needed" items={items.filter(item => item.status === 'in_progress')} selectedId={selected.id} onPreview={setSelectedId} onMove={move} />
          <Bucket title="Published" items={items.filter(item => item.status === 'published')} selectedId={selected.id} onPreview={setSelectedId} onMove={move} />
        </div>
        <Preview item={selected} onMove={move} />
      </section>
      <style>{`@media (max-width:980px){.queueGrid{grid-template-columns:1fr!important}}`}</style>
    </main>
  )
}

function Bucket({ title, items, selectedId, onPreview, onMove }: { title: string; items: Item[]; selectedId: string; onPreview: (id: string) => void; onMove: (id: string, status: Status) => void }) {
  return <section style={panel}><p className="sb-eyebrow" style={{ margin: 0 }}>{title}</p><div style={{ display: 'grid', gap: 10, marginTop: 12 }}>{items.length === 0 && <p style={{ color: 'rgba(255,255,255,.5)' }}>Nothing here right now.</p>}{items.map(item => <Card key={item.id} item={item} active={item.id === selectedId} onPreview={onPreview} onMove={onMove} />)}</div></section>
}

function Card({ item, active, onPreview, onMove }: { item: Item; active: boolean; onPreview: (id: string) => void; onMove: (id: string, status: Status) => void }) {
  return <article style={{ ...card, border: active ? '1px solid rgba(255,195,0,.55)' : card.border }}><button onClick={() => onPreview(item.id)} style={openButton}><p style={{ color: 'rgba(255,255,255,.52)', fontSize: 12, margin: 0 }}>{item.aspect} · {item.duration}</p><h3 style={{ color: '#fff', margin: '6px 0 0', fontSize: 18 }}>{item.title}</h3><p style={{ color: GOLD, margin: '8px 0 0', fontWeight: 850 }}>Hook — “{item.hook}”</p><p style={{ color: 'rgba(255,255,255,.56)', margin: '6px 0 0' }}>niche: {item.niche} · format: {item.format} · hero: {item.hero} · quality {item.quality}</p><p style={{ color: 'rgba(255,255,255,.44)', margin: '8px 0 0', fontSize: 12 }}>{item.progress || label(item.status)}</p></button><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}><button onClick={() => onPreview(item.id)} style={secondary}>Preview</button>{item.status === 'needs_approval' && <button onClick={() => onMove(item.id, 'rejected')} style={secondary}>Reject</button>}{item.status === 'needs_approval' && <button onClick={() => onMove(item.id, 'in_progress')} style={primary}>Approve</button>}</div></article>
}

function Preview({ item, onMove }: { item: Item; onMove: (id: string, status: Status) => void }) {
  return <aside style={preview}><p className="sb-eyebrow" style={{ margin: 0 }}>Playable preview</p><h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 24 }}>{item.title}</h2><QueueVideoPlayer title={item.title} aspect={item.aspect} duration={item.duration} hero={item.hero} hook={item.hook} funnel={item.funnel} quality={item.quality} scenes={item.scenes} /><div style={{ display: 'grid', gap: 8, marginTop: 14 }}>{item.scenes.map((scene, index) => <div key={scene} style={sceneRow}>{index + 1}. {scene}</div>)}</div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>{item.status === 'needs_approval' && <button onClick={() => onMove(item.id, 'rejected')} style={secondary}>Reject</button>}{item.status === 'needs_approval' && <button onClick={() => onMove(item.id, 'in_progress')} style={primary}>Approve for rendering</button>}</div></aside>
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div style={metric}><p style={{ color: 'rgba(255,255,255,.48)', fontSize: 11, margin: 0, textTransform: 'uppercase', fontWeight: 900 }}>{label}</p><p style={{ color: '#fff', fontSize: 30, fontWeight: 950, margin: '5px 0 0' }}>{value}</p></div>
}

const heroCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }
const metric: React.CSSProperties = { border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14, background: 'rgba(0,0,0,.22)' }
const card: React.CSSProperties = { border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14, background: 'rgba(255,255,255,.04)' }
const openButton: React.CSSProperties = { width: '100%', border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }
const preview: React.CSSProperties = { position: 'sticky', top: 96, border: '1px solid rgba(255,195,0,.25)', borderRadius: 22, padding: 18, background: 'linear-gradient(145deg, rgba(255,195,0,.08), rgba(15,23,42,.86))', boxShadow: '0 22px 70px rgba(0,0,0,.34)' }
const sceneRow: React.CSSProperties = { color: 'rgba(255,255,255,.78)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 10, background: 'rgba(0,0,0,.18)', lineHeight: 1.55 }
const primary: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
const secondary: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
