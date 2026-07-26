// saas/app/dashboard/supervisor/missions/reviews/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { loadLanguage } from '@/lib/i18n/loadLanguage'
import { getCurrentUser } from '@/utils/supabase/server'
import MissionReviewClient from './MissionReviewClient.tsx'

const locale = (value?: string) => {
  const candidate = (value || 'en').slice(0, 2).toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(candidate) ? candidate : 'en'
}

export default async function MissionReviewPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const access = await getAccess()
  const dictionary = await loadLanguage(locale((await cookies()).get('sb_locale')?.value))
  const labels = (dictionary as any).missionReviewUi as Record<string, string>

  if (!access.isAdmin) return <main style={page}><h1>{labels.title}</h1><p>{labels.accessDenied}</p></main>
  return <MissionReviewClient labels={labels} />
}

const page = { minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#06111f,#05070c)' }
