'use client'

// saas/components/hub/vault/MFAVerification.tsx
// Multi-factor authentication for sensitive vault operations (rotation, revocation).

import { useState } from 'react'
import { cardStyle, labelStyle } from '../shared'

export type MFAVerificationProps = {
  operation: 'rotation' | 'revocation' | 'export'
  secret name: string
  onSuccess: () => void
  onCancel: () => void
}

type MFAMethod = 'totp' | 'email' | 'sms'
type VerificationStep = 'method-select' | 'verification' | 'success'

export default function MFAVerification({
  operation,
  secret name,
  onSuccess,
  onCancel,
}: MFAVerificationProps) {
  const [step, setStep] = useState<VerificationStep>('method-select')
  const [method, setMethod] = useState<MFAMethod>('totp')
  const [code, setCode] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const operationLabels = {
    rotation: 'Rotate this credential',
    revocation: 'Revoke this credential',
    export: 'Export this credential',
  }

  const handleSelectMethod = (m: MFAMethod) => {
    setMethod(m)
    setCode('')
    setError(null)
    setStep('verification')
  }

  const handleVerify = async () => {
    setIsVerifying(true)
    setError(null)

    try {
      if (!code.trim() || code.length < 6) {
        setError('Enter a valid code')
        setIsVerifying(false)
        return
      }

      // TODO: Verify code against Supabase (TOTP) or send email/SMS
      // For now: simulate verification
      await new Promise(resolve => setTimeout(resolve, 1200))

      // Simulate 90% success rate (sometimes fail for testing)
      if (Math.random() > 0.9) {
        setError('Invalid code. Please try again.')
        setCode('')
        setIsVerifying(false)
        return
      }

      setStep('success')
      setTimeout(() => {
        onSuccess()
      }, 1500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed'
      setError(msg)
      setIsVerifying(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9600,
      }}
    >
      <div
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
          <div style={labelStyle}>Security Verification</div>
          <h2 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 900 }}>
            Verify Your Identity
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
            {operationLabels[operation]}: {secret name}
          </p>
        </div>

        {/* Method selection */}
        {step === 'method-select' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['totp', 'email', 'sms'] as MFAMethod[]).map(m => (
              <button
                key={m}
                onClick={() => handleSelectMethod(m)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.04)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  transition: 'all .2s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(26,240,255,.3)'
                  ;(e.currentTarget as HTMLElement).style.background = 'rgba(26,240,255,.08)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.15)'
                  ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.04)'
                }}
              >
                <span style={{ fontSize: 16 }}>
                  {m === 'totp' && '📱'}
                  {m === 'email' && '📧'}
                  {m === 'sms' && '📲'}
                </span>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {m === 'totp' && 'Authenticator App'}
                    {m === 'email' && 'Email'}
                    {m === 'sms' && 'SMS'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>
                    {m === 'totp' && 'Use your authenticator app'}
                    {m === 'email' && `Code sent to your email`}
                    {m === 'sms' && `Code sent to your phone`}
                  </div>
                </div>
              </button>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={onCancel}
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
            </div>
          </div>
        )}

        {/* Verification */}
        {step === 'verification' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', display: 'block', marginBottom: 6 }}>
                Enter 6-digit code
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                style={{
                  width: '100%',
                  padding: '11px 12px',
                  borderRadius: 10,
                  border: error ? '1px solid #ef4444' : '1px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.04)',
                  color: '#fff',
                  fontSize: 18,
                  fontFamily: 'monospace',
                  letterSpacing: '0.2em',
                  textAlign: 'center',
                  outline: 'none',
                  transition: 'border .2s',
                }}
                onFocus={e => {
                  if (!error) (e.target.style.borderColor = 'rgba(26,240,255,.4)')
                }}
                onBlur={e => {
                  if (!error) (e.target.style.borderColor = 'rgba(255,255,255,.15)')
                }}
              />
            </div>

            {error && (
              <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 500 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onCancel}
                disabled={isVerifying}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.04)',
                  color: 'rgba(255,255,255,.72)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isVerifying ? 'not-allowed' : 'pointer',
                  opacity: isVerifying ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleVerify}
                disabled={isVerifying || code.length < 6}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#1af0ff',
                  color: '#000',
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: isVerifying || code.length < 6 ? 'not-allowed' : 'pointer',
                  opacity: isVerifying || code.length < 6 ? 0.6 : 1,
                }}
              >
                {isVerifying ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {step === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32 }}>✓</div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#86efac' }}>
              Verified successfully
            </p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
              Proceeding with operation...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
