'use client'

import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const CYAN  = '#1af0ff'
const GOLD  = '#ffc300'
const RED   = '#f87171'
const GREEN = '#4ade80'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<string, Record<Lang, string>> = {
  kicker:        { en: 'Link management', es: 'Gestión de enlaces', pt: 'Gestão de links', pl: 'Zarządzanie linkami', ru: 'Управление ссылками' },
  title:         { en: 'URL Shortener', es: 'Acortador de URLs', pt: 'Encurtador de URLs', pl: 'Skracacz URL', ru: 'Сокращатель URL' },
  subtitle:      { en: 'Create short links, track clicks, and manage your link library.', es: 'Crea enlaces cortos, rastrea clics y gestiona tu biblioteca.', pt: 'Crie links curtos, rastreie cliques e gerencie sua biblioteca.', pl: 'Twórz krótkie linki, śledź kliknięcia i zarządzaj biblioteką.', ru: 'Создавайте короткие ссылки, отслеживайте клики и управляйте библиотекой.' },
  longUrlLabel:  { en: 'Long URL', es: 'URL larga', pt: 'URL longa', pl: 'Długi URL', ru: 'Длинный URL' },
  longUrlPh:     { en: 'https://example.com/very/long/path', es: 'https://ejemplo.com/ruta/muy/larga', pt: 'https://exemplo.com/caminho/muito/longo', pl: 'https://przyklad.com/bardzo/dluga/sciezka', ru: 'https://пример.com/очень/длинный/путь' },
  slugLabel:     { en: 'Custom slug (optional)', es: 'Slug personalizado (opcional)', pt: 'Slug personalizado (opcional)', pl: 'Własny slug (opcjonalnie)', ru: 'Свой slug (необязательно)' },
  slugPh:        { en: 'my-link', es: 'mi-enlace', pt: 'meu-link', pl: 'moj-link', ru: 'мой-линк' },
  shorten:       { en: 'Shorten', es: 'Acortar', pt: 'Encurtar', pl: 'Skróć', ru: 'Сократить' },
  shortening:    { en: 'Shortening…', es: 'Acortando…', pt: 'Encurtando…', pl: 'Skracanie…', ru: 'Сокращение…' },
  yourLinks:     { en: 'Your links', es: 'Tus enlaces', pt: 'Seus links', pl: 'Twoje linki', ru: 'Ваши ссылки' },
  noLinks:       { en: 'No links yet — shorten your first URL above.', es: 'Sin enlaces aún — acorta tu primera URL arriba.', pt: 'Nenhum link ainda — encurte seu primeiro URL acima.', pl: 'Brak linków — skróć swój pierwszy URL powyżej.', ru: 'Ссылок пока нет — сократите первый URL выше.' },
  loading:       { en: 'Loading…', es: 'Cargando…', pt: 'Carregando…', pl: 'Ładowanie…', ru: 'Загрузка…' },
  clicks:        { en: 'clicks', es: 'clics', pt: 'cliques', pl: 'kliknięć', ru: 'кликов' },
  copy:          { en: 'Copy', es: 'Copiar', pt: 'Copiar', pl: 'Kopiuj', ru: 'Копировать' },
  copied:        { en: 'Copied!', es: '¡Copiado!', pt: 'Copiado!', pl: 'Skopiowano!', ru: 'Скопировано!' },
  open:          { en: 'Open', es: 'Abrir', pt: 'Abrir', pl: 'Otwórz', ru: 'Открыть' },
  delete:        { en: 'Delete', es: 'Eliminar', pt: 'Excluir', pl: 'Usuń', ru: 'Удалить' },
  confirmDelete: { en: 'Delete this short link? This cannot be undone.', es: '¿Eliminar este enlace? No se puede deshacer.', pt: 'Excluir este link? Isso não pode ser desfeito.', pl: 'Usunąć ten link? Tego nie można cofnąć.', ru: 'Удалить эту ссылку? Это нельзя отменить.' },
  errRequired:   { en: 'Please enter a URL.', es: 'Por favor ingresa una URL.', pt: 'Por favor insira uma URL.', pl: 'Proszę podać URL.', ru: 'Пожалуйста, введите URL.' },
  errInvalid:    { en: 'URL must start with http:// or https://', es: 'La URL debe comenzar con http:// o https://', pt: 'A URL deve começar com http:// ou https://', pl: 'URL musi zaczynać się od http:// lub https://', ru: 'URL должен начинаться с http:// или https://' },
  errLoad:       { en: 'Could not load links.', es: 'No se pudieron cargar los enlaces.', pt: 'Não foi possível carregar os links.', pl: 'Nie można załadować linków.', ru: 'Не удалось загрузить ссылки.' },
  totalLinks:    { en: 'total links', es: 'enlaces totales', pt: 'links totais', pl: 'linków łącznie', ru: 'ссылок всего' },
  totalClicks:   { en: 'total clicks', es: 'clics totales', pt: 'cliques totais', pl: 'kliknięć łącznie', ru: 'кликов всего' },
}

function c(key: string, lang: string): string {
  return COPY[key]?.[lang as Lang] ?? COPY[key]?.en ?? key
}

type ShortLink = {
  id:         string
  slug:       string
  shortUrl:   string
  longUrl:    string
  clickCount: number
  createdAt:  string
}

