'use client'

import { EnterpriseLaunchpadPath } from '@/components/enterprise/EnterpriseLaunchpadPath'

const steps = [
  { label: 'Build your creator site', description: 'Publish a creator hub from the approved public source profile.', href: '/dashboard/builder' },
  { label: 'Generate voice and audio', description: 'Create governed narration and audio assets in the approved language.', href: '/dashboard/audio' },
  { label: 'Create short-form videos', description: 'Produce structured video concepts without unrestricted campaign prose.', href: '/dashboard/video' },
  { label: 'Grow with promotion', description: 'Open Enterprise Campaign Studio with the approved organization source.', href: '/dashboard/promote' },
  { label: 'Track audience signals', description: 'Review growth signals and recommended next actions.', href: '/dashboard/metrics' },
]

export default function CreatorLaunchpadPage() {
  return <EnterpriseLaunchpadPath workspace="creator" badge="🎬 CREATOR" title="Build your creator brand with enterprise intelligence" subtitle="Analyze the creator source, review the structured profile, approve it, and execute the governed launch path." steps={steps} />
}
