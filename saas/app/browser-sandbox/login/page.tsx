'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { FormEvent, useState } from 'react'
import { uiText } from '@/lib/i18n/uiText'

type View = 'login' | 'dashboard' | 'settings'

export default function BrowserSandboxLoginPage() {
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sandboxValue, setSandboxValue] = useState('unchanged')
  const [savedValue, setSavedValue] = useState<string | null>(null)

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email || !password) return
    setView('dashboard')
  }

  function saveSandboxValue() {
    setSavedValue(sandboxValue)
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400"><LocalizedText fallback={uiText('generatedUi.u_7a804ecd55dd3a9e')} /></p>

        {view === 'login' && (
          <section data-browser-sandbox="login">
            <h1 className="mb-6 text-3xl font-semibold"><LocalizedText fallback={uiText('generatedUi.u_83f52e6690ce4f31')} /></h1>
            <form className="space-y-4" onSubmit={submitLogin}>
              <label className="block">
                <span className="mb-1 block text-sm">{uiText('generatedUi.u_969ccbd3cf6300ec')}</span>
                <input
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
                  name="email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm">{uiText('generatedUi.u_e7cf3ef4f17c3999')}</span>
                <input
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
                  name="password"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                />
              </label>
              <button
                className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
                data-action="login"
                type="submit"
              ><LocalizedText fallback={uiText('generatedUi.u_bfd402b2f6f38125')} /></button>
            </form>
          </section>
        )}

        {view === 'dashboard' && (
          <section data-browser-sandbox="dashboard">
            <h1 className="mb-4 text-3xl font-semibold"><LocalizedText fallback={uiText('generatedUi.u_b373bbd10454ce83')} /></h1>
            <p className="mb-6 text-slate-300"><LocalizedText fallback={uiText('generatedUi.u_cdc5e466ce53810e')} /></p>
            <button
              className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
              data-action="open-settings"
              type="button"
              onClick={() => setView('settings')}
            ><LocalizedText fallback={uiText('generatedUi.u_ca381c1e76e681b6')} /></button>
          </section>
        )}

        {view === 'settings' && (
          <section data-browser-sandbox="settings">
            <h1 className="mb-4 text-3xl font-semibold"><LocalizedText fallback={uiText('generatedUi.u_6d5544c71e33b480')} /></h1>
            <label className="block">
              <span className="mb-1 block text-sm"><LocalizedText fallback={uiText('generatedUi.u_5b4782572858c422')} /></span>
              <input
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
                name="sandboxValue"
                value={sandboxValue}
                onChange={event => {
                  setSandboxValue(event.target.value)
                  setSavedValue(null)
                }}
              />
            </label>
            <button
              className="mt-4 rounded-lg border border-amber-400 px-4 py-2 text-amber-300"
              data-action="protected-save"
              type="button"
              onClick={saveSandboxValue}
            ><LocalizedText fallback={uiText('generatedUi.u_6f4f3a5c29951146')} /></button>
            {savedValue !== null && (
              <p
                className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-300"
                data-browser-sandbox="save-success"
                role="status"
              ><LocalizedText fallback={uiText('generatedUi.u_264dbed60c4ef555')} /><span data-saved-value>{savedValue}</span>
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
