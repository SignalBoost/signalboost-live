'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { tenantRegFallback } from '@/lib/i18n/tenantRegCopy'
import TenantRegistrationModal from '@/components/admin/TenantRegistrationModal'

type Organization = {
  id: string
  name: string
  slug: string
  created_at: string
}

export default function TenantsAdminPage() {
  const { dict, lang } = useI18n()
  const tt = useCallback((key: string) => t(dict, `tenantReg.${key}`, tenantRegFallback(lang, key)), [dict, lang])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const loadOrgs = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/admin/tenants', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json?.ok) throw new Error('load_failed')
      setOrgs(Array.isArray(json?.organizations) ? json.organizations : [])
    } catch {
      setLoadError(tt('genericError'))
    } finally {
      setLoading(false)
    }
  }, [tt])

  useEffect(() => { loadOrgs() }, [loadOrgs])

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black" style={{ color: '#ffc300', fontFamily: 'var(--sb-font-display)' }}>🏢 {tt('pageTitle')}</h1>
          <p className="mt-1 text-sm" style={{ color: '#9db4cc' }}>{tt('pageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={loadOrgs} className="rounded-lg px-4 py-2 text-sm font-bold" style={{ background: 'rgba(26,240,255,0.12)', color: '#1af0ff', border: '1px solid rgba(26,240,255,0.35)' }}>↻ {tt('refresh')}</button>
          <button type="button" onClick={() => setModalOpen(true)} className="rounded-lg px-5 py-2 text-sm font-black" style={{ background: 'linear-gradient(120deg, #ffc300 0%, #ffd94d 100%)', color: '#07111f' }}>+ {tt('openModal')}</button>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(160deg, #0a1a2e 0%, #07111f 100%)', border: '1px solid rgba(26,240,255,0.18)' }}>
        {loading ? (
          <p className="px-5 py-8 text-sm" style={{ color: '#6f88a3' }}>…</p>
        ) : loadError ? (
          <p className="px-5 py-8 text-sm font-semibold" style={{ color: '#ff8080' }}>{loadError}</p>
        ) : orgs.length === 0 ? (
          <p className="px-5 py-8 text-sm" style={{ color: '#6f88a3' }}>{tt('emptyList')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(26,240,255,0.18)' }}>
                <th className="px-5 py-3 font-bold" style={{ color: '#1af0ff' }}>{tt('colName')}</th>
                <th className="px-5 py-3 font-bold" style={{ color: '#1af0ff' }}>{tt('colSlug')}</th>
                <th className="px-5 py-3 font-bold" style={{ color: '#1af0ff' }}>{tt('colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td className="px-5 py-3 font-semibold" style={{ color: '#e8f6ff' }}>{org.name}</td>
                  <td className="px-5 py-3" style={{ color: '#9db4cc', fontFamily: 'var(--sb-font-mono)' }}>{org.slug}</td>
                  <td className="px-5 py-3" style={{ color: '#6f88a3', fontFamily: 'var(--sb-font-mono)' }}>{new Date(org.created_at).toLocaleDateString(lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <TenantRegistrationModal open={modalOpen} onClose={() => setModalOpen(false)} onRegistered={loadOrgs} />
    </main>
  )
}
