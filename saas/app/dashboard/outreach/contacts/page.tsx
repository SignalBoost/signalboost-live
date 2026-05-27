'use client'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
export default function OutreachContactsPage(){const {dict}=useI18n();return <main style={{padding:24}}><h1>{t(dict,'outreach.contacts.title','')}</h1><p>{t(dict,'outreach.contacts.subtitle','')}</p><button>{t(dict,'outreach.contacts.startOutreach','')}</button><div><Link href='/dashboard/outreach/outreach'>{t(dict,'outreach.nav.outreach','')}</Link></div></main>}
