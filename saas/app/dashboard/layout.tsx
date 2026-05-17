import Navbar from '@/components/Navbar'
import React from 'react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#1e1e2e' }}>
      <Navbar />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {children}
      </div>
    </div>
  )
}
