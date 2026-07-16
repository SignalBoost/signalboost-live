'use client'

import { useState } from 'react'

export default function JsonBlueprint({ blueprint }) {
  const [copied, setCopied] = useState(false)
  async function copy() { await navigator.clipboard.writeText(JSON.stringify(blueprint, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1400) }
  return <section className="rounded-3xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-amber-200">Live JSON Blueprint</p><h2 className="text-2xl font-black text-white">Compiled integration contract</h2></div><button type="button" onClick={copy} className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-2 font-black text-amber-100">{copied ? 'Copied' : 'Copy JSON'}</button></div><pre className="max-h-[520px] overflow-auto rounded-2xl border border-white/10 bg-black/50 p-4 text-sm leading-6 text-blue-100">{JSON.stringify(blueprint, null, 2)}</pre></section>
}