export default function LinksPage() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [links,       setLinks]       = useState<ShortLink[]>([])
  const [loadError,   setLoadError]   = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [longUrl,     setLongUrl]     = useState('')
  const [customSlug,  setCustomSlug]  = useState('')
  const [formError,   setFormError]   = useState<string | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [copiedId,    setCopiedId]    = useState<string | null>(null)

  const loadLinks = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/shorten')
      const j   = await res.json()
      if (!res.ok) { setLoadError(j?.error ?? c('errLoad', l)); return }
      setLinks(j.links ?? [])
    } catch {
      setLoadError(c('errLoad', l))
    } finally {
      setLoading(false)
    }
  }, [l])

  useEffect(() => { loadLinks() }, [loadLinks])

  async function handleShorten(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const url = longUrl.trim()
    if (!url) { setFormError(c('errRequired', l)); return }
    if (!/^https?:\/\//i.test(url)) { setFormError(c('errInvalid', l)); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/shorten', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ longUrl: url, slug: customSlug.trim().toLowerCase() || undefined }),
      })
      const j = await res.json()
      if (!res.ok) { setFormError(j?.error ?? 'Error'); return }
      setLinks(prev => [j, ...prev])
      setLongUrl('')
      setCustomSlug('')
    } catch {
      setFormError('Request failed — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(c('confirmDelete', l))) return
    const snapshot = links
    setLinks(prev => prev.filter(lk => lk.id !== id))
    try {
      const res = await fetch(`/api/shorten?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) setLinks(snapshot)
    } catch {
      setLinks(snapshot)
    }
  }

  function copyToClipboard(id: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const totalClicks = links.reduce((sum, lk) => sum + lk.clickCount, 0)

  return (
    <div style={{ color: 'var(--text-primary)' }}>

      {/* ── Console header ── */}
      <header className="sb-console" style={{ marginBottom: 0 }}>
        <div className="sb-console__row">
          <div>
            <span className="sb-eyebrow">🔗 {c('kicker', l)}</span>
            <h1>{c('title', l)}</h1>
            <p className="sb-body">{c('subtitle', l)}</p>
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: CYAN }}>{links.length}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>{c('totalLinks', l)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: GOLD }}>{totalClicks}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>{c('totalClicks', l)}</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Create form ── */}
      <section style={{
        margin:       '24px 0',
        padding:      '28px 32px',
        background:   'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
        backdropFilter:       'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border:       '1px solid rgba(255,255,255,.1)',
        borderRadius: 20,
        boxShadow:    '0 24px 70px rgba(0,0,0,.6)',
      }}>
        <form onSubmit={handleShorten} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 280px', minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                {c('longUrlLabel', l)}
              </label>
              <input
                className="sb-input"
                type="url"
                value={longUrl}
                onChange={e => setLongUrl(e.target.value)}
                placeholder={c('longUrlPh', l)}
                style={{ width: '100%' }}
                disabled={submitting}
              />
            </div>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                {c('slugLabel', l)}
              </label>
              <input
                className="sb-input"
                type="text"
                value={customSlug}
                onChange={e => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                placeholder={c('slugPh', l)}
                maxLength={32}
                style={{ width: '100%' }}
                disabled={submitting}
              />
            </div>
            <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="submit"
                className="sb-button-primary"
                disabled={submitting}
                style={{ padding: '12px 28px', fontSize: 14, whiteSpace: 'nowrap' }}
              >
                {submitting ? c('shortening', l) : c('shorten', l)}
              </button>
            </div>
          </div>
          {formError && (
            <p style={{ margin: 0, fontSize: 13, color: RED }}>{formError}</p>
          )}
        </form>
      </section>

      {/* ── Links list ── */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          {c('yourLinks', l)}
        </h2>

        {loadError && (
          <div style={{ padding: '16px 20px', background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 12, color: RED, marginBottom: 16 }}>
            {loadError}
          </div>
        )}

        {loading && (
          <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,.4)' }}>
            {c('loading', l)}
          </div>
        )}

        {!loading && links.length === 0 && !loadError && (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.35)', fontSize: 14 }}>
            {c('noLinks', l)}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {links.map(lk => (
            <article
              key={lk.id}
              style={{
                padding:      '18px 22px',
                background:   'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
                backdropFilter:       'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border:       '1px solid rgba(255,255,255,.08)',
                borderRadius: 16,
                boxShadow:    '0 8px 32px rgba(0,0,0,.4)',
                display:      'flex',
                alignItems:   'center',
                gap:          16,
                flexWrap:     'wrap',
                minWidth:     0,
              }}
            >
              {/* Click badge */}
              <div style={{
                flexShrink:   0,
                minWidth:     64,
                textAlign:    'center',
                padding:      '8px 12px',
                background:   'rgba(26,240,255,.08)',
                border:       '1px solid rgba(26,240,255,.2)',
                borderRadius: 10,
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: CYAN, lineHeight: 1 }}>{lk.clickCount}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>{c('clicks', l)}</div>
              </div>

              {/* URLs */}
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: GOLD, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lk.shortUrl}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lk.longUrl}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.25)', marginTop: 4 }}>
                  {new Date(lk.createdAt).toLocaleDateString()}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                <button
                  onClick={() => copyToClipboard(lk.id, lk.shortUrl)}
                  className="sb-button-secondary"
                  style={{ fontSize: 12, padding: '8px 14px', color: copiedId === lk.id ? GREEN : undefined }}
                >
                  {copiedId === lk.id ? c('copied', l) : c('copy', l)}
                </button>
                <a
                  href={lk.shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sb-button-secondary"
                  style={{ fontSize: 12, padding: '8px 14px', textDecoration: 'none' }}
                >
                  {c('open', l)} ↗
                </a>
                <button
                  onClick={() => handleDelete(lk.id)}
                  className="sb-button-secondary"
                  style={{ fontSize: 12, padding: '8px 14px', color: RED, borderColor: 'rgba(248,113,113,.3)' }}
                >
                  {c('delete', l)}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
