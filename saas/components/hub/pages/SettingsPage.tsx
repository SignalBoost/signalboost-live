// saas/components/hub/pages/SettingsPage.tsx
'use client'

import { useState, useEffect } from 'react'
import { ConsoleSettings, ApprovalPolicy } from '@/lib/hub/settings-service'
import { cardStyle, labelStyle } from '../shared.tsx'
import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export function SettingsPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<ConsoleSettings | null>(null)
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    try {
      setLoading(true)
      const res = await fetch('/api/hub/settings')
      const data = await res.json()

      if (data.ok) {
        setSettings(data.settings)
        setPolicies(data.policies || [])
      } else {
        setError(data.error || t('console.settings.err_load', uiCopy('u_d9236849d727c6e1')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.settings.err_load2', uiCopy('u_c303fc30e89b2599')))
    } finally {
      setLoading(false)
    }
  }

  async function updateSetting(key: keyof ConsoleSettings, value: unknown) {
    if (!settings) return

    try {
      setSaved(false)
      const res = await fetch('/api/hub/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      })

      const data = await res.json()

      if (data.ok) {
        setSettings(data.settings)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        setError(data.error || t('console.settings.err_update', uiCopy('u_34ce041668a69347')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.settings.err_update2', uiCopy('u_16aaf227d64da5be')))
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>{t('console.settings.loading', uiCopy('u_afd73fac2aa0ade2'))}</div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ ...cardStyle, padding: '1rem', background: '#1a0000', color: '#ff6b6b' }}>
          {error || t('console.settings.err_load', uiCopy('u_bf7defafdeaa4a52'))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1af0ff' }}>{t('console.settings.title', uiCopy('u_f1f9b3b71129410f'))}</h2>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>{t('console.settings.subtitle', uiCopy('u_bee25893c595d7f1'))}</p>
      </div>

      {saved && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#0a2a0a',
            color: '#22c55e',
            borderRadius: '4px',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
          }}
        >{'✓ ' + t('console.settings.saved', uiCopy('u_4258422f33fad308'))}</div>
      )}

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#1a0000',
            color: '#ff6b6b',
            borderRadius: '4px',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Security Settings */}
      <div style={{ ...cardStyle, marginBottom: '2rem' }}>
        <h3 style={{ ...labelStyle, marginBottom: '1.5rem' }}>{'🔒 ' + t('console.settings.sec_security', uiCopy('u_398202a1f920d31f'))}</h3>

        <ToggleSetting
          label={t('console.settings.mfa_l', uiCopy('u_b60dc159beaf97e3'))}
          description={t('console.settings.mfa_d', uiCopy('u_ed7918b94a04273d'))}
          enabled={settings.requireMFA}
          onChange={value => updateSetting('requireMFA', value)}
        />

        <ToggleSetting
          label={t('console.settings.rot_approval_l', uiCopy('u_d8c43e09a4050665'))}
          description={t('console.settings.rot_approval_d', uiCopy('u_d085cf4c0d9b948d'))}
          enabled={settings.requireApprovalForRotation}
          onChange={value => updateSetting('requireApprovalForRotation', value)}
        />

        <ToggleSetting
          label={t('console.settings.exp_approval_l', uiCopy('u_e2c2ee61367d50e4'))}
          description={t('console.settings.exp_approval_d', uiCopy('u_f54d8b5b8542d190'))}
          enabled={settings.requireApprovalForExport}
          onChange={value => updateSetting('requireApprovalForExport', value)}
        />

        <ToggleSetting
          label={t('console.settings.enc_l', uiCopy('u_67f48c99a043cb60'))}
          description={t('console.settings.enc_d', uiCopy('u_9af48a6beacb1574'))}
          enabled={settings.encryptionEnabled}
          onChange={value => updateSetting('encryptionEnabled', value)}
        />
      </div>

      {/* Automation Settings */}
      <div style={{ ...cardStyle, marginBottom: '2rem' }}>
        <h3 style={{ ...labelStyle, marginBottom: '1.5rem' }}>{'⚙️ ' + t('console.settings.sec_automation', uiCopy('u_90214da8fb3d5f48'))}</h3>

        <ToggleSetting
          label={t('console.settings.autorot_l', uiCopy('u_26831f3013517fbc'))}
          description={t('console.settings.autorot_d', uiCopy('u_09c75276d43485d5'))}
          enabled={settings.autoRotateKeys}
          onChange={value => updateSetting('autoRotateKeys', value)}
        />

        {settings.autoRotateKeys && (
          <NumberSetting
            label={t('console.settings.autorot_int_l', uiCopy('u_40bba4a654a5da4d'))}
            value={settings.autoRotateIntervalDays}
            min={7}
            max={365}
            onChange={value => updateSetting('autoRotateIntervalDays', value)}
          />
        )}
      </div>

      {/* Audit & Retention */}
      <div style={{ ...cardStyle, marginBottom: '2rem' }}>
        <h3 style={{ ...labelStyle, marginBottom: '1.5rem' }}>{'📊 ' + t('console.settings.sec_audit', uiCopy('u_5a1042409e9f9aa9'))}</h3>

        <NumberSetting
          label={t('console.settings.audit_ret_l', uiCopy('u_4dfc99aa71c74765'))}
          value={settings.auditLogRetentionDays}
          min={7}
          max={365}
          description={t('console.settings.audit_ret_d', uiCopy('u_1d0966b2a8a89118'))}
          onChange={value => updateSetting('auditLogRetentionDays', value)}
        />

        <NumberSetting
          label={t('console.settings.session_l', uiCopy('u_8b2d9122d43d501a'))}
          value={settings.sessionTimeoutMinutes}
          min={5}
          max={480}
          description={t('console.settings.session_d', uiCopy('u_3e86ebc4d6271b90'))}
          onChange={value => updateSetting('sessionTimeoutMinutes', value)}
        />
      </div>

      {/* Notifications */}
      <div style={{ ...cardStyle, marginBottom: '2rem' }}>
        <h3 style={{ ...labelStyle, marginBottom: '1.5rem' }}>{'🔔 ' + t('console.settings.sec_notifications', uiCopy('u_1af26eeab89a63e4'))}</h3>

        <ToggleSetting
          label={t('console.settings.notify_unauth_l', uiCopy('u_c1e544e3d6f77372'))}
          description={t('console.settings.notify_unauth_d', uiCopy('u_6f92abd49e851cbf'))}
          enabled={settings.notifyOnUnauthorizedAccess}
          onChange={value => updateSetting('notifyOnUnauthorizedAccess', value)}
        />

        <ToggleSetting
          label={t('console.settings.notify_rot_l', uiCopy('u_9244d69ff618eebe'))}
          description={t('console.settings.notify_rot_d', uiCopy('u_c303b50f33fe4308'))}
          enabled={settings.notifyOnKeyRotation}
          onChange={value => updateSetting('notifyOnKeyRotation', value)}
        />

        <ToggleSetting
          label={t('console.settings.notify_exp_l', uiCopy('u_7ffe449b970bf4e2'))}
          description={t('console.settings.notify_exp_d', uiCopy('u_7c7991cdf05daa9a'))}
          enabled={settings.notifyOnKeyExpiry}
          onChange={value => updateSetting('notifyOnKeyExpiry', value)}
        />
      </div>

      {/* Advanced */}
      <div style={{ ...cardStyle }}>
        <h3 style={{ ...labelStyle, marginBottom: '1.5rem' }}>{'⚡ ' + t('console.settings.sec_advanced', uiCopy('u_d91329a6141b6527'))}</h3>

        <ToggleSetting
          label={t('console.settings.pub_l', uiCopy('u_ccb5f56460fb309e'))}
          description={t('console.settings.pub_d', uiCopy('u_6ed3c786056c8815'))}
          enabled={settings.allowPublicURLs}
          onChange={value => updateSetting('allowPublicURLs', value)}
        />

        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#1a1a2e', borderRadius: '4px', fontSize: '0.85rem' }}>
          <div style={{ color: '#888', marginBottom: '0.5rem' }}>{t('console.settings.last_updated', uiCopy('u_611361b966030218'))}</div>
          <div style={{ color: '#1af0ff' }}>
            {new Date(settings.updatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleSetting({
  label,
  description,
  enabled,
  onChange,
}: {
  label: string
  description: string
  enabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #333' }}>
      <div>
        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: '#fff' }}>
          {label}
        </div>
        <div style={{ fontSize: '0.85rem', color: '#888' }}>
          {description}
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        style={{
          width: '50px',
          height: '28px',
          borderRadius: '14px',
          border: 'none',
          background: enabled ? '#22c55e' : '#333',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
          marginLeft: '1rem',
        }}
      >
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '12px',
            background: '#fff',
            position: 'absolute',
            top: '2px',
            left: enabled ? '24px' : '2px',
            transition: 'left 0.2s',
          }}
        />
      </button>
    </div>
  )
}

function NumberSetting({
  label,
  value,
  min,
  max,
  description,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  description?: string
  onChange: (value: number) => void
}) {
  return (
    <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #333' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#fff' }}>
        {label}
      </div>
      {description && (
        <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.75rem' }}>
          {description}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          style={{
            width: '80px',
            padding: '0.5rem',
            border: '1px solid #333',
            borderRadius: '4px',
            background: '#0a0a0a',
            color: '#1af0ff',
            textAlign: 'center',
          }}
        />
      </div>
    </div>
  )
}
