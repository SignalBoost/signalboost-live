// saas/components/hub/ConsoleShell.tsx
'use client'

// Hub Console shell. The console is now the provider-centric Command Console:
// a tiered sidebar (Tier 1–4) with at most two provider cards per page, each
// expanding into a dedicated workspace, plus utility + system pages. All
// provider actions run through /api/hub/action (auth + policy + audit).

import CommandConsole from './console/CommandConsole'
import type { ConsoleTierId } from '@/lib/hub/console-catalog'
import type { Lang } from './shared'

export default function ConsoleShell({
  lang = 'en',
  initialTier = 'core',
}: {
  lang?: Lang
  initialTier?: ConsoleTierId
}) {
  return <CommandConsole lang={lang} initialTier={initialTier} />
}
