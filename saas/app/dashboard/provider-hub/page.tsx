import ProviderHubStatusDashboard from '@/components/provider-hub/ProviderHubStatusDashboard'

export default function ProviderHubDashboardPage() {
  return <ProviderHubStatusDashboard endpoint="/api/provider-hub/status" title="Your provider connections" />
}
