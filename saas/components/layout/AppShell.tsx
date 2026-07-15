import Concierge from '@/components/Concierge'
import { AI_DOCK_CSS_VARS } from '@/lib/layout/aiDock'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="sb-ai-app-shell" style={AI_DOCK_CSS_VARS}>
      <div className="sb-ai-workspace" role="presentation">
        {children}
      </div>
      <Concierge />
    </div>
  )
}
