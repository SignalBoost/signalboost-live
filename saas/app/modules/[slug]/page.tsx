import { notFound } from 'next/navigation'
import SaasModulePage from '@/components/cockpit/SaasModulePage'
import { MODULE_SLUGS, type ModuleSlug } from '@/lib/cockpit/missionControl'

export function generateStaticParams() {
  return MODULE_SLUGS.map((slug) => ({ slug }))
}

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!MODULE_SLUGS.includes(slug as ModuleSlug)) notFound()
  return <SaasModulePage slug={slug as ModuleSlug} />
}
