import Concierge from '@/components/Concierge'
import { AI_DOCK_CSS_VARS } from '@/lib/layout/aiDock'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="sb-ai-app-shell" style={AI_DOCK_CSS_VARS}>
      <style>{uiCopy('u_0f8dc7c9710db1b0')}</style>
      <div className="sb-ai-workspace" role="presentation">
        {children}
      </div>
      <Concierge />
    </div>
  )
}
