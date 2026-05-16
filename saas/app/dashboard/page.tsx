'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import TeamManager from '@/components/TeamManager'
import { supabase } from '@/utils/supabase/client'

export default function DashboardOverviewPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id)
        setUserEmail(data.user.email ?? null)
      }
    })
  }, [])

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20, marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>
          System overview
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
          Welcome back{userEmail ? `, ${userEmail}` : ''}. Here is the operational status of your SignalBoost platform.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, padding: '24px',
        }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            Quick actions
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { href: '/dashboard/builder',  icon: '🌐', label: 'Site builder' },
              { href: '/dashboard/reviews',  icon: '⭐', label: 'Review collector' },
              { href: '/dashboard/audio',    icon: '🎙️', label: 'Native audio' },
              { href: '/dashboard/video',    icon: '🎬', label: 'Video editor' },
            ].map(item => (
              <Link key={item.href} href={item.href}
                style={{
                  display: 'block', padding: '16px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12, textDecoration: 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}>
                <span style={{ fontSize: 20, display: 'block', marginBottom: 6 }}>{item.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, padding: '24px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            Account balance
          </h2>
          <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-0.03em', color: '#ffc300' }}>
            750
            <span style={{ fontSize: 16, fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>credits</span>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <Link href="/dashboard/metrics"
              style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,195,0,0.8)', textDecoration: 'none' }}>
              View analytics →
            </Link>
            <Link href="/pricing"
              style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>
              Buy more credits →
            </Link>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Active sites',      value: '0' },
          { label: 'Reviews collected', value: '0' },
          { label: 'Audio generated',   value: '0 min' },
          { label: 'Videos created',    value: '0' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8, fontWeight: 500 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16, padding: '24px',
      }}>
        <h2 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>
          Team members
        </h2>
        {userId ? (
          <TeamManager userId={userId} />
        ) : (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
            Loading team...
          </p>
        )}
      </div>

    </div>
  )
}
