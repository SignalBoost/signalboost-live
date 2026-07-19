import ExecutiveOperationsDashboardLoader from '@/components/enterprise/ExecutiveOperationsDashboardLoader'

type Props = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>
}>

export default async function OperationsDashboardPage({ searchParams }: Props) {
  const params = await searchParams
  const raw = params.organizationId
  const organizationId = (Array.isArray(raw) ? raw[0] : raw || '').trim()

  if (!organizationId) {
    return <main style={{ minHeight: '100vh', background: '#030611', color: '#fff', padding: 40 }}>
      <h1>Operations Intelligence</h1>
      <p role="alert">An organizationId query parameter is required.</p>
    </main>
  }

  return <ExecutiveOperationsDashboardLoader organizationId={organizationId} />
}
