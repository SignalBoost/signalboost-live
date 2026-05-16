'use client'
import { useState } from 'react'
import { supabase } from '@/utils/supabase/client'

type Mode = 'login' | 'signup'

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit() {
    setError('')
    setSuccess('')
    setLoading(true)
    if (mode === 'signup') {
      if (!name.trim()) { setError('Please enter your name.'); setLoading(false); return }
      const { error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        }
      })
      if (error) setError(error.message)
      else setSuccess('Check your email to confirm your account!')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else { onClose(); window.location.href = '/dashboard' }
    }
    setLoading(false)
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    })
  }

  const inp: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    fontSize: 14,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 12,
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#111118',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          padding: '36px 32px',
          width: '100%',
          maxWidth: 420,
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 22,
            cursor: 'pointer',
          }}
        >
          x
        </button>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
            signal<span style={{ color: '#ffc300' }}>boost</span>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
            {mode === 'login' ? 'Welcome back' : 'Create your free account'}
          </div>
        </div>

        <button
          onClick={handleGoogle}
          style={{
            width: '100%',
            padding: '11px 0',
            borderRadius: 10,
            marginBottom: 16,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {mode === 'signup' && (
          <input
            type="text"
            placeholder="Your full name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={inp}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.5)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
          />
        )}

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          style={inp}
          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.5)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          style={{ ...inp, marginBottom: mode === 'signup' ? 8 : 20 }}
          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.5)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
        />

        {mode === 'signup' && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 16, lineHeight: 1.5 }}>
            You will start on the Free plan — 1 website, 1 language. Upgrade anytime. Business partners get 30 days on Starter free.
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ fontSize: 13, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            {success}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px 0',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 800,
            background: '#ffc300',
            color: '#000',
            border: 'none',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            marginBottom: 16,
          }}
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create free account'}
        </button>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
          {mode === 'login' ? (
            <>
              Do not have an account?{' '}
              <button
                onClick={() => { setMode('signup'); setError('') }}
                style={{ color: '#ffc300', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Sign up free
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError('') }}
                style={{ color: '#ffc300', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Log in
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
