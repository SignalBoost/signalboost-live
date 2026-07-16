'use client'

import { useEffect, useMemo, useState } from 'react'

const MOCK_TAGS = ['ai', 'billing', 'crm', 'email', 'governed', 'growth', 'ops', 'sales', 'support', 'workflow']

export default function TagSelector({ value, onChange }) {
  const [tags, setTags] = useState([])
  const [query, setQuery] = useState('')
  useEffect(() => { Promise.resolve(MOCK_TAGS).then(setTags) }, []) // Placeholder for fetch('/tags/list').
  const filtered = useMemo(() => tags.filter(tag => tag.includes(query.toLowerCase()) && !value.includes(tag)), [tags, query, value])
  return <div className="grid gap-2"><label className="text-sm font-bold text-slate-200">Tags</label><input className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none ring-cyan-300/40 focus:ring-2" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tags from /tags/list" />{query && <div className="rounded-2xl border border-white/10 bg-slate-950 p-2">{filtered.map(tag => <button key={tag} type="button" onClick={() => { onChange([...value, tag]); setQuery('') }} className="mr-2 mt-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-sm font-semibold text-cyan-100">{tag}</button>)}{!filtered.length && <span className="text-sm text-slate-400">No matching tags.</span>}</div>}<div className="flex flex-wrap gap-2">{value.map(tag => <button key={tag} type="button" onClick={() => onChange(value.filter(item => item !== tag))} className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-sm font-bold text-amber-100">{tag} ×</button>)}</div></div>
}
