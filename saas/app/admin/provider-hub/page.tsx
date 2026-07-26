import ProviderHubStatusDashboard from '@/components/provider-hub/ProviderHubStatusDashboard'

export default function ProviderHubAdminPage() {
  return <ProviderHubStatusDashboard endpoint="/api/admin/provider-hub/status" title="Enterprise provider administration" />
}
