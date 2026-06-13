'use client'

// saas/components/hub/vault/UnlockScreen.tsx
// Vault access control — password/MFA verification before showing secrets.

import { useState } from 'react'
import { cardStyle, labelStyle } from '../shared'

export type UnlockScreenProps = {
  onUnlock: (sessionId: string) => void
  isLoading?: boolean
}

type UnlockStep = 'password' | 'mfa' | 'waiting'

export default function UnlockScreen({ onUnlock, isLoading = false }: UnlockScreenProps) {
  const [step, setStep] = useState<UnlockStep>('password')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [error, setError] = useState('')

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password.trim()) {
      setError('Password is required')
      return
    }

    // TODO: Verify password against Supabase auth
    // For now, accept any non-empty password for demo
    setStep('mfa')
  }

  const handleMFASubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!mfaCode.trim() || mfaCode.length !== 6) {
      setError('Enter a valid 6-digit code')
      return
    }

    setStep('waiting')

    // TODO: Verify MFA code via Supabase or TOTP library
    // For demo, accept any 6-digit code
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800))

      const sessionId = 'vault_' + Math.random().toString(36).substr(2, 9)
      onUnlock(sessionId)
    } catch (err) {
      setError('MFA verification failed. Please try again.')
      setStep('mfa')
    }
  }

  const handleGoBack = () => {
    if (step === 'mfa') {
      setPassword('')
      setMfaCode('')
      setError('')
      setStep('password')
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
        zIndex: 9999,
      }}
    >
      <div
        style={{
          ...cardStyle,
          width: '100%',
          maxWidth: 380,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div>
          <div style={labelStyle}>Secure Access Required</div>
          <h2 style={{ margin: '6px 0 2px', fontSize: 20, fontWeight: 900, letterSpacing: '-.02em' }}>
            Unlock Vault
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.55)', lineHeight: 1.5 }}>
            {step === 'password' && 'Enter your password to access credentials.'}
            {step === 'mfa' && 'Enter your 6-digit authentication code.'}
            {step === 'waiting' && 'Verifying credentials...'}
          </p>
        </div>

        {/* Form */}
        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.72)' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
                style={{
                  padding: '11px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.04)',
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border-color .2s',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(26,240,255,.4)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,.15)')}
              />
            </div>

            {error && <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>{error}</div>}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: '11px 14px',
                borderRadius: 10,
                border: 'none',
                background: '#1af0ff',
                color: '#000',
                fontSize: 13,
                fontWeight: 900,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
                transition: 'opacity .2s',
              }}
            >
              {isLoading ? 'Verifying...' : 'Continue'}
            </button>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={handleMFASubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.72)' }}>
                2FA Code
              </label>
              <input
                type="text"
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                style={{
                  padding: '11px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.04)',
                  color: '#fff',
                  fontSize: 16,
                  fontFamily: 'monospace',
                  letterSpacing: '0.15em',
                  outline: 'none',
                  transition: 'border-color .2s',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(26,240,255,.4)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,.15)')}
              />
            </div>

            {error && <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleGoBack}
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.04)',
                  color: 'rgba(255,255,255,.72)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.5 : 1,
                }}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#1af0ff',
                  color: '#000',
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? 'Verifying...' : 'Unlock'}
              </button>
            </div>
          </form>
        )}

        {step === 'waiting' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '20px 0' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '2px solid rgba(26,240,255,.2)',
                borderTopColor: '#1af0ff',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.55)' }}>Verifying credentials...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Footer */}
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', textAlign: 'center' }}>
          This session will expire in 30 minutes for security.
        </div>
      </div>
    </div>
  )
}
