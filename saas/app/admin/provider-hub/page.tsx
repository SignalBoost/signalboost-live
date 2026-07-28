import ProviderHubStatusDashboard from '@/components/provider-hub/ProviderHubStatusDashboard'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function ProviderHubAdminPage() {
  return <ProviderHubStatusDashboard endpoint="/api/admin/provider-hub/status" title={uiCopy('u_d3c7b761f01fd140')} />
}
