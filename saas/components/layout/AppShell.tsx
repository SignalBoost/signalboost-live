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

  return (
    <div className={isConciergeHome ? 'sb-ai-app-shell sb-ai-app-shell--home' : 'sb-ai-app-shell sb-ai-app-shell--canvas'}>
      <div className="sb-ai-workspace" role="presentation">
        {children}
      </div>
    </div>
  )
}
