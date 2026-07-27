// saas/app/supervisor/[[...path]]/page.tsx
//
// A permanent redirect from /supervisor/* to /dashboard/supervisor/*.
//
// Every approval email sent before the console-URL fix carries a link to
// /supervisor/approvals, which never existed. Those emails are already delivered and
// cannot be edited, so without this they 404 forever — and an approval request that
// leads nowhere is the worst failure this product can have, because the whole point
// of it is that a paused step summons a human who can act.
//
// It also covers the case that produced the bug in the first place: /dashboard is
// easy to leave out of a URL typed from memory, and a redirect is a much better
// answer to that than a 404 page.
//
// Deliberately a redirect and not a copy of the page. Two routes rendering the same
// thing is two things to keep in sync, and the dashboard version is the one carrying
// the auth checks.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function SupervisorPathRedirect({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params
  // Each segment is re-encoded rather than passed through, so a crafted link cannot
  // use this redirect to reach somewhere outside /dashboard/supervisor.
  const suffix = (path ?? []).map(segment => encodeURIComponent(segment)).join('/')
  redirect(suffix ? `/dashboard/supervisor/${suffix}` : '/dashboard/supervisor')
}
