'use client'

import { EnterpriseLaunchpadPath } from '@/components/enterprise/EnterpriseLaunchpadPath'
import { uiText } from '@/lib/i18n/uiText'

const steps = [
  { label: uiText('generatedUi.u_fcd8dcc60819fcbf'), description: uiText('generatedUi.u_bb0d145c1300291e'), href: '/dashboard/builder' },
  { label: uiText('generatedUi.u_a82583e02b6549be'), description: uiText('generatedUi.u_11627927dc53f04c'), href: '/dashboard/reviews' },
  { label: uiText('generatedUi.u_7b59fa6a8eb6129c'), description: uiText('generatedUi.u_9e476ca163d3ac20'), href: '/dashboard/audio' },
  { label: uiText('generatedUi.u_edf26e40c950ccb9'), description: uiText('generatedUi.u_c702a814788e910f'), href: '/dashboard/promote' },
  { label: uiText('generatedUi.u_aa5bb6e2f249dd12'), description: uiText('generatedUi.u_188bdf2732499348'), href: '/dashboard/metrics' },
]

export default function BusinessLaunchpadPage() {
  return <EnterpriseLaunchpadPath workspace="business" badge={uiText('generatedUi.u_deffefa6bcb6ae6b')} title={uiText('generatedUi.u_8505cfabe476d766')} subtitle={uiText('generatedUi.u_153dbc9ebbf67b2e')} steps={steps} />
}
