import React from 'react'
import Concierge from '@/components/Concierge'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div className="sb-app-shell">
        {children}
      </div>
      <Concierge />
    </>
  )
}
