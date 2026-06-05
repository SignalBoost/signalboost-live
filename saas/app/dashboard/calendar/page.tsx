'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { getNamedaysForDate } from '@/lib/cultural-calendar/pl-namedays'
import { getRussianNamedaysForDate } from '@/lib/cultural-calendar/ru-namedays'

const GOLD = '#ffc300'

type CalEvent = { id: string; title: string; event_date: string; event_type?: string; notes?: string }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function CalendarPage() {
  const { dict, lang } = useI18n()
  const today = new Date()

  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-11
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // add-event form
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  async function load() {
    setLoading(true)
    setError('')
    const from = ymd(year, month, 1)
    const to = ymd(year, month, daysInMonth)
    try {
      const res = await fetch(`/api/calendar/events?from=${from}&to=${to}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) setError(data?.error || 'Could not load your events.')
      setEvents(Array.isArray(data.events) ? data.events : [])
    } catch {
      setError('Something went wrong loading your calendar.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [year, month])

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {}
    for (const e of events) {
      (map[e.event_date] ||= []).push(e)
    }
    return map
  }, [events])

  function namedaysFor(day: number): string[] {
    const m = month + 1
    if (lang === 'pl') return getNamedaysForDate(m, day)
    if (lang === 'ru') return getRussianNamedaysForDate(m, day)
    return []
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1)
  }

  async function addEvent() {
    if (!selectedDate || !title.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), event_date: selectedDate, notes: notes.trim() || undefined }),
      })
      const data = await res.json()
      if (res.ok && data.event) {
        setEvents(prev => [...prev, data.event])
        setTitle(''); setNotes(''); setSelectedDate(null)
      } else {
        setError(data?.error || 'Could not save the event.')
      }
    } catch {
      setError('Could not save the event.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvent(id: string) {
    try {
      const res = await fetch(`/api/calendar/events?id=${id}`, { method: 'DELETE' })
      if (res.ok) setEvents(prev => prev.filter(e => e.id !== id))
    } catch { /* ignore */ }
  }

  const cells: Array<number | null> = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <span className="sb-eyebrow">Calendar</span>
          <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 0 }}>{MONTHS[month]} {year}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={prevMonth} className="sb-button-secondary">← Prev</button>
          <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }} className="sb-button-secondary">Today</button>
          <button onClick={nextMonth} className="sb-button-secondary">Next →</button>
        </div>
      </div>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p>}
      {loading && <p className="sb-body">Loading calendar…</p>}

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
        {DOW.map(d => (
          <div key={d} className="sb-caption" style={{ textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.06em' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />
          const dateStr = ymd(year, month, day)
          const dayEvents = eventsByDate[dateStr] || []
          const names = namedaysFor(day)
          return (
            <button
              key={dateStr}
              onClick={() => { setSelectedDate(dateStr); setError('') }}
              style={{
                textAlign: 'left',
                minHeight: 104,
                padding: 8,
                borderRadius: 12,
                cursor: 'pointer',
                background: isToday(day) ? 'rgba(255,195,0,.10)' : 'rgba(255,255,255,.03)',
                border: `1px solid ${isToday(day) ? 'rgba(255,195,0,.45)' : 'rgba(255,255,255,.08)'}`,
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 13, color: isToday(day) ? GOLD : '#fff' }}>{day}</span>

              {dayEvents.map(e => (
                <span
                  key={e.id}
                  onClick={ev => { ev.stopPropagation(); deleteEvent(e.id) }}
                  title={`${e.title}${e.notes ? ' — ' + e.notes : ''}\n(click to delete)`}
                  style={{ fontSize: 11, fontWeight: 700, background: 'rgba(26,240,255,.15)', border: '1px solid rgba(26,240,255,.35)', color: '#bdf3ff', borderRadius: 6, padding: '2px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {e.title}
                </span>
              ))}

              {names.length > 0 && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', marginTop: 'auto' }}>
                  🎉 {names.slice(0, 2).join(', ')}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {(lang === 'pl' || lang === 'ru') && (
        <p className="sb-caption" style={{ marginTop: 12 }}>🎉 = name days for this locale. Click any day to add an event; click an event to delete it.</p>
      )}
      {lang !== 'pl' && lang !== 'ru' && (
        <p className="sb-caption" style={{ marginTop: 12 }}>Click any day to add an event; click an event to delete it.</p>
      )}

      {/* Add-event panel */}
      {selectedDate && (
        <div
          onClick={() => setSelectedDate(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} className="sb-card" style={{ padding: 24, width: '100%', maxWidth: 420 }}>
            <h2 className="sb-h3" style={{ marginTop: 0 }}>Add event · {selectedDate}</h2>
            <input
              className="sb-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Event title (e.g. Launch promo)"
              style={{ padding: 12, width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
              onKeyDown={e => { if (e.key === 'Enter') addEvent() }}
            />
            <textarea
              className="sb-input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={3}
              style={{ padding: 12, width: '100%', boxSizing: 'border-box', resize: 'vertical', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setSelectedDate(null)} className="sb-button-secondary">Cancel</button>
              <button onClick={addEvent} disabled={saving || !title.trim()} className="sb-button-primary" style={{ opacity: saving || !title.trim() ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Add event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
