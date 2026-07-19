import ExecutiveOperationsDashboardLoader from '@/components/enterprise/ExecutiveOperationsDashboardLoader'

type Props = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>
}>

export default async function OperationsDashboardPage({ searchParams }: Props) {
  const params = await searchParams
  const raw = params.organizationId
  const organizationId = (Array.isArray(raw) ? raw[0] : raw || '').trim()

  return <ExecutiveOperationsDashboardLoader organizationId={organizationId} />
}
