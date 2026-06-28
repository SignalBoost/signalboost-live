'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { QueueVideoPlayer } from '@/lib/cos/ui/QueueVideoPlayer'
import { getVideoQueueCopy, type VideoQueueItemCopy, type VideoQueueStatus } from '@/lib/cos/i18n/videoQueueCopy'

const GOLD = '#ffc300'

type Item = VideoQueueItemCopy
type Status = VideoQueueStatus

function statusText(status: Status, copy: ReturnType<typeof getVideoQueueCopy>) {
  if (status === 'needs_approval') return copy.statusNeeds
  if (status === 'in_progress') return copy.statusProgress
  if (status === 'published') return copy.statusPublished
  return copy.statusRejected
}

export function VideoQueueClient() {
  const { lang } = useTranslation()
  const copy = useMemo(() => getVideoQueueCopy(lang), [lang])
  const [items, setItems] = useState<Item[]>(copy.items)
  const [selectedId, setSelectedId] = useState(copy.items[0].id)

  useMemo(() => {
    setItems(copy.items)
    setSelectedId(copy.items[0].id)
  }, [copy])

  const selected = items.find(item => item.id === selectedId) || items[0]

  const counts = useMemo(() => ({
    needs: items.filter(item => item.status === 'needs_approval').length,
    progress: items.filter(item => item.status === 'in_progress').length,
    published: items.filter(item => item.status === 'published').length,
  }), [items])

  function move(id: string, status: Status) {
    setItems(current => current.map(item => item.id === id ? { ...item, status, progress: status === 'in_progress' ? copy.statusProgress : item.progress } : item))
  }

  return (
    <main style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>{copy.eyebrow}</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 36, letterSpacing: '-0.045em' }}>{copy.headline}</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 880 }}>{copy.intro}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 16 }}>
          <Metric label={copy.metricNeeds} value={counts.needs} />
          <Metric label={copy.metricProgress} value={counts.progress} />
          <Metric label={copy.metricPublished} value={counts.published} />
        </div>
      </section>

      <section className="queueGrid" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px,1fr) minmax(340px,.9fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <Bucket title={copy.bucketNeeds} empty={copy.empty} items={items.filter(item => item.status === 'needs_approval')} selectedId={selected.id} copy={copy} onPreview={setSelectedId} onMove={move} />
          <Bucket title={copy.bucketProgress} empty={copy.empty} items={items.filter(item => item.status === 'in_progress')} selectedId={selected.id} copy={copy} onPreview={setSelectedId} onMove={move} />
          <Bucket title={copy.bucketPublished} empty={copy.empty} items={items.filter(item => item.status === 'published')} selectedId={selected.id} copy={copy} onPreview={setSelectedId} onMove={move} />
        </div>
        <Preview item={selected} copy={copy} onMove={move} />
      </section>
      <style>{`@media (max-width:980px){.queueGrid{grid-template-columns:1fr!important}}`}</style>
    </main>
  )
}

function Bucket({ title, empty, items, selectedId, copy, onPreview, onMove }: { title: string; empty: string; items: Item[]; selectedId: string; copy: ReturnType<typeof getVideoQueueCopy>; onPreview: (id: string) => void; onMove: (id: string, status: Status) => void }) {
  return <section style={panel}><p className="sb-eyebrow" style={{ margin: 0 }}>{title}</p><div style={{ display: 'grid', gap: 10, marginTop: 12 }}>{items.length === 0 && <p style={{ color: 'rgba(255,255,255,.5)' }}>{empty}</p>}{items.map(item => <Card key={item.id} item={item} active={item.id === selectedId} copy={copy} onPreview={onPreview} onMove={onMove} />)}</div></section>
}

function Card({ item, active, copy, onPreview, onMove }: { item: Item; active: boolean; copy: ReturnType<typeof getVideoQueueCopy>; onPreview: (id: string) => void; onMove: (id: string, status: Status) => void }) {
  return <article style={{ ...card, border: active ? '1px solid rgba(255,195,0,.55)' : card.border }}><button onClick={() => onPreview(item.id)} style={openButton}><p style={{ color: 'rgba(255,255,255,.52)', fontSize: 12, margin: 0 }}>{item.aspect} · {item.duration}</p><h3 style={{ color: '#fff', margin: '6px 0 0', fontSize: 18 }}>{item.title}</h3><p style={{ color: GOLD, margin: '8px 0 0', fontWeight: 850 }}>{copy.hookLabel} — “{item.hook}”</p><p style={{ color: 'rgba(255,255,255,.56)', margin: '6px 0 0' }}>{copy.nicheLabel}: {item.niche} · {copy.formatLabel}: {item.format} · {copy.heroLabel}: {item.hero} · {copy.qualityLabel} {item.quality}</p><p style={{ color: 'rgba(255,255,255,.44)', margin: '8px 0 0', fontSize: 12 }}>{item.progress || statusText(item.status, copy)}</p></button><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}><button onClick={() => onPreview(item.id)} style={secondary}>{copy.preview}</button>{item.status === 'needs_approval' && <button onClick={() => onMove(item.id, 'rejected')} style={secondary}>{copy.reject}</button>}{item.status === 'needs_approval' && <button onClick={() => onMove(item.id, 'in_progress')} style={primary}>{copy.approve}</button>}</div></article>
}

function Preview({ item, copy, onMove }: { item: Item; copy: ReturnType<typeof getVideoQueueCopy>; onMove: (id: string, status: Status) => void }) {
  return <aside style={preview}><p className="sb-eyebrow" style={{ margin: 0 }}>{copy.playablePreview}</p><h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 24 }}>{item.title}</h2><QueueVideoPlayer title={item.title} aspect={item.aspect} duration={item.duration} hero={item.hero} hook={item.hook} funnel={item.funnel} quality={item.quality} scenes={item.scenes} labels={{ qualityLabel: copy.qualityLabel, sceneLabel: copy.sceneLabel, playPreview: copy.playPreview, pausePreview: copy.pausePreview, nextScene: copy.nextScene }} /><div style={{ display: 'grid', gap: 8, marginTop: 14 }}>{item.scenes.map((scene, index) => <div key={scene} style={sceneRow}>{index + 1}. {scene}</div>)}</div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>{item.status === 'needs_approval' && <button onClick={() => onMove(item.id, 'rejected')} style={secondary}>{copy.reject}</button>}{item.status === 'needs_approval' && <button onClick={() => onMove(item.id, 'in_progress')} style={primary}>{copy.approveRender}</button>}</div></aside>
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
