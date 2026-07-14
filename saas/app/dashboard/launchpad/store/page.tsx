'use client'

import { EnterpriseLaunchpadPath } from '@/components/enterprise/EnterpriseLaunchpadPath'

const steps = [
  { label: 'Build your storefront', description: 'Publish a product-focused site from the approved organization profile.', href: '/dashboard/builder' },
  { label: 'Create product videos', description: 'Generate governed product demonstrations and commerce media.', href: '/dashboard/video' },
  { label: 'Collect product reviews', description: 'Create a structured review workflow for the analyzed store.', href: '/dashboard/reviews' },
  { label: 'Launch marketing campaigns', description: 'Open Enterprise Campaign Studio with the approved source URL.', href: '/dashboard/promote' },
  { label: 'Track sales signals', description: 'Monitor performance and recommended next actions.', href: '/dashboard/metrics' },
]

export default function StoreLaunchpadPage() {
  return <EnterpriseLaunchpadPath workspace="store" badge="🛒 STORE" title="Launch your store with enterprise intelligence" subtitle="Analyze the store, review the structured commerce profile, approve it, and execute each governed launch step." steps={steps} />
}
