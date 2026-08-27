'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { googleSheetsCopy } from '@/lib/i18n/googleSheetsCopy'

type Status = {
  configured: boolean
  readOnly: boolean
  connectUrl: string
  connection: { connected: boolean; expiresAt: string | null; lastError: string | null }
}

type Sheet = { id: string; name: string; modifiedTime: string | null; webViewLink: string | null }

export default function GoogleSheetsPage() {
  const { lang } = useI18n()
  const t = googleSheetsCopy(lang)
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
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch(`/api/integrations/google-sheets/spreadsheets?q=${encodeURIComponent(filter)}&limit=50`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.reason || data.error || 'google_sheets_request_failed')
      setSheets(Array.isArray(data.spreadsheets) ? data.spreadsheets : [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function runRead(search = false) {
    if (!selected || !range) return
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/integrations/google-sheets/spreadsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(search
          ? { operation: 'search', spreadsheetId: selected, range, query: rowQuery, limit: 25 }
          : { operation: 'read', spreadsheetId: selected, range, maxRows: 200 }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.reason || data.error || 'google_sheets_request_failed')
      setRows(search ? (data.matches || []).map((m: any) => m.values || []) : (data.rows || []))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    await fetch('/api/integrations/google-sheets/status', { method: 'DELETE' })
    setSheets([])
    setRows([])
    setSelected('')
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
            <strong>{t.connected}</strong>
            <button className="sb-button-secondary" onClick={disconnect}>{t.disconnect}</button>
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
            {rows.length ? (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => <td key={c} style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,.08)' }}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="sb-body" style={{ padding: 16 }}>{t.noRows}</p>}
          </div>
        </>
      ) : null}

      {message ? <p className="sb-caption" style={{ marginTop: 12 }}>{message}</p> : null}
    </main>
  )
}
