'use client'

import { EnterpriseLaunchpadPath } from '@/components/enterprise/EnterpriseLaunchpadPath'

const steps = [
  { label: 'Generate your website', description: 'Publish a multilingual business site from the approved organization profile.', href: '/dashboard/builder' },
  { label: 'Set up review collection', description: 'Create a governed public review workflow for the analyzed organization.', href: '/dashboard/reviews' },
  { label: 'Create promotional media', description: 'Generate approved audio and video assets from the structured profile.', href: '/dashboard/audio' },
  { label: 'Prepare a marketing campaign', description: 'Build localized campaigns through Enterprise Campaign Studio.', href: '/dashboard/promote' },
  { label: 'Track growth signals', description: 'Monitor results and next recommended actions.', href: '/dashboard/metrics' },
]

export default function BusinessLaunchpadPage() {
  return <EnterpriseLaunchpadPath workspace="business" badge="🏪 BUSINESS" title="Launch your business with enterprise intelligence" subtitle="Analyze the organization, review the structured profile, approve it, and then execute each governed launch step." steps={steps} />
}
