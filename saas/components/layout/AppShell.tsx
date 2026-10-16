'use client'

import { usePathname } from 'next/navigation'
import { publicLocaleFromPath } from '@/lib/seo/publicLocales'

/**
 * COS/Concierge is the dedicated full-screen homepage experience.
 * Other routes get the complete canvas; they must not reserve space for a
 * hidden/collapsed global dock or mount another Concierge instance.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isConciergeHome = pathname === '/' || Boolean(publicLocaleFromPath(pathname))
  // Workspace routes need the entire viewport for tools, results, charts and editors.
  // Only informational routes use a centered reading column.
  const isContentPage = /^\/(?:pricing|faq|about|contact|privacy|terms|docs)(?:\/|$)/.test(pathname || '')
  const layoutMode = isConciergeHome ? 'home' : isContentPage ? 'content' : 'canvas'

  return (
    <div className={`sb-ai-app-shell sb-ai-app-shell--${layoutMode}`}>
      <div className="sb-ai-workspace" role="presentation">
        {children}
      </div>
    </div>
  )
}
