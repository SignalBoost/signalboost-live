'use client'
import { useState } from 'react'

const INDIVIDUAL_PLANS = [
  {
    index: 0, name: 'Free', plan: 'free',
    description: 'Try SignalBoost with no commitment.',
    features: ['1 website', '1 language', 'Review collector (basic)', 'SignalBoost watermark', 'Community support'],
    cta: 'Start free', highlight: false, seats: '1 user', price: 'Free',
  },
  {
    index: 1, name: 'Starter', plan: 'starter',
    description: 'Perfect for small businesses getting started.',
    features: ['1 website', '2 languages', 'Review collector', 'Native audio (50 credits/mo)', 'Captions (2 languages)', 'No watermark', 'Email support'],
    cta: 'Get Starter', highlight: false, seats: '1 user', price: '$10',
  },
  {
    index: 2, name: 'Pro', plan: 'pro',
    description: 'For growing businesses that need more reach.',
    features: ['5 websites', 'All 5 languages', 'Review collector + video', 'Native audio (200 credits/mo)', 'Captions in all 5 languages', 'Video editor', 'Priority support'],
    cta: 'Get Pro', highlight: true, seats: '1 user', price: '$30',
  },
  {
    index: 3, name: 'Business', plan: 'business',
    description: 'For agencies and multi-location brands.',
    features: ['Unlimited websites', 'All 5 languages + custom', 'Full review & video suite', 'Native audio (unlimited)', 'Custom caption formats (SRT, VTT)', 'Video editor + export', 'Dedicated account manager', 'White label option'],
    cta: 'Contact us', highlight: false, seats: '1 user', price: '$90',
  },
]

const TEAM_PLANS = [
  {
    index: 2, name: 'Pro Team', plan: 'pro',
    description: 'For teams that need to collaborate and scale.',
    features: ['5 websites', 'All 5 languages', 'Review collector + video', 'Native audio (200 credits/mo)', 'Captions in all 5 languages', 'Video editor', 'Priority support', 'Team management'],
    cta: 'Get Pro Team', highlight: false, seats: '3 users', price: '$30',
  },
  {
    index: 3, name: 'Business Team', plan: 'business',
    description: 'For agencies managing multiple brands.',
    features: ['Unlimited websites', 'All 5 languages + custom', 'Full review & video suite', 'Native audio (unlimited)', 'Custom caption formats (SRT, VTT)', 'Video editor + export', 'Dedicated account manager', 'White label option', 'Team management'],
    cta: 'Get Business Team', highlight: true, seats: '10 users', price: '$90',
  },
  {
    index: 0, name: 'Enterprise', plan: 'enterprise',
    description: 'Custom solution for large organizations.',
    features: ['Unlimited everything', 'Custom languages', 'Custom integrations', 'SLA guarantee', 'Dedicated infrastructure', 'Custom onboarding', 'Volume discounts'],
    cta: 'Contact sales', highlight: false, seats: 'Unlimited users', price: 'Custom',
  },
]

export default function PricingPage() {
  const [tab, setTab] = useState<'individual' | 'team'>('individual')
  const [loading, setLoading] = useState<string | null>(null)
  const plans = tab === 'individual' ? INDIVIDUAL_PLANS : TEAM_PLANS

  async function handleCheckout(plan: string) {
    if (plan === 'free') { window.location.href = '/dashboard'; return }
    if (plan === 'business' || plan === 'enterprise') {
      window.location.href = 'mailto:cadomos@gmail.com?subject=SignalBoost Plan Inquiry'
      return
    }
    try {
      setLoading(plan)
      // Get auth token to pass userId to checkout
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else alert('Something went wrong. Please try again.')
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui' }}>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 80px' }}>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)', borderRadius: 999, padding: '4px 16px', marginBottom: 14, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ffc300' }}>
            Simple pricing
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
            Plans that grow with you
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, maxWidth: 460, margin: '0 auto 8px' }}>
            Start free. Upgrade when you are ready.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, margin: '0 auto 20px' }}>
            Prices shown in USD.
          </p>

          <d
