import ServiceExperience from '@/components/services/ServiceExperience'
import { getServiceByKey } from '@/lib/services/catalog'

export default function ImproveWebsitePage() {
  const service = getServiceByKey('improve')!
  return <ServiceExperience service={service} mode="dashboard" />
}
