import React from 'react'
import AssistantComposerResetGuard from '@/components/AssistantComposerResetGuard'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="sb-app-shell">
      <AssistantComposerResetGuard />
      {children}
    </div>
  )
}
