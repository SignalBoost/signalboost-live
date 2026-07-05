'use client'

// saas/components/admin/TenantRegistrationModal.tsx
// Register New Multi-Tenant Organization. CLIENT_ID, CLIENT_SECRET and GCP API
// Key are selected as Supabase Vault references through SearchableSelect.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { tenantRegFallback } from '@/lib/i18n/tenantRegCopy'
import SearchableSelect, { type SearchableOption } from '@/components/admin/SearchableSelect'

type VaultItem = {
  id: string
  provider: string
  label: string
  last4: string
}

export type TenantRegistrationModalProps = {
  open: boolean
  onClose: () => void
  onRegistered?: () => void
}

const labelStyle: React.CSSProperties = {
  color: '#9db4cc',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'block',
}

export default function TenantRegistrationModal({ open, onClose, onRegistered }: TenantRegistrationModalProps) {
  const { dict, lang } = useI18n()
  const tt = useCallback((key: string) => t(dict, `tenantReg.${key}`, tenantRegFallback(lang, key)), [dict, lang])
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([])
  const [vaultLoading, setVaultLoading] = useState(false)
  const [vaultError, setVaultError] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [clientIdKey, setClientIdKey] = useState<string | null>(null)
  const [clientSecretKey, setClientSecretKey] = useState<string | null>(null)
  const [gcpApiKey, setGcpApiKey] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function loadVault() {
      setVaultLoading(true)
      setVaultError('')
      try {
        const response = await fetch('/api/vault', { cache: 'no-store' })
        const json = await response.json()
        if (!response.ok) throw new Error('vault_error')
        if (!cancelled) setVaultItems(Array.isArray(json?.items) ? json.items : [])
      } catch {
        if (!cancelled) setVaultError(tt('vaultError'))
      } finally {
        if (!cancelled) setVaultLoading(false)
      }
    }
    loadVault()
    return () => { cancelled = true }
  }, [open, tt])

  const options: SearchableOption[] = useMemo(() => vaultItems.map((item) => ({ id: item.id, label: `${item.provider} · ${item.label}`, meta: `••••${item.last4 || ''}` })), [vaultItems])

  const resetForm = useCallback(() => {
    setOrgName('')
    setOrgSlug('')
    setClientIdKey(null)
    setClientSecretKey(null)
    setGcpApiKey(null)
    setError('')
    setSuccess('')
  }, [])

  const handleClose = useCallback(() => {
    if (submitting) return
    resetForm()
    onClose()
  }, [submitting, resetForm, onClose])

  const handleSubmit = useCallback(async () => {
    setError('')
    setSuccess('')
    if (!orgName.trim() || !orgSlug.trim() || !clientIdKey || !clientSecretKey || !gcpApiKey) {
      setError(tt('required'))
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName.trim(),
          slug: orgSlug.trim().toLowerCase(),
          clientIdVaultKey: clientIdKey,
          clientSecretVaultKey: clientSecretKey,
          gcpApiVaultKey: gcpApiKey,
        }),
      })
      const json = await response.json()
      if (!response.ok || !json?.ok) {
        setError(json?.code === 'duplicate_slug' ? tt('duplicateError') : tt('genericError'))
        return
      }
      setSuccess(tt('success'))
      if (onRegistered) onRegistered()
      setTimeout(() => { resetForm(); onClose() }, 1200)
    } catch {
      setError(tt('genericError'))
    } finally {
      setSubmitting(false)
    }
  }, [orgName, orgSlug, clientIdKey, clientSecretKey, gcpApiKey, tt, onRegistered, resetForm, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center overflow-y-auto px-4 pb-8" style={{ top: 80, background: 'rgba(3,7,18,0.72)', backdropFilter: 'blur(6px)' }} role="dialog" aria-modal="true" aria-label={tt('modalTitle')}>
      <div className="h-fit w-full max-w-xl rounded-2xl p-6" style={{ background: 'linear-gradient(160deg, #0a1a2e 0%, #07111f 100%)', border: '1px solid rgba(26,240,255,0.28)', boxShadow: '0 24px 80px rgba(0,0,0,0.65)' }}>
        <header className="mb-5">
          <h2 className="text-lg font-black" style={{ color: '#ffc300', fontFamily: 'var(--sb-font-display)' }}>🏢 {tt('modalTitle')}</h2>
          <p className="mt-1 text-sm" style={{ color: '#9db4cc' }}>{tt('modalSubtitle')}</p>
        </header>
        <div className="flex flex-col gap-4">
          <div>
            <label style={labelStyle}>{tt('orgName')}</label>
            <input value={orgName} onChange={(event) => setOrgName(event.target.value)} placeholder={tt('orgNamePlaceholder')} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: '#0a1a2e', color: '#e8f6ff', border: '1px solid rgba(26,240,255,0.22)' }} maxLength={140} />
          </div>
          <div>
            <label style={labelStyle}>{tt('orgSlug')}</label>
            <input value={orgSlug} onChange={(event) => setOrgSlug(event.target.value.replace(/[^a-zA-Z0-9-]/g, '-'))} placeholder={tt('orgSlugPlaceholder')} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: '#0a1a2e', color: '#e8f6ff', border: '1px solid rgba(26,240,255,0.22)', fontFamily: 'var(--sb-font-mono)' }} maxLength={80} />
          </div>
          <div>
            <label style={labelStyle}>{tt('clientId')}</label>
            <SearchableSelect options={options} value={clientIdKey} onChange={setClientIdKey} placeholder={tt('selectPlaceholder')} emptyText={tt('noResults')} loading={vaultLoading} loadingText={tt('loadingVault')} ariaLabel={tt('clientId')} />
          </div>
          <div>
            <label style={labelStyle}>{tt('clientSecret')}</label>
            <SearchableSelect options={options} value={clientSecretKey} onChange={setClientSecretKey} placeholder={tt('selectPlaceholder')} emptyText={tt('noResults')} loading={vaultLoading} loadingText={tt('loadingVault')} ariaLabel={tt('clientSecret')} />
          </div>
          <div>
            <label style={labelStyle}>{tt('gcpApiKey')}</label>
            <SearchableSelect options={options} value={gcpApiKey} onChange={setGcpApiKey} placeholder={tt('selectPlaceholder')} emptyText={tt('noResults')} loading={vaultLoading} loadingText={tt('loadingVault')} ariaLabel={tt('gcpApiKey')} />
          </div>
          {vaultError ? <p className="text-sm font-semibold" style={{ color: '#ff8080' }}>{vaultError}</p> : null}
          {error ? <p className="text-sm font-semibold" style={{ color: '#ff8080' }}>{error}</p> : null}
          {success ? <p className="text-sm font-semibold" style={{ color: '#3ddc97' }}>{success}</p> : null}
          <div className="mt-2 flex items-center justify-end gap-3">
            <button type="button" onClick={handleClose} disabled={submitting} className="rounded-lg px-4 py-2 text-sm font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: '#9db4cc', border: '1px solid rgba(255,255,255,0.12)' }}>{tt('cancel')}</button>
            <button type="button" onClick={handleSubmit} disabled={submitting} className="rounded-lg px-5 py-2 text-sm font-black" style={{ background: 'linear-gradient(120deg, #ffc300 0%, #ffd94d 100%)', color: '#07111f', opacity: submitting ? 0.7 : 1 }}>{submitting ? tt('submitting') : tt('submit')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
