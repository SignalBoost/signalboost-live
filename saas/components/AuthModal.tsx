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

  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    fontSize: 14,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }
