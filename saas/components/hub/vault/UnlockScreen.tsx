'use client'

// saas/components/hub/vault/UnlockScreen.tsx
// Vault access control — password + real TOTP verification before showing secrets.

import { useState } from 'react'
import { cardStyle, labelStyle } from '../shared'

export type UnlockScreenProps = {
  onUnlock: (sessionId: string) => void
  isLoading?: boolean
}

type UnlockStep = 'password' | 'totp-setup' | 'totp-verify' | 'waiting'

interface TOTPSetup {
  secret: string
  qrCodeUrl: string
  backupCodes: string[]
}

export default function UnlockScreen({ onUnlock, isLoading = false }: UnlockScreenProps) {
  const [step, setStep] = useState<UnlockStep>('password')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState('')
  const [totpSetup, setTotpSetup] = useState<TOTPSetup | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password.trim()) {
      setError('Password is required')
      return
    }

    // TODO: Real password verification against auth
    // For now: any non-empty password works
    // Extract email from user context (hardcoded for demo)
    const demoEmail = 'luis@signalboost.com'
    setUserEmail(demoEmail)

    // Check if user has TOTP enabled
    const hasTOTP = localStorage.getItem(`totp_enabled_${demoEmail}`)
    
    if (!hasTOTP) {
      // First time: show TOTP setup
      await generateTOTPSetup(demoEmail)
    } else {
      // Already has TOTP: go to verification
      setStep('totp-verify')
    }
  }

  const generateTOTPSetup = async (email: string) => {
    try {
      const response = await fetch('/api/vault/totp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail: email }),
      })

      const data = await response.json()

      if (!data.ok) {
        setError(data.error || 'Failed to generate TOTP')
        return
      }

      setTotpSetup({
        secret: data.secret,
        qrCodeUrl: data.qrCodeUrl,
        backupCodes: data.backupCodes,
      })
      setStep('totp-setup')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Setup failed: ${msg}`)
    }
  }

  const handleTOTPSetupConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!totpCode.trim() || totpCode.length !== 6) {
      setError('Enter a valid 6-digit code')
      return
    }

    setIsVerifying(true)

    try {
      const response = await fetch('/api/vault/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: totpCode,
          userEmail,
          totpSecret: totpSetup?.secret,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        setError(data.error || 'Invalid code')
        setTotpCode('')
        setIsVerifying(false)
        return
      }

      // Mark TOTP as enabled
      localStorage.setItem(`totp_enabled_${userEmail}`, 'true')
      localStorage.setItem(`totp_secret_${userEmail}`, totpSetup?.secret || '')

      // Unlock vault
      onUnlock(data.sessionId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Verification failed: ${msg}`)
      setIsVerifying(false)
    }
  }

  const handleTOTPVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!totpCode.trim() || totpCode.length !== 6) {
      setError('Enter a valid 6-digit code')
      return
    }

    setIsVerifying(true)

    try {
      const secret = localStorage.getItem(`totp_secret_${userEmail}`)
      
      const response = await fetch('/api/vault/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: totpCode,
          userEmail,
          totpSecret: secret,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        setError(data.error || 'Invalid code')
        setTotpCode('')
        setIsVerifying(false)
        return
      }

      // Unlock vault
      onUnlock(data.sessionId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Verification failed: ${msg}`)
      setIsVerifying(false)
    }
  }

  const handleGoBack = () => {
    setPassword('')
    setTotpCode('')
    setError('')
    setTotpSetup(null)
    setStep('password')
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 80,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      {/* Refresh - Reload page to escape unlock vault */}
      <button
        onClick={() => window.location.reload()}
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          padding: '10px 18px',
          background: '#ffc300',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 900,
          zIndex: 51,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(255, 195, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        ↻ Refresh
      </button>

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
          <div style={labelStyle}>Secure Access Required</div>
          <h2 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 900 }}>
            {step === 'password' && 'Unlock Vault'}
            {step === 'totp-setup' && 'Enable 2FA'}
            {step === 'totp-verify' && 'Enter 2FA Code'}
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
            {step === 'password' && 'Enter your password'}
            {step === 'totp-setup' && 'Scan QR code with Google Authenticator'}
            {step === 'totp-verify' && 'This session will expire in 30 minutes for security.'}
          </p>
        </div>

        {/* Password Step */}
        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', display: 'block', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
                style={{
                  width: '100%',
                  padding: '11px 12px',
                  borderRadius: 10,
                  border: error ? '1px solid #ef4444' : '1px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.04)',
                  color: '#fff',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            {error && (
              <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 500 }}>
                {error}
              </div>
            )}

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
              }}
            >
              {isLoading ? 'Verifying...' : 'Continue'}
            </button>
          </form>
        )}

        {/* TOTP Setup Step */}
        {step === 'totp-setup' && totpSetup && (
          <form onSubmit={handleTOTPSetupConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <img
                src={totpSetup.qrCodeUrl}
                alt="TOTP QR Code"
                style={{ width: 200, height: 200, borderRadius: 10, border: '2px solid rgba(26,240,255,.2)' }}
              />
              <p style={{ margin: '12px 0 0', fontSize: 11, color: 'rgba(255,255,255,.6)' }}>
                Scan with Google Authenticator, Microsoft Authenticator, or Authy
              </p>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', display: 'block', marginBottom: 6 }}>
                Enter 6-digit code to confirm
              </label>
              <input
                type="text"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                }}
              />
            </div>

            {error && (
              <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 500 }}>
                {error}
              </div>
            )}

            <div style={{ borderRadius: 8, background: 'rgba(255,193,0,.1)', border: '1px solid rgba(255,193,0,.2)', padding: 10 }}>
              <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,193,0,.8)', lineHeight: 1.5 }}>
                <strong>Save these backup codes:</strong>
                <br />
                {totpSetup.backupCodes.join(', ')}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleGoBack}
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
                Back
              </button>
              <button
                type="submit"
                disabled={isVerifying || totpCode.length !== 6}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#1af0ff',
                  color: '#000',
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: isVerifying || totpCode.length !== 6 ? 'not-allowed' : 'pointer',
                  opacity: isVerifying || totpCode.length !== 6 ? 0.6 : 1,
                }}
              >
                {isVerifying ? 'Verifying...' : 'Unlock'}
              </button>
            </div>
          </form>
        )}

        {/* TOTP Verify Step */}
        {step === 'totp-verify' && (
          <form onSubmit={handleTOTPVerify} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', display: 'block', marginBottom: 6 }}>
                2FA Code
              </label>
              <input
                type="text"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                type="button"
                onClick={handleGoBack}
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
                Back
              </button>
              <button
                type="submit"
                disabled={isVerifying || totpCode.length !== 6}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#1af0ff',
                  color: '#000',
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: isVerifying || totpCode.length !== 6 ? 'not-allowed' : 'pointer',
                  opacity: isVerifying || totpCode.length !== 6 ? 0.6 : 1,
                }}
              >
                {isVerifying ? 'Verifying...' : 'Unlock'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
