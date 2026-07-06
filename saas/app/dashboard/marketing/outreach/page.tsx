import { redirect } from 'next/navigation'
import OutreachHubPage from '../../outreach/page'

const OLD_PRESS_CHANNELS = new Set(['online-newspapers', 'print-newspapers', 'trade-press'])

type PageProps = {
  searchParams?: Promise<{ channel?: string | string[] }> | { channel?: string | string[] }
}

export default async function MarketingOutreachPage({ searchParams }: PageProps) {
  const params = await searchParams
  const rawChannel = Array.isArray(params?.channel) ? params.channel[0] : params?.channel
  if (rawChannel && OLD_PRESS_CHANNELS.has(rawChannel)) redirect('/dashboard/marketing/press-print')
  return <OutreachHubPage />
}
