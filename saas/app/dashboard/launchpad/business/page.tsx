'use client'

import { EnterpriseLaunchpadPath } from '@/components/enterprise/EnterpriseLaunchpadPath'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const steps = [
  { label: uiCopy('u_8b6de1ae75f68297'), description: uiCopy('u_6fa4380b2f5314f4'), href: '/dashboard/builder' },
  { label: uiCopy('u_5ab448937e359740'), description: uiCopy('u_726156141dace88d'), href: '/dashboard/reviews' },
  { label: uiCopy('u_490251146c80b3ae'), description: uiCopy('u_63fda75503d62f57'), href: '/dashboard/audio' },
  { label: uiCopy('u_9cb5dd1ad36244d8'), description: uiCopy('u_929a6a3114e0b083'), href: '/dashboard/promote' },
  { label: uiCopy('u_d0a3c921c2ccdd44'), description: uiCopy('u_e2024e344ecc7adb'), href: '/dashboard/metrics' },
]

export default function BusinessLaunchpadPage() {
  return <EnterpriseLaunchpadPath workspace="business" badge={uiCopy('u_7d9aa8032a0e8bae')} title={uiCopy('u_b05e782342519017')} subtitle={uiCopy('u_6f067e9bda6717bf')} steps={steps} />
}
