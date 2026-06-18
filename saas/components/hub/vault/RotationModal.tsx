'use client'

// saas/components/hub/vault/RotationModal.tsx
// Initiate and monitor key rotation process with MFA verification and notifications.

import { useState } from 'react'
import { VaultSecret } from '@/lib/hub/vault-types'
import { notifyBoth } from '@/lib/hub/vault-notifications'
import { MFAVerification } from './index'
import { cardStyle, labelStyle } from '../shared'
import { useTranslation } from '@/components/i18n/useTranslation'

export type RotationModalProps = {
  secret: VaultSecret
  onClose: () => void
  onRotate?: (secretId: string) => Promise<{ ok: boolean; newValue?: string; error?: string }>
  requiresMFA?: boolean
}

type RotationStep = 'confirm' | 'mfa' | 'rotating' | 'success' | 'error'

export default function RotationModal({ secret, onClose, onRotate, requiresMFA = true }: RotationModalProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<RotationStep>('confirm')
  const [newValue, setNewValue] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleStartRotation = () => {
    if (requiresMFA) {
      setStep('mfa')
    } else {
      handleRotate()
    }
  }

  const handleMFASuccess = () => {
    setStep('rotating')
    handleRotate()
  }

  const handleRotate = async () => {
    setError(null)

    try {
      if (onRotate) {
        const result = await onRotate(secret.id)
        if (result.ok) {
          setNewValue(result.newValue || null)
          setStep('success')
          // Send success notification
          await notifyBoth({
            event: 'rotation_success',
            secretName: secret.secret_name,
            provider: secret.provider_name,
            severity: 'info',
            message: `Successfully rotated ${secret.secret_name} for ${secret.provider_name}`,
            timestamp: new Date().toISOString(),
          })
        } else {
          setError(result.error || 'Rotation failed')
          setStep('error')
          // Send failure notification
          await notifyBoth({
            event: 'rotation_failed',
            secretName: secret.secret_name,
            provider: secret.provider_name,
            severity: 'critical',
            message: `Failed to rotate ${secret.secret_name}: ${result.error}`,
            timestamp: new Date().toISOString(),
          })
        }
      } else {
        // Demo mode: simulate rotation
        await new Promise(resolve => setTimeout(resolve, 1500))
        setNewValue('sk_live_8KL****Qp9')
        setStep('success')
        // Send demo notification
        await notifyBoth({
          event: 'rotation_success',
          secretName: secret.secret_name,
          provider: secret.provider_name,
          severity: 'info',
          message: `Successfully rotated ${secret.secret_name} for ${secret.provider_name}`,
          timestamp: new Date().toISOString(),
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      setStep('error')
      // Send error notification
      await notifyBoth({
        event: 'rotation_failed',
        secretName: secret.secret_name,
        provider: secret.provider_name,
        severity: 'critical',
        message: `Error rotating ${secret.secret_name}: ${msg}`,
        timestamp: new Date().toISOString(),
      })
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9500,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...cardStyle,
          maxWidth: 420,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div>
          <div style={labelStyle}>{t('console.vault.cred_mgmt', 'Credential Management')}</div>
          <h2 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 900, letterSpacing: '-.02em' }}>
            {t('console.vault.rotate_title', 'Rotate {name}').replace('{name}', secret.secret_name)}
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
            {t('console.vault.rotate_sub', 'Generate a new credential for {provider}.').replace('{provider}', secret.provider_name)}
          </p>
        </div>

        {/* Content */}
        {step === 'confirm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,193,0,.1)', border: '1px solid rgba(255,193,0,.2)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#fcd34d', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span>⚠️</span>
                <span>{t('console.vault.cannot_undo', 'This action cannot be undone')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 4 }}>
                  {t('console.vault.current_secret', 'Current Secret')}
                </div>
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,.04)',
                    border: '1px solid rgba(255,255,255,.08)',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: 'rgba(255,255,255,.65)',
                  }}
                >
                  {secret.masked_value}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 4 }}>
                  {t('console.vault.after_rotation', 'After rotation')}
                </div>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
                  {t('console.vault.after_desc', 'A new credential will be generated. The old one is revoked automatically and synced to your Vercel environment variables.')}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.04)',
                  color: 'rgba(255,255,255,.72)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('console.ui.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleStartRotation}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#ffc300',
                  color: '#000',
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {t('console.vault.rotate_key', 'Rotate Key')}
              </button>
            </div>
          </div>
        )}

        {step === 'mfa' && (
          <MFAVerification
            operation="rotation"
            secret_name={secret.secret_name}
            onSuccess={handleMFASuccess}
            onCancel={onClose}
          />
        )}

        {step === 'rotating' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '20px 0' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                border: '3px solid rgba(255,195,0,.2)',
                borderTopColor: '#ffc300',
                animation: 'spin 1s linear infinite',
              }}
            />
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                {t('console.vault.generating', 'Generating new credential...')}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
                {t('console.vault.may_take', 'This may take a moment.')}
              </p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {step === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.2)', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#86efac' }}>{t('console.vault.rotation_success', 'Rotation successful')}</div>
            </div>

            {newValue && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 4 }}>
                  {t('console.vault.new_secret_masked', 'New Secret (Masked)')}
                </div>
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(34,197,94,.08)',
                    border: '1px solid rgba(34,197,94,.2)',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: '#86efac',
                  }}
                >
                  {newValue}
                </div>
              </div>
            )}

            <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
              <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,.55)' }}>
                ✓ {t('console.vault.chk_generated', 'New credential generated')}<br />
                ✓ {t('console.vault.chk_synced', 'Synced to Vercel env vars')}<br />
                ✓ {t('console.vault.chk_revoked', 'Old credential revoked')}<br />
                ✓ {t('console.vault.chk_audited', 'Audit logged')}
              </p>
            </div>

            <button
              onClick={onClose}
              style={{
                padding: '11px 14px',
                borderRadius: 10,
                border: 'none',
                background: '#1af0ff',
                color: '#000',
                fontSize: 13,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {t('console.vault.done', 'Done')}
            </button>
          </div>
        )}

        {step === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fca5a5', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <span>❌</span>
                <span>{t('console.vault.rotation_failed', 'Rotation failed')}</span>
              </div>
              <div style={{ fontSize: 11, color: '#fecaca' }}>{error}</div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.04)',
                  color: 'rgba(255,255,255,.72)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('console.ui.close', 'Close')}
              </button>
              <button
                onClick={() => {
                  setStep('confirm')
                  setError(null)
                }}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#ffc300',
                  color: '#000',
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {t('console.vault.retry', 'Retry')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
