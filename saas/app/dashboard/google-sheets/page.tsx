'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type Status = {
  configured: boolean
  readOnly: boolean
  connectUrl: string
  connection: { connected: boolean; expiresAt: string | null; lastError: string | null }
}

type Sheet = { id: string; name: string; modifiedTime: string | null; webViewLink: string | null }

const COPY: Record<Lang, Record<string, string>> = {
  en: { title: 'Google Sheets', sub: 'Connect your Google account for read-only, on-demand spreadsheet access by COS.', connect: 'Connect Google Sheets', disconnect: 'Disconnect', notConfigured: 'Google OAuth credentials are not configured on the server yet.', connected: 'Connected (read-only)', list: 'Load spreadsheets', search: 'Filter spreadsheet names', range: 'A1 range', read: 'Read range', rowSearch: 'Search rows', rowQuery: 'Search term', noRows: 'No rows returned.', loading: 'Loading…' },
  es: { title: 'Google Sheets', sub: 'Conecta tu cuenta de Google para que COS acceda a hojas de cálculo bajo demanda y en modo de solo lectura.', connect: 'Conectar Google Sheets', disconnect: 'Desconectar', notConfigured: 'Las credenciales OAuth de Google aún no están configuradas en el servidor.', connected: 'Conectado (solo lectura)', list: 'Cargar hojas', search: 'Filtrar nombres', range: 'Rango A1', read: 'Leer rango', rowSearch: 'Buscar filas', rowQuery: 'Término de búsqueda', noRows: 'No se devolvieron filas.', loading: 'Cargando…' },
  pt: { title: 'Google Sheets', sub: 'Conecte sua conta Google para acesso sob demanda e somente leitura pelo COS.', connect: 'Conectar Google Sheets', disconnect: 'Desconectar', notConfigured: 'As credenciais OAuth do Google ainda não estão configuradas no servidor.', connected: 'Conectado (somente leitura)', list: 'Carregar planilhas', search: 'Filtrar nomes', range: 'Intervalo A1', read: 'Ler intervalo', rowSearch: 'Pesquisar linhas', rowQuery: 'Termo de pesquisa', noRows: 'Nenhuma linha retornada.', loading: 'Carregando…' },
  pl: { title: 'Google Sheets', sub: 'Połącz konto Google, aby COS miał dostęp do arkuszy na żądanie w trybie tylko do odczytu.', connect: 'Połącz Google Sheets', disconnect: 'Rozłącz', notConfigured: 'Dane OAuth Google nie są jeszcze skonfigurowane na serwerze.', connected: 'Połączono (tylko odczyt)', list: 'Wczytaj arkusze', search: 'Filtruj nazwy', range: 'Zakres A1', read: 'Odczytaj zakres', rowSearch: 'Szukaj wierszy', rowQuery: 'Szukany tekst', noRows: 'Brak zwróconych wierszy.', loading: 'Ładowanie…' },
  ru: { title: 'Google Sheets', sub: 'Подключите аккаунт Google для доступа COS к таблицам по запросу только для чтения.', connect: 'Подключить Google Sheets', disconnect: 'Отключить', notConfigured: 'OAuth-данные Google пока не настроены на сервере.', connected: 'Подключено (только чтение)', list: 'Загрузить таблицы', search: 'Фильтр по названию', range: 'Диапазон A1', read: 'Прочитать диапазон', rowSearch: 'Поиск строк', rowQuery: 'Поисковый запрос', noRows: 'Строки не найдены.', loading: 'Загрузка…' },
}

export default function GoogleSheetsPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang
  const t = COPY[l]
  const [status, setStatus] = useState<Status | null>(null)
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState('')
  const [range, setRange] = useState('Sheet1!A1:Z100')
  const [rowQuery, setRowQuery] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function refreshStatus() {
    const res = await fetch('/api/integrations/google-sheets/status', { cache: 'no-store' })
    if (res.ok) setStatus(await res.json())
  }

  useEffect(() => { void refreshStatus() }, [])

  async function loadSheets() {
    setBusy(true); setMessage('')
    try {
      const res = await fetch(`/api/integrations/google-sheets/spreadsheets?q=${encodeURIComponent(filter)}&limit=50`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.reason || data.error || 'Google Sheets request failed')
      setSheets(Array.isArray(data.spreadsheets) ? data.spreadsheets : [])
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }

  async function runRead(search = false) {
    if (!selected || !range) return
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/integrations/google-sheets/spreadsheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(search
          ? { operation: 'search', spreadsheetId: selected, range, query: rowQuery, limit: 25 }
          : { operation: 'read', spreadsheetId: selected, range, maxRows: 200 }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.reason || data.error || 'Google Sheets request failed')
      setRows(search ? (data.matches || []).map((m: any) => m.values || []) : (data.rows || []))
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }

  async function disconnect() {
    await fetch('/api/integrations/google-sheets/status', { method: 'DELETE' })
    setSheets([]); setRows([]); setSelected('')
    await refreshStatus()
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 className="sb-h2">{t.title}</h1>
      <p className="sb-body">{t.sub}</p>

      {!status ? <p className="sb-body">{t.loading}</p> : null}
      {status && !status.configured ? <div className="sb-card" style={{ padding: 16 }}>{t.notConfigured}</div> : null}
      {status?.configured && !status.connection.connected ? <a className="sb-button-primary" href={status.connectUrl}>{t.connect}</a> : null}
      {status?.connection.connected ? (
        <div className="sb-card" style={{ padding: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <strong>{t.connected}</strong><button className="sb-button-secondary" onClick={disconnect}>{t.disconnect}</button>
          </div>
          {status.connection.lastError ? <p className="sb-caption">{status.connection.lastError}</p> : null}
        </div>
      ) : null}

      {status?.connection.connected ? (
        <>
          <div className="sb-card" style={{ padding: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input className="sb-input" value={filter} onChange={e => setFilter(e.target.value)} placeholder={t.search} style={{ flex: 1, minWidth: 220 }} />
              <button className="sb-button-primary" onClick={loadSheets} disabled={busy}>{t.list}</button>
            </div>
            <select className="sb-input" value={selected} onChange={e => setSelected(e.target.value)} style={{ width: '100%', marginTop: 12 }}>
              <option value="">—</option>
              {sheets.map(sheet => <option key={sheet.id} value={sheet.id}>{sheet.name}</option>)}
            </select>
          </div>

          <div className="sb-card" style={{ padding: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input className="sb-input" value={range} onChange={e => setRange(e.target.value)} placeholder={t.range} style={{ flex: 1, minWidth: 220 }} />
              <button className="sb-button-primary" onClick={() => runRead(false)} disabled={busy || !selected}>{t.read}</button>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <input className="sb-input" value={rowQuery} onChange={e => setRowQuery(e.target.value)} placeholder={t.rowQuery} style={{ flex: 1, minWidth: 220 }} />
              <button className="sb-button-secondary" onClick={() => runRead(true)} disabled={busy || !selected || !rowQuery}>{t.rowSearch}</button>
            </div>
          </div>

          <div className="sb-card" style={{ padding: 0, marginTop: 16, overflow: 'auto', maxHeight: 520 }}>
            {rows.length ? <table style={{ borderCollapse: 'collapse', width: '100%' }}><tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,.08)' }}>{cell}</td>)}</tr>)}</tbody></table> : <p className="sb-body" style={{ padding: 16 }}>{t.noRows}</p>}
          </div>
        </>
      ) : null}

      {message ? <p className="sb-caption" style={{ marginTop: 12 }}>{message}</p> : null}
    </main>
  )
}
