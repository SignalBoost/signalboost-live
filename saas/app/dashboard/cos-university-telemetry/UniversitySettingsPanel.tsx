'use client'

import { useEffect, useState } from 'react'
import type { UniversitySettingsView } from '@/lib/ai/cos/cosUniversitySettings'
import type { CosUniversitySettingsCopy } from '@/lib/i18n/cosUniversitySettingsCopy'

const SETTINGS_URL = '/api/admin/cos-university-settings'

export default function UniversitySettingsPanel({ copy }: { copy: CosUniversitySettingsCopy }) {
  const [settings, setSettings] = useState<UniversitySettingsView | null>(null)
  const [window, setWindow] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<'saved' | 'invalid' | 'failed' | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetch(SETTINGS_URL, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok || !body.ok || !body.settings) throw new Error('settings_unavailable')
        setSettings(body.settings)
        setWindow(body.settings.warmWindow.stored ?? '')
      })
      .catch(() => { if (!controller.signal.aborted) setMessage('failed') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  async function save(change: { warmWindow?: string | null; linePaused?: boolean }) {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(SETTINGS_URL, {
        method: 'PATCH', credentials: 'include', cache: 'no-store',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(change),
      })
      const body = await response.json()
      if (!response.ok || !body.ok || !body.settings) {
        setMessage(body.error === 'workforce_warm_window_invalid' ? 'invalid' : 'failed')
        return
      }
      setSettings(body.settings)
      if ('warmWindow' in change) setWindow(body.settings.warmWindow.stored ?? '')
      setMessage('saved')
    } catch { setMessage('failed') } finally { setSaving(false) }
  }

  const source = settings?.warmWindow.source === 'setting' ? copy.warmWindowSourceSetting
    : settings?.warmWindow.source === 'env' ? copy.warmWindowSourceEnv : copy.warmWindowSourceNone
  const stamp = (value: string | null) => value ? new Date(value).toLocaleString() : '—'

  return (
    <section className="rounded-lg border p-4" aria-busy={loading || saving}>
      <h2 className="font-semibold">{copy.title}</h2>
      <p className="mt-1 text-xs opacity-65">{copy.explanation}</p>
      {loading ? <p className="mt-3 text-sm">{copy.loading}</p> : !settings ? (
        <p className="mt-3 text-sm" role="alert">{copy.unavailable}</p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="font-medium">{copy.pauseTitle}</h3>
            <p className="mt-1 text-xs opacity-75">{copy.pauseExplanation}</p>
            <p className="mt-2 text-sm">{!settings.linePaused.known ? copy.pauseStateUnknown : settings.linePaused.paused ? copy.pauseStatePaused : copy.pauseStateRunning}</p>
            <button type="button" disabled={saving || !settings.linePaused.known}
              onClick={() => { void save({ linePaused: !settings.linePaused.paused }) }}
              className="mt-3 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
              {saving ? copy.saving : settings.linePaused.paused ? copy.resumeButton : copy.pauseButton}
            </button>
            {settings.linePaused.updatedAt ? <p className="mt-2 text-xs opacity-65">{copy.changedBy} {settings.linePaused.updatedBy ?? '—'} · {stamp(settings.linePaused.updatedAt)}</p> : null}
          </div>
          <form onSubmit={event => { event.preventDefault(); void save({ warmWindow: window }) }}>
            <label htmlFor="university-warm-window" className="font-medium">{copy.warmWindowTitle}</label>
            <p id="university-warm-window-help" className="mt-1 text-xs opacity-75">{copy.warmWindowExplanation}</p>
            <input id="university-warm-window" aria-describedby="university-warm-window-help" value={window}
              onChange={event => setWindow(event.target.value)} disabled={saving} placeholder={copy.warmWindowPlaceholder}
              className="mt-3 w-full rounded-md border bg-transparent px-3 py-2 text-sm" />
            <div className="mt-2 flex gap-2">
              <button type="submit" disabled={saving} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">{saving ? copy.saving : copy.warmWindowSave}</button>
              <button type="button" disabled={saving} onClick={() => { void save({ warmWindow: null }) }} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">{copy.warmWindowClear}</button>
            </div>
            <p className="mt-3 text-sm">{copy.warmWindowEffective}: {settings.warmWindow.effective ?? copy.warmWindowNone} · {source}</p>
            {settings.warmWindow.inWindow !== null ? <p className="text-xs opacity-75">{settings.warmWindow.inWindow ? copy.warmWindowOpenNow : copy.warmWindowClosedNow}</p> : null}
            {settings.warmWindow.opensAt ? <p className="text-xs opacity-75">{copy.warmWindowOpensAt}: {stamp(settings.warmWindow.opensAt)}</p> : null}
            {settings.warmWindow.closesAt ? <p className="text-xs opacity-75">{copy.warmWindowClosesAt}: {stamp(settings.warmWindow.closesAt)}</p> : null}
            {settings.warmWindow.updatedAt ? <p className="mt-2 text-xs opacity-65">{copy.changedBy} {settings.warmWindow.updatedBy ?? '—'} · {stamp(settings.warmWindow.updatedAt)}</p> : null}
          </form>
        </div>
      )}
      {message ? <p className="mt-3 text-sm" role={message === 'saved' ? 'status' : 'alert'}>{message === 'saved' ? copy.saved : message === 'invalid' ? copy.warmWindowInvalid : copy.requestFailed}</p> : null}
    </section>
  )
}
