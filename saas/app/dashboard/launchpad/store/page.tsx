'use client'

import { EnterpriseLaunchpadPath } from '@/components/enterprise/EnterpriseLaunchpadPath'
import { uiText } from '@/lib/i18n/uiText'

const steps = [
  { label: uiText('generatedUi.u_65e76c2255bbbeae'), description: uiText('generatedUi.u_a5723192a72e7b7c'), href: '/dashboard/builder' },
  { label: uiText('generatedUi.u_3b32394fb127f45b'), description: uiText('generatedUi.u_1e9da59e5a805de3'), href: '/dashboard/video' },
  { label: uiText('generatedUi.u_fc3af37c88433a1e'), description: uiText('generatedUi.u_48a7b0575ebe91ab'), href: '/dashboard/reviews' },
  { label: uiText('generatedUi.u_c4f097753dd70622'), description: uiText('generatedUi.u_8cd24ee60b1de2fb'), href: '/dashboard/promote' },
  { label: uiText('generatedUi.u_d347106c3e442725'), description: uiText('generatedUi.u_c7579eec04350008'), href: '/dashboard/metrics' },
]

export default function StoreLaunchpadPage() {
  return <EnterpriseLaunchpadPath workspace="store" badge={uiText('generatedUi.u_89432a59faae0805')} title={uiText('generatedUi.u_fa5d8f1ecf974618')} subtitle={uiText('generatedUi.u_6a3a6129228c615a')} steps={steps} />
}
