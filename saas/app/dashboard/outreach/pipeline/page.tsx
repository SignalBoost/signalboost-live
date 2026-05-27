'use client'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
const STAGES=['discovered','contacted','replied','booked','closed'] as const
export default function OutreachPipelinePage(){const {dict}=useI18n();return <main style={{padding:24}}><h1>{t(dict,'outreach.pipeline.title','')}</h1><div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12}}>{STAGES.map(s=><section key={s}><h2>{t(dict,`outreach.pipeline.${s}`,'')}</h2></section>)}</div></main>}
