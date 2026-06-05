'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
]

type Settings = {
  display_name: string | null
  locale: string
  email_notifications: boolean
  product_updates: boolean
  timezone: string | null
}

export default function SettingsPage() {
  const { dict, lang, setLang } = useI18n()
  const tr = (k: string, f: string) => t(dict, k, f)

  const [settings, setSettings] = useState<Settings>({
    display_name: '', locale: lang || 'en', email_notifications: true, product_updates: true, timezone: '',
  })
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' })
        const data = await res.json()
        if (!active) return
        if (!res.ok) { setError(data?.error || 'Could not load your settings.'); return }
        if (data.settings) {
          setSettings({
            display_name: data.settings.display_name ?? '',
            locale: data.settings.locale || 'en',
            email_notifications: data.settings.email_notifications ?? true,
            product_updates: data.settings.product_updates ?? true,
            timezone: data.settings.timezone ?? '',
          })
        }
        setEmail(data.email || '')
      } catch {
        if (active) setError('Something went wrong loading your settings.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings(s => ({ ...s, [key]: value }))
    setSaved(false)
  }

  async function save() {
    if (saving) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Could not save your settings.'); return }
      setSaved(true)
      // Apply the chosen language to the UI immediately.
      if (settings.locale && settings.locale !== lang) setLang(settings.locale)
    } catch {
      setError('Could not save your settings.')
    } finally {
      setSaving(false)
    }
  }

  const card: React.CSSProperties = { padding: 20, marginBottom: 16 }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.7)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <span className="sb-eyebrow">{tr('settings.eyebrow', 'Account')}</span>
        <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 2 }}>{tr('settings.title', 'Settings')}</h1>
        <p className="sb-body" style={{ margin: 0 }}>{tr('settings.subtitle', 'Manage your profile, language, and notifications.')}</p>
      </div>

      {loading ? (
        <p className="sb-body">{tr('settings.loading', 'Loading your settings…')}</p>
      ) : (
        <>
          {/* Profile */}
          <section className="sb-card" style={card}>
            <h2 className="sb-h3" style={{ marginTop: 0 }}>{tr('settings.profile', 'Profile')}</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{tr('settings.email', 'Account email')}</label>
              <div className="sb-body" style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,.85)' }}>{email || '—'}</div>
            </div>
            <div>
              <label style={labelStyle} htmlFor="dn">{tr('settings.displayName', 'Display name')}</label>
              <input
                id="dn"
                className="sb-input"
                style={{ padding: 12, width: '100%', boxSizing: 'border-box' }}
                value={settings.display_name ?? ''}
                onChange={e => update('display_name', e.target.value)}
                placeholder={tr('settings.displayNamePlaceholder', 'How your name appears in the app')}
              />
            </div>
          </section>

          {/* Language */}
          <section className="sb-card" style={card}>
            <h2 className="sb-h3" style={{ marginTop: 0 }}>{tr('settings.language', 'Language')}</h2>
            <label style={labelStyle} htmlFor="loc">{tr('settings.preferredLanguage', 'Preferred language')}</label>
            <select
              id="loc"
              className="sb-input"
              style={{ padding: 12, width: '100%', boxSizing: 'border-box' }}
              value={settings.locale}
              onChange={e => update('locale', e.target.value)}
            >
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <p className="sb-caption" style={{ marginTop: 8 }}>{tr('settings.languageHelp', 'Applies across the app when you save.')}</p>
          </section>

          {/* Notifications */}
          <section className="sb-card" style={card}>
            <h2 className="sb-h3" style={{ marginTop: 0 }}>{tr('settings.notifications', 'Notifications')}</h2>
            <Toggle
              label={tr('settings.emailNotifs', 'Email notifications')}
              help={tr('settings.emailNotifsHelp', 'Get notified when long tasks (audio, video, audits) finish.')}
              checked={settings.email_notifications}
              onChange={v => update('email_notifications', v)}
            />
            <div style={{ height: 12 }} />
            <Toggle
              label={tr('settings.productUpdates', 'Product updates')}
              help={tr('settings.productUpdatesHelp', 'Occasional emails about new features and improvements.')}
              checked={settings.product_updates}
              onChange={v => update('product_updates', v)}
            />
          </section>

          {/* Save bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 12, padding: '12px 28px', fontWeight: 800, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? tr('settings.saving', 'Saving…') : tr('settings.save', 'Save changes')}
            </button>
            {saved && <span style={{ color: '#86efac', fontWeight: 600 }}>✓ {tr('settings.savedMsg', 'Saved')}</span>}
            {error && <span style={{ color: '#fca5a5', fontWeight: 600 }}>{error}</span>}
          </div>
        </>
      )}
    </main>
  )
}

function Toggle({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#fff' }}>{label}</div>
        <div className="sb-caption">{help}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0, width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer',
          background: checked ? GOLD : 'rgba(255,255,255,.18)', position: 'relative', transition: 'background .15s',
        }}
      >
        <span style={{ position: 'absolute', top: 3, left: checked ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#0f1117', transition: 'left .15s' }} />
      </button>
    </div>
  )
}
