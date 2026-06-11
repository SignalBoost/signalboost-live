import { redirect } from 'next/navigation'

// This top-level page predates the dashboard outreach hub and duplicated it.
// Old links keep working; everyone lands on the real hub.
export default function OutreachRedirect() {
  redirect('/dashboard/outreach')
}
