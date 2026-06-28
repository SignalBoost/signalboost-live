'use client'

import { useMemo, useState } from 'react'

const GOLD = '#ffc300'

type QueueStatus = 'needs_approval' | 'in_progress' | 'published' | 'rejected'

type VideoQueueItem = {
  id: string
  title: string
  duration: string
  aspect: string
  niche: string
  format: string
  hero: string
  quality: number
  status: QueueStatus
  progress?: string
  publishLabel?: string
  hook: string
  funnel: string
  previewUrl?: string
  scenes: string[]
}

const initialItems: VideoQueueItem[] = [
  {
    id: 'smb-security-holes',
    title: '3 security holes on a real small-business site',
    duration: '0:48',
    aspect: '9:16',
    niche: 'SMB security',
    format: 'short',
    hero: 'faceless tour',
    quality: 84,
    status: 'needs_approval',
    hook: 'I found 3 holes in this site in 60 seconds.',
    funnel: 'Funnels to the free website check.',
    scenes: [
      'Open with a scan animation and the 60-second promise.',
      'Show three visible risk cards: outdated plugin, weak page trust, missing review proof.',
      'Show SignalBoost turning the scan into a simple checklist.',
      'Close with the free website check CTA.',
    ],
  },
  {
    id: 'meet-boost-tour',
    title: 'Meet Boost — guided tour of SignalBoost',
    duration: '2:10',
    aspect: '16:9',
    niche: 'platform promo',
    format: 'tour',
    hero: 'mascot',
    quality: 71,
    status: 'needs_approval',
    hook: 'One platform: audits, sites, reviews, audio, and video.',
    funnel: 'Channel trailer for YouTube.',
    scenes: [
      'Boost introduces itself as the SignalBoost AI guide.',
      'Tour the console: audits, websites, reviews, audio, and video.',
      'Show how COSA prepares work while the owner approves decisions.',
      'Close with the platform URL and subscribe CTA.',
    ],
  },
  {
    id: 'reviews-flywheel',
    title: 'Reviews flywheel for local clinics',
    duration: '0:32',
    aspect: '9:16',
    niche: 'local clinics',
    format: 'short',
    hero: 'talking guide',
    quality: 79,
    status: 'in_progress',
    progress: 'rendering',
    hook: 'Your reviews can become your next week of content.',
    funnel: 'Promotes review-to-content workflow.',
    scenes: ['Review enters SignalBoost.', 'COSA turns it into posts.', 'Clinic gets a week of branded content.'],
  },
  {
    id: 'site-one-sitting',
    title: 'Build a site in one sitting',
    duration: '0:40',
    aspect: '9:16',
    niche: 'new businesses',
    format: 'short',
    hero: 'SignalBoost AI',
    quality: 76,
    status: 'in_progress',
    progress: 'scheduled · tomorrow 9:00',
    hook: 'Give SignalBoost one idea, and leave with a working website draft.',
    funnel: 'Promotes AI Website Builder.',
    scenes: ['Prompt enters builder.', 'Sections appear.', 'Owner edits and approves.', 'CTA to start a site.'],
  },
  {
    id: 'lose-customers',
    title: 'Why small businesses lose customers',
    duration: '0:56',
    aspect: '9:16',
    niche: 'small business growth',
    format: 'educational short',
    hero: 'faceless tour',
    quality: 82,
    status: 'published',
    publishLabel: 'View on YouTube',
    previewUrl: '#',
    hook: 'Most customers leave before they complain.',
    funnel: 'Awareness content for review tools.',
    scenes: ['Show lost-customer causes.', 'Connect to reviews and trust.', 'CTA to audit customer flow.'],
  },
  {
    id: 'audit-60-sec',
    title: 'Audit a site in 60 seconds',
    duration: '1:00',
    aspect: '9:16',
    niche: 'website audit',
    format: 'short',
    hero: 'dashboard tour',
    quality: 88,
    status: 'published',
    publishLabel: 'View on YouTube',
    previewUrl: '#',
    hook: 'Here is what your homepage says before you say a word.',
    funnel: 'Free website check funnel.',
    scenes: ['Homepage scan.', 'Score gauge.', 'Three quick fixes.', 'CTA.'],
  },
]

function statusLabel(status: QueueStatus) {
  if (status === 'needs_approval') return 'Waiting approval'
  if (status === 'in_progress') return 'In progress'
  if (status === 'published') return 'Published'
  return 'Rejected'
}

