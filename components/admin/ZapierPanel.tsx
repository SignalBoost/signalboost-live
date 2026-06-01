'use client'

import { useEffect, useState } from 'react'

type Endpoint = { name: string; url: string; trigger: string }

export default function ZapierPanel() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [status, setStatus] = useState('Checking Zapier endpoint status…')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/zapier/test', { cache: 'no-store', credentials: 'same-origin' })
        const data = await res.json()
        if (res.ok && data.success) {
          setEndpoints(data.endpoints)
          setStatus(`Zapier status: ${data.status}`)
        } else {
          setStatus(data.error || 'Zapier status unavailable')
        }
      } catch {
        setStatus('Zapier status unavailable')
      }
    }
    load()
  }, [])

  async function testTrigger(trigger: string) {
    setStatus(`Testing ${trigger}…`)
    const res = await fetch('/api/admin/zapier/test', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger }),
    })
    const data = await res.json()
    setStatus(res.ok && data.success ? `${trigger} delivered at ${new Date(data.tested_at).toLocaleTimeString()}` : data.error || `${trigger} failed`)
  }

  return (
    <section className="mt-8 rounded-3xl border border-white/10 bg-black/40 p-6" aria-labelledby="zapier-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Zapier Integration</p>
          <h2 id="zapier-title" className="mt-2 text-2xl font-black">API keys, webhook endpoints, event triggers, and tests</h2>
        </div>
        <span className="rounded-full bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-100">{status}</span>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
          <h3 className="font-bold text-[#FFD700]">API keys</h3>
          <p className="mt-2 text-sm text-white/60">Server-side keys are stored in Vercel/Supabase environment variables and are never exposed in this browser console.</p>
        </article>
        {endpoints.map((endpoint) => (
          <article key={endpoint.trigger} className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
            <h3 className="font-bold text-white">{endpoint.name}</h3>
            <p className="mt-2 break-all text-sm text-white/60">{endpoint.url}</p>
            <p className="mt-2 text-sm text-[#FFD700]">Trigger: {endpoint.trigger}</p>
            <button onClick={() => testTrigger(endpoint.trigger)} className="mt-4 rounded-full border border-[#FFD700]/40 px-4 py-2 text-sm font-bold text-[#FFD700] hover:bg-[#FFD700] hover:text-black">Test trigger</button>
          </article>
        ))}
      </div>
    </section>
  )
}
