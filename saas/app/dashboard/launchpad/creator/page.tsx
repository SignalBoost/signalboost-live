'use client'

import { EnterpriseLaunchpadPath } from '@/components/enterprise/EnterpriseLaunchpadPath'
import { uiText } from '@/lib/i18n/uiText'

const steps = [
  { label: uiText('generatedUi.u_aaa4091acfa051e9'), description: uiText('generatedUi.u_aef3fb778d5a0119'), href: '/dashboard/builder' },
  { label: uiText('generatedUi.u_b39a055dc0755565'), description: uiText('generatedUi.u_e4eaa6a3ca4d3adc'), href: '/dashboard/audio' },
  { label: uiText('generatedUi.u_a38ec6742c1f26f3'), description: uiText('generatedUi.u_8d3fd6076beae1a0'), href: '/dashboard/video' },
  { label: uiText('generatedUi.u_a4984048a13ac9e4'), description: uiText('generatedUi.u_956ef666889b0061'), href: '/dashboard/promote' },
  { label: uiText('generatedUi.u_98ade37b9cd136d8'), description: uiText('generatedUi.u_3b0f93ac011815ad'), href: '/dashboard/metrics' },
]

export default function CreatorLaunchpadPage() {
  return <EnterpriseLaunchpadPath workspace="creator" badge={uiText('generatedUi.u_74fb54ee602564da')} title={uiText('generatedUi.u_2a3641e900abf9c2')} subtitle={uiText('generatedUi.u_f42bac85a0139d44')} steps={steps} />
}
