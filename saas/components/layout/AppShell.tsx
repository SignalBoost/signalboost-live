import Concierge from '@/components/Concierge'
import { AI_DOCK_CSS_VARS } from '@/lib/layout/aiDock'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="sb-ai-app-shell" style={AI_DOCK_CSS_VARS}>
      <style>{`
        @media (min-width: 861px) {
          .sb-ai-app-shell {
            transition: grid-template-columns 180ms ease;
          }

          .sb-ai-app-shell:has(> .sb-ai-dock.is-collapsed) {
            grid-template-columns: minmax(0, 1fr) var(--sb-ai-dock-collapsed-width);
          }

          .sb-ai-app-shell > .sb-ai-dock.is-collapsed {
            width: var(--sb-ai-dock-collapsed-width);
          }
        }
      `}</style>
      <div className="sb-ai-workspace" role="presentation">
        {children}
      </div>
      <Concierge />
    </div>
  )
}
