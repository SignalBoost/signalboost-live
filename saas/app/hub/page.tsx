'use client'

// saas/app/hub/page.tsx
// SignalBoost Hub Console — multi-page console host.
// All console logic lives in components/hub/. This file only mounts the shell.

import ConsoleShell from '@/components/hub/ConsoleShell'

export default function HubConsolePage() {
  return <ConsoleShell />
}
