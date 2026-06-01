'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { createMarketingBrowserSupabase } from '@/lib/auth/supabaseClient'

export default function LoginPage() {
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'github' | null>(null)
  const [error, setError] = useState('')
  const supabase = useMemo(() => createMarketingBrowserSupabase(), [])

  async function signIn(provider: 'google' | 'github') {
    setError('')
    setLoadingProvider(provider)
    const origin = window.location.origin
    const next = new URLSearchParams(window.location.search).get('next') || '/dashboard'
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    if (error) {
      setError(error.message)
      setLoadingProvider(null)
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white md:px-10">
      <Link href="/" className="text-[#FFD700] no-underline">← SignalBoost</Link>

      <section className="mx-auto mt-16 max-w-xl rounded-[2rem] border border-white/10 bg-white/[.04] p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Marketing auth</p>
        <h1 className="mt-4 text-4xl font-black">Sign in to SignalBoost</h1>
        <p className="mt-4 text-white/65">
          This sign-in flow is scoped to signalboostapp.com and returns through
          signalboostapp.com/auth/callback. The SaaS cockpit keeps its own
          saas.signalboostapp.com/auth/callback flow.
        </p>

        <div className="mt-8 grid gap-3">
          <button
            type="button"
            onClick={() => signIn('google')}
            disabled={loadingProvider !== null}
            className="rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingProvider === 'google' ? 'Opening Google…' : 'Continue with Google'}
          </button>
          <button
            type="button"
            onClick={() => signIn('github')}
            disabled={loadingProvider !== null}
            className="rounded-full border border-white/15 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingProvider === 'github' ? 'Opening GitHub…' : 'Continue with GitHub'}
          </button>
        </div>

        {error ? <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p> : null}
      </section>
    </main>
  )
}
