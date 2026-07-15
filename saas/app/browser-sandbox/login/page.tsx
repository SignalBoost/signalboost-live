'use client'

import { FormEvent, useState } from 'react'

type View = 'login' | 'dashboard' | 'settings'

export default function BrowserSandboxLoginPage() {
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email || !password) return
    setView('dashboard')
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
          SignalBoost Browser Sandbox
        </p>

        {view === 'login' && (
          <section data-browser-sandbox="login">
            <h1 className="mb-6 text-3xl font-semibold">Test provider login</h1>
            <form className="space-y-4" onSubmit={submitLogin}>
              <label className="block">
                <span className="mb-1 block text-sm">Email</span>
                <input
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
                  name="email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm">Password</span>
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
              >
                Sign in
              </button>
            </form>
          </section>
        )}

        {view === 'dashboard' && (
          <section data-browser-sandbox="dashboard">
            <h1 className="mb-4 text-3xl font-semibold">Sandbox dashboard</h1>
            <p className="mb-6 text-slate-300">This portal contains no production systems or credentials.</p>
            <button
              className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
              data-action="open-settings"
              type="button"
              onClick={() => setView('settings')}
            >
              Open settings
            </button>
          </section>
        )}

        {view === 'settings' && (
          <section data-browser-sandbox="settings">
            <h1 className="mb-4 text-3xl font-semibold">Sandbox settings</h1>
            <label className="block">
              <span className="mb-1 block text-sm">Test environment value</span>
              <input
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
                name="sandboxValue"
                defaultValue="unchanged"
              />
            </label>
            <button
              className="mt-4 rounded-lg border border-amber-400 px-4 py-2 text-amber-300"
              data-action="protected-save"
              type="button"
            >
              Protected save
            </button>
          </section>
        )}
      </div>
    </main>
  )
}
