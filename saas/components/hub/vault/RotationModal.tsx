'use client'

// saas/components/hub/vault/RotationModal.tsx
// Initiate and monitor key rotation process with MFA verification and notifications.

import { useState } from 'react'
import { VaultSecret } from '@/lib/hub/vault-types'
import { notifyBoth } from '@/lib/hub/vault-notifications'
import { MFAVerification } from './index'
import { cardStyle, labelStyle } from '../shared'

export type RotationModalProps = {
  secret: VaultSecret
  onClose: () => void
  onRotate?: (secretId: string) => Promise<{ ok: boolean; newValue?: string; error?: string }>
  requiresMFA?: boolean
}

type RotationStep = 'confirm' | 'mfa' | 'rotating' | 'success' | 'error'

export default function RotationModal({ secret, onClose, onRotate, requiresMFA = true }: RotationModalProps) {
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
            secret_id: secret.id,
            provider: secret.provider_name,
            secret_name: secret.secret_name,
          })
        } else {
          setError(result.error || 'Rotation failed')
          setStep('error')
          // Send failure notification
          await notifyBoth({
            event: 'rotation_failed',
            secret_id: secret.id,
            provider: secret.provider_name,
            secret_name: secret.secret_name,
            error: result.error,
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
          secret_id: secret.id,
          provider: secret.provider_name,
          secret_name: secret.secret_name,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      setStep('error')
      // Send error notification
      await notifyBoth({
        event: 'rotation_failed',
        secret_id: secret.id,
        provider: secret.provider_name,
        secret_name: secret.secret_name,
        error: msg,
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
          <div style={labelStyle}>Credential Management</div>
          <h2 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 900, letterSpacing: '-.02em' }}>
            Rotate {secret.secret_name}
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
            Generate a new credential for {secret.provider_name}.
          </p>
        </div>

        {/* Content */}
        {step === 'confirm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,193,0,.1)', border: '1px solid rgba(255,193,0,.2)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#fcd34d', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span>⚠️</span>
                <span>This action cannot be undone</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 4 }}>
                  Current Secret
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
                  After rotation
                </div>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
                  A new credential will be generated. The old one will be revoked automatically. This sync to Vercel environment
                  variables.
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
                Cancel
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
                Rotate Key
              </button>
            </div>
          </div>
        )}

        {step === 'mfa' && (
          <MFAVerification
            operation="rotation"
            secret name={secret.secret_name}
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
                Generating new credential...
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
                This may take a moment.
              </p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {step === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.2)', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#86efac' }}>Rotation successful</div>
            </div>

            {newValue && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 4 }}>
                  New Secret (Masked)
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
                ✓ New credential generated<br />
                ✓ Synced to Vercel env vars<br />
                ✓ Old credential revoked<br />
                ✓ Audit logged
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
              Done
            </button>
          </div>
        )}

        {step === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fca5a5', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <span>❌</span>
                <span>Rotation failed</span>
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
                Close
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
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
