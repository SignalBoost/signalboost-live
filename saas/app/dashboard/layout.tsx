import React from 'react'
import Topbar from '@/components/Topbar'
import Concierge from '@/components/Concierge'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Topbar />
      {children}
      <Concierge />
    </>
  )
}