export default function CosaVideoQueuePage() {
  const [items, setItems] = useState<VideoQueueItem[]>(initialItems)
  const [selectedId, setSelectedId] = useState(initialItems[0]?.id || '')
  const selected = items.find(item => item.id === selectedId) || items[0]

  const counts = useMemo(() => ({
    needs: items.filter(item => item.status === 'needs_approval').length,
    progress: items.filter(item => item.status === 'in_progress').length,
    published: items.filter(item => item.status === 'published').length,
  }), [items])

  function patch(id: string, status: QueueStatus) {
    setItems(current => current.map(item => item.id === id ? { ...item, status, progress: status === 'in_progress' ? 'rendering' : item.progress } : item))
  }

  const needsApproval = items.filter(item => item.status === 'needs_approval')
  const inProgress = items.filter(item => item.status === 'in_progress')
  const published = items.filter(item => item.status === 'published')

  return (
    <main style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>COSA Video Review Queue</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 36, letterSpacing: '-0.045em' }}>COSA prepares. You approve.</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 880 }}>
          This is the owner approval screen for video work. COSA chooses the niche, hero, format, hook, and funnel. You preview, reject, or approve. Rendering, scheduling, and publishing stay behind approval gates.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 16 }}>
          <Metric label="Need approval" value={counts.needs} />
          <Metric label="In progress" value={counts.progress} />
          <Metric label="Published" value={counts.published} />
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.05fr) minmax(340px, .95fr)', gap: 18, alignItems: 'start' }} className="queueGrid">
        <div style={{ display: 'grid', gap: 18 }}>
          <QueueSection title="Needs your approval" subtitle={`${needsApproval.length} waiting`} items={needsApproval} selectedId={selected?.id} onSelect={setSelectedId} onPatch={patch} />
          <QueueSection title="In progress — no action needed, COSA handles these" subtitle={`${inProgress.length} active`} items={inProgress} selectedId={selected?.id} onSelect={setSelectedId} onPatch={patch} />
          <QueueSection title="Published" subtitle={`${published.length} live`} items={published} selectedId={selected?.id} onSelect={setSelectedId} onPatch={patch} />
        </div>

        {selected && <PreviewPanel item={selected} onPatch={patch} />}
      </section>

      <section style={ruleCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Approval rule</p>
        <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.7, margin: '8px 0 0' }}>
          Approve means COSA can move the concept into rendering or scheduling. Public release still needs a final rendered preview approval before anything is posted or promoted.
        </p>
      </section>

      <style>{`@media (max-width: 980px){.queueGrid{grid-template-columns:1fr!important}}`}</style>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={metricCard}>
      <p style={{ color: 'rgba(255,255,255,.48)', fontSize: 11, margin: 0, textTransform: 'uppercase', fontWeight: 900 }}>{label}</p>
      <p style={{ color: '#fff', fontSize: 30, fontWeight: 950, margin: '5px 0 0' }}>{value}</p>
    </div>
  )
}

function QueueSection({ title, subtitle, items, selectedId, onSelect, onPatch }: { title: string; subtitle: string; items: VideoQueueItem[]; selectedId?: string; onSelect: (id: string) => void; onPatch: (id: string, status: QueueStatus) => void }) {
  return (
    <section style={sectionCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <p className="sb-eyebrow" style={{ margin: 0 }}>{title}</p>
          <p style={{ color: GOLD, fontWeight: 900, margin: '6px 0 0', fontSize: 13 }}>{subtitle}</p>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {items.length === 0 && <p style={{ color: 'rgba(255,255,255,.5)', margin: 0 }}>Nothing here right now.</p>}
        {items.map(item => <QueueCard key={item.id} item={item} active={item.id === selectedId} onSelect={onSelect} onPatch={onPatch} />)}
      </div>
    </section>
  )
}

function QueueCard({ item, active, onSelect, onPatch }: { item: VideoQueueItem; active: boolean; onSelect: (id: string) => void; onPatch: (id: string, status: QueueStatus) => void }) {
  return (
    <article style={{ ...itemCard, border: active ? '1px solid rgba(255,195,0,.55)' : itemCard.border }}>
      <button onClick={() => onSelect(item.id)} style={cardButton}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,.52)', fontSize: 12, margin: 0 }}>{item.aspect} · {item.duration}</p>
            <h3 style={{ color: '#fff', margin: '6px 0 0', fontSize: 18, lineHeight: 1.2 }}>{item.title}</h3>
          </div>
          <Quality value={item.quality} />
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
          <Pill label={`niche: ${item.niche}`} />
          <Pill label={`format: ${item.format}`} />
          <Pill label={`hero: ${item.hero}`} />
        </div>
        <p style={{ color: GOLD, margin: '10px 0 0', fontWeight: 850, fontSize: 13 }}>Hook — “{item.hook}”</p>
        <p style={{ color: 'rgba(255,255,255,.62)', margin: '5px 0 0', fontSize: 13, lineHeight: 1.5 }}>{item.funnel}</p>
        <p style={{ color: 'rgba(255,255,255,.44)', margin: '8px 0 0', fontSize: 12 }}>{item.progress || statusLabel(item.status)}</p>
      </button>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button onClick={() => onSelect(item.id)} style={secondaryButton}>Preview</button>
        {item.status === 'needs_approval' && <button onClick={() => onPatch(item.id, 'rejected')} style={secondaryButton}>Reject</button>}
        {item.status === 'needs_approval' && <button onClick={() => onPatch(item.id, 'in_progress')} style={primaryButton}>Approve</button>}
        {item.status === 'published' && <a href={item.previewUrl || '#'} style={{ ...secondaryButton, textDecoration: 'none' }}>{item.publishLabel || 'View'}</a>}
      </div>
    </article>
  )
}

