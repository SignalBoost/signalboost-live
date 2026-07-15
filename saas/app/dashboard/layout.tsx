import React from 'react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="sb-app-shell">
      {children}
    </div>
  )
}
