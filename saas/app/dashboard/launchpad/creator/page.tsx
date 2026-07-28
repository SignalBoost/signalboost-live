'use client'

import { EnterpriseLaunchpadPath } from '@/components/enterprise/EnterpriseLaunchpadPath'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const steps = [
  { label: uiCopy('u_bdd48797aefa1cb6'), description: uiCopy('u_b0ab0341eb4c3746'), href: '/dashboard/builder' },
  { label: uiCopy('u_74a14d8f8d12456c'), description: uiCopy('u_9007c9111ef1c30f'), href: '/dashboard/audio' },
  { label: uiCopy('u_e5990baca76300f1'), description: uiCopy('u_73593921af686f8a'), href: '/dashboard/video' },
  { label: uiCopy('u_5b8c0aab9c11490b'), description: uiCopy('u_019b19bde5f5247b'), href: '/dashboard/promote' },
  { label: uiCopy('u_8d60bbcc558ae67d'), description: uiCopy('u_e8c6fcb0a5f241e4'), href: '/dashboard/metrics' },
]

export default function CreatorLaunchpadPage() {
  return <EnterpriseLaunchpadPath workspace="creator" badge={uiCopy('u_7ff5cbf93b321f18')} title={uiCopy('u_d4f540d5a98a5c28')} subtitle={uiCopy('u_e324d7c4aebf2a61')} steps={steps} />
}
