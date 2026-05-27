'use client'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
export default function OutreachDiscoveryPage(){const {dict}=useI18n();return <main style={{padding:24}}><h1>{t(dict,'outreach.discovery.title','')}</h1><p>{t(dict,'outreach.discovery.subtitle','')}</p><button>{t(dict,'outreach.discovery.extractContacts','')}</button><div><Link href='/dashboard/outreach/contacts'>{t(dict,'outreach.nav.contacts','')}</Link></div></main>}