function PreviewPanel({ item, onPatch }: { item: VideoQueueItem; onPatch: (id: string, status: QueueStatus) => void }) {
  return (
    <aside style={previewCard}>
      <p className="sb-eyebrow" style={{ margin: 0 }}>Preview</p>
      <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 24, lineHeight: 1.15 }}>{item.title}</h2>
      <div style={mockVideo}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, rgba(255,195,0,.25), transparent 34%), linear-gradient(145deg,#020617,#0f172a)' }} />
        <div style={{ position: 'absolute', left: 18, top: 18, color: GOLD, fontWeight: 950, fontSize: 12 }}>{item.aspect} · {item.duration}</div>
        <div style={{ position: 'absolute', right: 18, top: 18 }}><Quality value={item.quality} /></div>
        <div style={{ position: 'absolute', left: 22, right: 22, top: '35%', transform: 'translateY(-35%)' }}>
          <p style={{ color: GOLD, fontWeight: 950, margin: 0, textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 12 }}>{item.hero}</p>
          <h3 style={{ color: '#fff', fontSize: 28, lineHeight: 1.05, margin: '10px 0 0' }}>{item.hook}</h3>
        </div>
        <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, borderRadius: 16, padding: 12, background: 'rgba(2,6,23,.78)', border: '1px solid rgba(255,195,0,.26)', color: '#fff', fontSize: 13, lineHeight: 1.5 }}>
          {item.funnel}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Storyboard</p>
        {item.scenes.map((scene, index) => <div key={`${item.id}-${index}`} style={sceneItem}>{index + 1}. {scene}</div>)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {item.status === 'needs_approval' && <button onClick={() => onPatch(item.id, 'rejected')} style={secondaryButton}>Reject</button>}
        {item.status === 'needs_approval' && <button onClick={() => onPatch(item.id, 'in_progress')} style={primaryButton}>Approve for rendering</button>}
      </div>
    </aside>
  )
}

function Quality({ value }: { value: number }) {
  return <span style={{ color: value >= 80 ? '#86efac' : GOLD, fontSize: 12, fontWeight: 950 }}>quality {value}</span>
}

function Pill({ label }: { label: string }) {
  return <span style={pill}>{label}</span>
}

const heroCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const sectionCard: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }
const metricCard: React.CSSProperties = { border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14, background: 'rgba(0,0,0,.22)' }
const itemCard: React.CSSProperties = { border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14, background: 'rgba(255,255,255,.04)' }
const cardButton: React.CSSProperties = { width: '100%', border: 'none', background: 'transparent', textAlign: 'left', padding: 0, cursor: 'pointer' }
const pill: React.CSSProperties = { color: 'rgba(255,255,255,.78)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 999, padding: '5px 8px', fontSize: 11 }
const previewCard: React.CSSProperties = { position: 'sticky', top: 96, border: '1px solid rgba(255,195,0,.25)', borderRadius: 22, padding: 18, background: 'linear-gradient(145deg, rgba(255,195,0,.08), rgba(15,23,42,.86))', boxShadow: '0 22px 70px rgba(0,0,0,.34)' }
const mockVideo: React.CSSProperties = { position: 'relative', aspectRatio: '16 / 9', borderRadius: 18, overflow: 'hidden', marginTop: 14, border: '1px solid rgba(255,195,0,.28)', background: '#020617' }
const sceneItem: React.CSSProperties = { color: 'rgba(255,255,255,.78)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 10, background: 'rgba(0,0,0,.18)', lineHeight: 1.55 }
const ruleCard: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }
const primaryButton: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
const secondaryButton: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
