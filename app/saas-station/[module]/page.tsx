import { notFound } from 'next/navigation'
import SaasStationModuleClient from '@/components/saas-station/SaasStationModuleClient'
import { getSaasStationModule, saasStationModules } from '@/lib/saasStation/modules'

export function generateStaticParams() {
  return saasStationModules.map((module) => ({ module: module.key }))
}

export default async function SaasStationModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: moduleKey } = await params
  const module = getSaasStationModule(moduleKey)
  if (!module) notFound()
  return <SaasStationModuleClient module={module} />
}
