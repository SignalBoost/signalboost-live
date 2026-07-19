'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useState } from 'react'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI GPT Engine' },
  { id: 'anthropic', label: 'Anthropic Claude' },
]

export default function ProviderSettings() {
  const [activeProvider, setActiveProvider] = useState('openai')
  const [byokEnabled, setByokEnabled] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [savedKeys, setSavedKeys] = useState({})
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      try {
        const response = await fetch('/api/config/provider', { method: 'GET', credentials: 'same-origin' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'Unable to load provider config.')
        if (cancelled || !payload?.config) return
        setActiveProvider(payload.config.activeProvider || 'openai')
        setByokEnabled(Boolean(payload.config.byokEnabled))
        setSavedKeys(payload.config.savedKeys || {})
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Unable to load provider config.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadConfig()
    return () => { cancelled = true }
  }, [])

  async function handleSave(event) {
    event.preventDefault()
    setStatus('Saving provider configuration…')

    const keys = apiKey.trim() ? { apiKey: apiKey.trim() } : {}
    const response = await fetch('/api/config/provider', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeProvider, byokEnabled, keys }),
    })
    const payload = await response.json()

    if (!response.ok) {
      setStatus(payload?.error || 'Unable to save provider configuration.')
      return
    }

    setApiKey('')
    setSavedKeys(payload?.config?.savedKeys || {})
    setStatus('Provider configuration saved securely.')
  }

  return (
    <form onSubmit={handleSave} style={{ display: 'grid', gap: 16, maxWidth: 680 }}>
      <label style={{ display: 'grid', gap: 8 }}>
        <span>Provider</span>
        <select value={activeProvider} onChange={(event) => setActiveProvider(event.target.value)} disabled={loading}>
          {PROVIDERS.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.label}</option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input type="checkbox" checked={byokEnabled} onChange={(event) => setByokEnabled(event.target.checked)} disabled={loading} />
        <span><LocalizedText fallback={"Bring Your Own Keys active"} /></span>
      </label>

      <label style={{ display: 'grid', gap: 8 }}>
        <span>API key {savedKeys.apiKey ? `(${savedKeys.apiKey})` : ''}</span>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={savedKeys.apiKey ? 'Leave blank to keep saved key' : 'Paste provider API key'}
          autoComplete="off"
          disabled={loading || !byokEnabled}
        />
      </label>

      <button type="submit" disabled={loading}><LocalizedText fallback={"Save Config"} /></button>
      {status ? <p role="status">{status}</p> : null}
    </form>
  )
}
