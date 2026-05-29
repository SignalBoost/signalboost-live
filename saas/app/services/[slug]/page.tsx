import { notFound } from 'next/navigation'
import ServiceExperience from '@/components/services/ServiceExperience'
import { SERVICES, getServiceBySlug } from '@/lib/services/catalog'

export function generateStaticParams() {
  return SERVICES.map((service) => ({ slug: service.slug }))
}

export default async function ServiceLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = getServiceBySlug(slug)
  if (!service) notFound()
  return <ServiceExperience service={service} mode="landing" />
}
