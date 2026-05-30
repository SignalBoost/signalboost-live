'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'

type HistoryPayload = {
  groupedItems: Record<string, Array<{ id: string; name: string; description?: string; source_url?: string }>>
  sources: Array<{ id: string; type: string; config: Record<string, unknown>; created_at: string }>
}

export default function DataConnectorsPage() {
  const { t } = useTranslation()
  const [csvText, setCsvText] = useState('name,category,description,image_url,source_url\nFC Barcelona,Football Teams,Spanish football club,https://example.com/barca.jpg,https://www.fcbarcelona.com')
  const [apiEndpoint, setApiEndpoint] = useState('https://example.com/api/items')
  const [apiMapping, setApiMapping] = useState('{"name":"name","category":"category","description":"description","image_url":"image","source_url":"url"}')
  const [scraperJson, setScraperJson] = useState('[{"name":"Louvre Museum","category":"Museums","description":"Museum in Paris","image_url":"https://example.com/louvre.jpg","source_url":"https://www.louvre.fr"}]')
  const [history, setHistory] = useState<HistoryPayload>({ groupedItems: {}, sources: [] })
  const [status, setStatus] = useState('')

  async function refresh() {
    const res = await fetch('/api/data-connectors/history')
    const data = await res.json()
    setHistory(data)
  }

  useEffect(() => { refresh() }, [])

  async function submit(payload: Record<string, unknown>) {
    setStatus(t('data.importing', 'Importing...'))
    const res = await fetch('/api/data-connectors/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setStatus(
      res.ok
        ? t('data.done', 'Done: {count} inserted').replace('{count}', String(data.inserted ?? 0))
        : t('data.error', 'Error: {error}').replace('{error}', String(data.error))
    )
    if (res.ok) refresh()
  }

  return (
    <main className="sb-cockpit-stack" style={{ padding: 'var(--sb-space-lg)', color: '#fff' }}>
      <h1 className="sb-h2" style={{ marginBottom: 'var(--sb-space-md)' }}>{t('data.title', 'Universal Data Connector')}</h1>
      <p style={{ marginBottom: 12, color: '#eab308' }}>{t('data.wikipediaReminder', 'Wikipedia reminder: Content is CC-BY-SA licensed and attribution is required.')}</p>

      <section className="sb-cockpit-panel" style={{ marginBottom: 'var(--sb-space-lg)', padding: 'var(--sb-space-lg)' }}>
        <h2>{t('data.uploadCsv', 'Upload CSV')}</h2>
        <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} className="sb-input" style={{ width: '100%', minHeight: 100 }} />
        <button className="sb-button-primary" onClick={() => submit({ mode: 'csv', csvText, fileName: 'manual.csv' })}>{t('data.uploadCsv', 'Upload CSV')}</button>
      </section>

      <section className="sb-cockpit-panel" style={{ marginBottom: 'var(--sb-space-lg)', padding: 'var(--sb-space-lg)' }}>
        <h2>{t('data.addApi', 'Add API Connector')}</h2>
        <input value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} className="sb-input" style={{ width: '100%' }} />
        <textarea value={apiMapping} onChange={(e) => setApiMapping(e.target.value)} className="sb-input" style={{ width: '100%', minHeight: 100 }} />
        <button className="sb-button-primary" onClick={() => submit({ mode: 'api', endpoint: apiEndpoint, mapping: JSON.parse(apiMapping), config: { label: 'Restaurants API' } })}>{t('data.runApi', 'Run API Import')}</button>
      </section>

      <section className="sb-cockpit-panel" style={{ marginBottom: 'var(--sb-space-lg)', padding: 'var(--sb-space-lg)' }}>
        <h2>{t('data.addScraper', 'Add Scraper Connector')}</h2>
        <textarea value={scraperJson} onChange={(e) => setScraperJson(e.target.value)} className="sb-input" style={{ width: '100%', minHeight: 100 }} />
        <button className="sb-button-primary" onClick={() => submit({ mode: 'scraper', json: JSON.parse(scraperJson), config: { script: 'custom scraper output' } })}>{t('data.runScraper', 'Run Scraper Import')}</button>
      </section>

      <p>{status}</p>

      <section className="sb-cockpit-panel" style={{ marginTop: 'var(--sb-space-lg)', padding: 'var(--sb-space-lg)' }}>
        <h2>{t('data.importedItems', 'Imported Items by Category')}</h2>
        {Object.entries(history.groupedItems).map(([category, items]) => (
          <div key={category} style={{ marginBottom: 12 }}>
            <h3>{category}</h3>
            <ul>
              {items.map((item) => <li key={item.id}>{item.name} — {item.description}</li>)}
            </ul>
          </div>
        ))}
      </section>

      <section className="sb-cockpit-panel" style={{ marginTop: 'var(--sb-space-lg)', padding: 'var(--sb-space-lg)' }}>
        <h2>{t('data.sourceHistory', 'Source History')}</h2>
        <ul>
          {history.sources.map((source) => (
            <li key={source.id}>{source.type} — {new Date(source.created_at).toLocaleString()} — {JSON.stringify(source.config)}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
