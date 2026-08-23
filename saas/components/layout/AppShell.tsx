'use client'

import { usePathname } from 'next/navigation'
import Concierge from '@/components/Concierge'
import ShareRouteChrome from '@/components/layout/ShareRouteChrome'
import { AI_DOCK_CSS_VARS } from '@/lib/layout/aiDock'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isConciergeHome = pathname === '/'

  return (
    <div className="sb-ai-app-shell" style={AI_DOCK_CSS_VARS}>
      <style>{"\n        @media (min-width: 861px) {\n          .sb-ai-app-shell {\n            transition: grid-template-columns 180ms ease;\n          }\n\n          .sb-ai-app-shell:has(> .sb-ai-dock.is-collapsed) {\n            grid-template-columns: minmax(0, 1fr) var(--sb-ai-dock-collapsed-width);\n          }\n\n          .sb-ai-app-shell > .sb-ai-dock.is-collapsed {\n            width: var(--sb-ai-dock-collapsed-width);\n          }\n        }\n      "}</style>
      <div className="sb-ai-workspace" role="presentation">
        {children}
      </div>
      {!isConciergeHome && (
        <ShareRouteChrome>
          <Concierge />
        </ShareRouteChrome>
      )}
    </div>
  )
}
