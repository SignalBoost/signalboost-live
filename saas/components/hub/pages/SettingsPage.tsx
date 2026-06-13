// saas/components/hub/pages/SettingsPage.tsx
'use client'

import { useState, useEffect } from 'react'
import { ConsoleSettings, ApprovalPolicy } from '@/lib/hub/settings-service'
import { cardStyle, labelStyle } from '../shared'

export function SettingsPage() {
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
        setError(data.error || 'Failed to load settings')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading settings')
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
        setError(data.error || 'Failed to update setting')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating setting')
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>
          Loading settings...
        </div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ ...cardStyle, padding: '1rem', background: '#1a0000', color: '#ff6b6b' }}>
          {error || 'Failed to load settings'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1af0ff' }}>
          Console Settings
        </h2>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>
          Configure security policies, approvals, and audit settings
        </p>
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
        >
          ✓ Settings saved
        </div>
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
        <h3 style={{ ...labelStyle, marginBottom: '1.5rem' }}>🔒 Security</h3>

        <ToggleSetting
          label="Require MFA for Unlock"
          description="Users must authenticate with TOTP before accessing the vault"
          enabled={settings.requireMFA}
          onChange={value => updateSetting('requireMFA', value)}
        />

        <ToggleSetting
          label="Require Approval for Key Rotation"
          description="Key rotations must be approved before execution"
          enabled={settings.requireApprovalForRotation}
          onChange={value => updateSetting('requireApprovalForRotation', value)}
        />

        <ToggleSetting
          label="Require Approval for Export"
          description="Exporting secrets requires explicit approval"
          enabled={settings.requireApprovalForExport}
          onChange={value => updateSetting('requireApprovalForExport', value)}
        />

        <ToggleSetting
          label="Encryption Enabled"
          description="All secrets encrypted at rest"
          enabled={settings.encryptionEnabled}
          onChange={value => updateSetting('encryptionEnabled', value)}
        />
      </div>

      {/* Automation Settings */}
      <div style={{ ...cardStyle, marginBottom: '2rem' }}>
        <h3 style={{ ...labelStyle, marginBottom: '1.5rem' }}>⚙️ Automation</h3>

        <ToggleSetting
          label="Auto-Rotate Keys"
          description="Automatically rotate keys on a schedule"
          enabled={settings.autoRotateKeys}
          onChange={value => updateSetting('autoRotateKeys', value)}
        />

        {settings.autoRotateKeys && (
          <NumberSetting
            label="Auto-Rotate Interval (Days)"
            value={settings.autoRotateIntervalDays}
            min={7}
            max={365}
            onChange={value => updateSetting('autoRotateIntervalDays', value)}
          />
        )}
      </div>

      {/* Audit & Retention */}
      <div style={{ ...cardStyle, marginBottom: '2rem' }}>
        <h3 style={{ ...labelStyle, marginBottom: '1.5rem' }}>📊 Audit & Retention</h3>

        <NumberSetting
          label="Audit Log Retention (Days)"
          value={settings.auditLogRetentionDays}
          min={7}
          max={365}
          description="How long to keep audit logs"
          onChange={value => updateSetting('auditLogRetentionDays', value)}
        />

        <NumberSetting
          label="Session Timeout (Minutes)"
          value={settings.sessionTimeoutMinutes}
          min={5}
          max={480}
          description="Idle timeout before re-authentication required"
          onChange={value => updateSetting('sessionTimeoutMinutes', value)}
        />
      </div>

      {/* Notifications */}
      <div style={{ ...cardStyle, marginBottom: '2rem' }}>
        <h3 style={{ ...labelStyle, marginBottom: '1.5rem' }}>🔔 Notifications</h3>

        <ToggleSetting
          label="Notify on Unauthorized Access"
          description="Send alerts when unauthorized access is detected"
          enabled={settings.notifyOnUnauthorizedAccess}
          onChange={value => updateSetting('notifyOnUnauthorizedAccess', value)}
        />

        <ToggleSetting
          label="Notify on Key Rotation"
          description="Send notifications when keys are rotated"
          enabled={settings.notifyOnKeyRotation}
          onChange={value => updateSetting('notifyOnKeyRotation', value)}
        />

        <ToggleSetting
          label="Notify on Key Expiry"
          description="Alert when keys are expiring soon"
          enabled={settings.notifyOnKeyExpiry}
          onChange={value => updateSetting('notifyOnKeyExpiry', value)}
        />
      </div>

      {/* Advanced */}
      <div style={{ ...cardStyle }}>
        <h3 style={{ ...labelStyle, marginBottom: '1.5rem' }}>⚡ Advanced</h3>

        <ToggleSetting
          label="Allow Public URLs"
          description="Permit deployment to public URLs"
          enabled={settings.allowPublicURLs}
          onChange={value => updateSetting('allowPublicURLs', value)}
        />

        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#1a1a2e', borderRadius: '4px', fontSize: '0.85rem' }}>
          <div style={{ color: '#888', marginBottom: '0.5rem' }}>Last Updated</div>
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
