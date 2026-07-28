'use client'

import { EnterpriseLaunchpadPath } from '@/components/enterprise/EnterpriseLaunchpadPath'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const steps = [
  { label: uiCopy('u_074b23d355f0b99a'), description: uiCopy('u_a2fe5ebde15c024f'), href: '/dashboard/builder' },
  { label: uiCopy('u_e905c9f7ae94ce48'), description: uiCopy('u_c91490f556e13a5f'), href: '/dashboard/video' },
  { label: uiCopy('u_875741ab8c8897af'), description: uiCopy('u_65c4ee520afb011c'), href: '/dashboard/reviews' },
  { label: uiCopy('u_0f22ecdafbbe1d97'), description: uiCopy('u_788f69be805c4618'), href: '/dashboard/promote' },
  { label: uiCopy('u_4fd8d64f571a3bf4'), description: uiCopy('u_01e8dbaf8bdd077f'), href: '/dashboard/metrics' },
]

export default function StoreLaunchpadPage() {
  return <EnterpriseLaunchpadPath workspace="store" badge={uiCopy('u_413136bf42b46f59')} title={uiCopy('u_2f899a5543dd23ea')} subtitle={uiCopy('u_712802bd0bb60636')} steps={steps} />
}
