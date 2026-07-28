// saas/components/layout/ShareRouteChrome.tsx
//
// HIDE THE MARKETING SHELL ON PUBLIC SHARE ROUTES.
//
// /demo/supervisor is opened by a prospective enterprise buyer holding a share link. Every
// other route on this domain is a consumer marketing surface, and the root layout renders
// its navbar, footer and concierge unconditionally — so an audit record proving a repair
// step refused to execute currently appears directly above "Free Website Optimizer",
// "Collect reviews" and "Podcasters".
//
// The record reads as enterprise infrastructure. The chrome around it reads as an SMB
// marketing tool. A technical buyer draws a conclusion from that mismatch, and it is not a
// conclusion that helps.
//
// WHY A CLIENT GATE RATHER THAN A NESTED LAYOUT. In the App Router a nested layout renders
// INSIDE the root layout, so it cannot remove what the root already rendered. Multiple root
// layouts would mean moving every existing route into a route group — a large change to a
// repo several lanes are editing today. This gate is the small, reversible version: the
// root layout keeps its structure and simply asks whether the current route is a share page.
//
// SHARE_ROUTES is deliberately a short explicit list rather than a pattern. Chrome
// disappearing from a route by accident is a bug nobody notices for weeks.

'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

/** Routes served to people who are not signed in and are not customers yet. */
const SHARE_ROUTES = ['/demo/supervisor']

export function isShareRoute(pathname: string | null): boolean {
  if (!pathname) return false
  return SHARE_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))
}

/**
 * Renders children everywhere except on a share route. Used to keep the marketing navbar,
 * footer and concierge off pages a prospective buyer opens from a link.
 */
export default function ShareRouteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (isShareRoute(pathname)) return null
  return <>{children}</>
}
