import ProviderHubStatusDashboard from '@/components/provider-hub/ProviderHubStatusDashboard'
import { uiText } from '@/lib/i18n/uiText'

export default function ProviderHubAdminPage() {
  return <ProviderHubStatusDashboard endpoint="/api/admin/provider-hub/status" title={uiText('generatedUi.u_694d2394e96d99e2')} />
}
