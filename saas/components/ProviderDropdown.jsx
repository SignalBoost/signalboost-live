'use client'

import { useEffect, useMemo, useState } from 'react'

const MOCK_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', icon: '◌', methods: ['POST', 'GET'], variables: ['input.prompt', 'input.language', 'input.customerId'], authSchema: [{ key: 'apiKey', label: 'API Key', type: 'secret' }], endpoints: [{ id: 'responses', path: '/v1/responses', example: 'Create a model response' }, { id: 'files', path: '/v1/files', example: 'Upload or list files' }] },
  { id: 'stripe', name: 'Stripe', icon: '◇', methods: ['GET', 'POST', 'DELETE'], variables: ['customer.email', 'customer.id', 'invoice.id'], authSchema: [{ key: 'secretKey', label: 'Secret Key', type: 'secret' }], endpoints: [{ id: 'customers', path: '/v1/customers', example: 'Create customer records' }, { id: 'checkout', path: '/v1/checkout/sessions', example: 'Start checkout sessions' }] },
  { id: 'github', name: 'GitHub', icon: '◆', methods: ['GET', 'POST', 'PATCH', 'PUT'], variables: ['repo.owner', 'repo.name', 'pull.number'], authSchema: [{ key: 'oauth', label: 'OAuth Connection', type: 'oauth' }], endpoints: [{ id: 'issues', path: '/repos/{owner}/{repo}/issues', example: 'Create or query issues' }, { id: 'pulls', path: '/repos/{owner}/{repo}/pulls', example: 'Open pull requests' }] },
  { id: 'resend', name: 'Resend', icon: '✉', methods: ['POST', 'GET'], variables: ['email.to', 'email.subject', 'campaign.id'], authSchema: [{ key: 'apiKey', label: 'API Key', type: 'secret' }], endpoints: [{ id: 'emails', path: '/emails', example: 'Send transactional email' }, { id: 'domains', path: '/domains', example: 'Manage sending domains' }] },
]

export async function fetchProviders() {
  // Placeholder API call: replace with fetch('/providers/list') when backend route is live.
  return Promise.resolve(MOCK_PROVIDERS)
}

export default function ProviderDropdown({ value, onChange }) {
  const [providers, setProviders] = useState([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => { fetchProviders().then(setProviders) }, [])

  const selected = providers.find(provider => provider.id === value)
  const filtered = useMemo(() => providers.filter(provider => provider.name.toLowerCase().includes(query.toLowerCase())), [providers, query])

  return (
    <div className="relative">
      <label className="grid gap-2 text-sm font-bold text-slate-200">Provider
        <input className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none ring-cyan-300/40 transition focus:ring-2" value={open ? query : selected?.name || ''} onFocus={() => { setOpen(true); setQuery('') }} onChange={event => { setQuery(event.target.value); setOpen(true) }} placeholder="Search providers from /providers/list" aria-label="Search provider" />
      </label>
      {open && (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl">
          {filtered.map(provider => (
            <button key={provider.id} type="button" onClick={() => { onChange(provider); setOpen(false) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-slate-100 transition hover:bg-cyan-400/10">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200">{provider.icon}</span>
              <span><span className="block font-bold">{provider.name}</span><span className="text-xs text-slate-400">{provider.methods.join(' · ')}</span></span>
            </button>
          ))}
          {!filtered.length && <p className="px-3 py-4 text-sm text-slate-400">No providers found.</p>}
        </div>
      )}
    </div>
  )
}
