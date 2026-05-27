'use client'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
export default function OutreachSendPage(){const {dict}=useI18n();return <main style={{padding:24}}><h1>{t(dict,'outreach.send.title','')}</h1><p>{t(dict,'outreach.send.subtitle','')}</p><div>{t(dict,'outreach.send.throttle','')}</div><div><Link href='/dashboard/outreach/pipeline'>{t(dict,'outreach.nav.pipeline','')}</Link></div></main>}
