'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { getNamedaysForDate } from '@/lib/cultural-calendar/pl-namedays'
import { getRussianNamedaysForDate } from '@/lib/cultural-calendar/ru-namedays'

const GOLD = '#ffc300'

type CalEvent = {
  id: string
  title: string
  event_date: string
  event_type?: string
  notes?: string
}

type CalendarCopy = {
  eyebrow: string
  prev: string
  today: string
  next: string
  loadError: string
  genericLoadError: string
  saveError: string
  loading: string
  nameDaysHelp: string
  regularHelp: string
  addEvent: string
  eventTitlePlaceholder: string
  notesPlaceholder: string
  cancel: string
  saving: string
  addEventButton: string
  clickToDelete: string
  months: string[]
  weekdays: string[]
}

const COPY: Record<string, CalendarCopy> = {
  en: {
    eyebrow: 'Calendar',
    prev: '← Prev',
    today: 'Today',
    next: 'Next →',
    loadError: 'Could not load your events.',
    genericLoadError: 'Something went wrong loading your calendar.',
    saveError: 'Could not save the event.',
    loading: 'Loading calendar…',
    nameDaysHelp: '🎉 = name days for this locale. Click any day to add an event; click an event to delete it.',
    regularHelp: 'Click any day to add an event; click an event to delete it.',
    addEvent: 'Add event',
    eventTitlePlaceholder: 'Event title (e.g. Launch promo)',
    notesPlaceholder: 'Notes (optional)',
    cancel: 'Cancel',
    saving: 'Saving…',
    addEventButton: 'Add event',
    clickToDelete: 'click to delete',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
  pt: {
    eyebrow: 'Calendário',
    prev: '← Anterior',
    today: 'Hoje',
    next: 'Próximo →',
    loadError: 'Não foi possível carregar seus eventos.',
    genericLoadError: 'Algo deu errado ao carregar seu calendário.',
    saveError: 'Não foi possível salvar o evento.',
    loading: 'Carregando calendário…',
    nameDaysHelp: '🎉 = dias de nomes para este idioma. Clique em qualquer dia para adicionar um evento; clique em um evento para excluí-lo.',
    regularHelp: 'Clique em qualquer dia para adicionar um evento; clique em um evento para excluí-lo.',
    addEvent: 'Adicionar evento',
    eventTitlePlaceholder: 'Título do evento (ex.: Promoção de lançamento)',
    notesPlaceholder: 'Notas (opcional)',
    cancel: 'Cancelar',
    saving: 'Salvando…',
    addEventButton: 'Adicionar evento',
    clickToDelete: 'clique para excluir',
    months: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
    weekdays: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  },
  es: {
    eyebrow: 'Calendario',
    prev: '← Anterior',
    today: 'Hoy',
    next: 'Siguiente →',
    loadError: 'No se pudieron cargar tus eventos.',
    genericLoadError: 'Algo salió mal al cargar tu calendario.',
    saveError: 'No se pudo guardar el evento.',
    loading: 'Cargando calendario…',
    nameDaysHelp: '🎉 = días onomásticos para este idioma. Haz clic en cualquier día para agregar un evento; haz clic en un evento para eliminarlo.',
    regularHelp: 'Haz clic en cualquier día para agregar un evento; haz clic en un evento para eliminarlo.',
    addEvent: 'Agregar evento',
    eventTitlePlaceholder: 'Título del evento (ej.: Promoción de lanzamiento)',
    notesPlaceholder: 'Notas (opcional)',
    cancel: 'Cancelar',
    saving: 'Guardando…',
    addEventButton: 'Agregar evento',
    clickToDelete: 'clic para eliminar',
    months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    weekdays: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  },
  pl: {
    eyebrow: 'Kalendarz',
    prev: '← Poprzedni',
    today: 'Dzisiaj',
    next: 'Następny →',
    loadError: 'Nie można załadować wydarzeń.',
    genericLoadError: 'Coś poszło nie tak podczas ładowania kalendarza.',
    saveError: 'Nie można zapisać wydarzenia.',
    loading: 'Ładowanie kalendarza…',
    nameDaysHelp: '🎉 = imieniny dla tego języka. Kliknij dowolny dzień, aby dodać wydarzenie; kliknij wydarzenie, aby je usunąć.',
    regularHelp: 'Kliknij dowolny dzień, aby dodać wydarzenie; kliknij wydarzenie, aby je usunąć.',
    addEvent: 'Dodaj wydarzenie',
    eventTitlePlaceholder: 'Tytuł wydarzenia (np. promocja startowa)',
    notesPlaceholder: 'Notatki (opcjonalnie)',
    cancel: 'Anuluj',
    saving: 'Zapisywanie…',
    addEventButton: 'Dodaj wydarzenie',
    clickToDelete: 'kliknij, aby usunąć',
    months: ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'],
    weekdays: ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'],
  },
  ru: {
    eyebrow: 'Календарь',
    prev: '← Назад',
    today: 'Сегодня',
    next: 'Далее →',
    loadError: 'Не удалось загрузить ваши события.',
    genericLoadError: 'Что-то пошло не так при загрузке календаря.',
    saveError: 'Не удалось сохранить событие.',
    loading: 'Загрузка календаря…',
    nameDaysHelp: '🎉 = именины для этого языка. Нажмите на любой день, чтобы добавить событие; нажмите на событие, чтобы удалить его.',
    regularHelp: 'Нажмите на любой день, чтобы добавить событие; нажмите на событие, чтобы удалить его.',
    addEvent: 'Добавить событие',
    eventTitlePlaceholder: 'Название события (например: промо запуска)',
    notesPlaceholder: 'Заметки (необязательно)',
    cancel: 'Отмена',
    saving: 'Сохранение…',
    addEventButton: 'Добавить событие',
    clickToDelete: 'нажмите, чтобы удалить',
    months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    weekdays: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  },
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function copyFor(lang: string): CalendarCopy {
  return COPY[lang] || COPY.en
}

export default function CalendarPage() {
  const { lang } = useI18n()
  const copy = copyFor(lang)
  const today = new Date()

  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

      if (!res.ok) {
        setError(data?.error || copy.loadError)
      }

      setEvents(Array.isArray(data.events) ? data.events : [])
    } catch {
      setError(copy.genericLoadError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, lang])

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {}

    for (const event of events) {
      ;(map[event.event_date] ||= []).push(event)
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
    if (month === 0) {
      setMonth(11)
      setYear((value) => value - 1)
    } else {
      setMonth((value) => value - 1)
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0)
      setYear((value) => value + 1)
    } else {
      setMonth((value) => value + 1)
    }
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
        setEvents((previous) => [...previous, data.event])
        setTitle('')
        setNotes('')
        setSelectedDate(null)
      } else {
        setError(data?.error || copy.saveError)
      }
    } catch {
      setError(copy.saveError)
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvent(id: string) {
    try {
      const res = await fetch(`/api/calendar/events?id=${id}`, { method: 'DELETE' })

      if (res.ok) {
        setEvents((previous) => previous.filter((event) => event.id !== id))
      }
    } catch {
      // Ignore delete failures so the calendar stays usable.
    }
  }

  const cells: Array<number | null> = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <span className="sb-eyebrow">{copy.eyebrow}</span>
          <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 0 }}>
            {copy.months[month]} {year}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={prevMonth} className="sb-button-secondary">{copy.prev}</button>
          <button
            onClick={() => {
              setYear(today.getFullYear())
              setMonth(today.getMonth())
            }}
            className="sb-button-secondary"
          >
            {copy.today}
          </button>
          <button onClick={nextMonth} className="sb-button-secondary">{copy.next}</button>
        </div>
      </div>

      {error ? <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p> : null}
      {loading ? <p className="sb-body">{copy.loading}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
        {copy.weekdays.map((weekday) => (
          <div key={weekday} className="sb-caption" style={{ textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {weekday}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {cells.map((day, index) => {
          if (day === null) return <div key={`empty-${index}`} />

          const dateStr = ymd(year, month, day)
          const dayEvents = eventsByDate[dateStr] || []
          const names = namedaysFor(day)

          return (
            <button
              key={dateStr}
              onClick={() => {
                setSelectedDate(dateStr)
                setError('')
              }}
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

              {dayEvents.map((event) => (
                <span
                  key={event.id}
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation()
                    deleteEvent(event.id)
                  }}
                  title={`${event.title}${event.notes ? ` — ${event.notes}` : ''}\n(${copy.clickToDelete})`}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'rgba(26,240,255,.15)',
                    border: '1px solid rgba(26,240,255,.35)',
                    color: '#bdf3ff',
                    borderRadius: 6,
                    padding: '2px 6px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {event.title}
                </span>
              ))}

              {names.length > 0 ? (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', marginTop: 'auto' }}>
                  🎉 {names.slice(0, 2).join(', ')}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <p className="sb-caption" style={{ marginTop: 12 }}>
        {lang === 'pl' || lang === 'ru' ? copy.nameDaysHelp : copy.regularHelp}
      </p>

      {selectedDate ? (
        <div
          onClick={() => setSelectedDate(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 1000,
          }}
        >
          <div onClick={(event) => event.stopPropagation()} className="sb-card" style={{ padding: 24, width: '100%', maxWidth: 420 }}>
            <h2 className="sb-h3" style={{ marginTop: 0 }}>
              {copy.addEvent} · {selectedDate}
            </h2>

            <input
              className="sb-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={copy.eventTitlePlaceholder}
              style={{ padding: 12, width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addEvent()
              }}
            />

            <textarea
              className="sb-input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={copy.notesPlaceholder}
              rows={3}
              style={{ padding: 12, width: '100%', boxSizing: 'border-box', resize: 'vertical', marginBottom: 14 }}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setSelectedDate(null)} className="sb-button-secondary">
                {copy.cancel}
              </button>

              <button onClick={addEvent} disabled={saving || !title.trim()} className="sb-button-primary" style={{ opacity: saving || !title.trim() ? 0.6 : 1 }}>
                {saving ? copy.saving : copy.addEventButton}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
