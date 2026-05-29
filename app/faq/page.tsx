'use client'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
export default function Page(){ const { t } = useTranslation(); return <main className="min-h-screen bg-black text-white p-8"><Link href="/" className="text-[#FFD700] no-underline">← SignalBoost</Link><section className="mt-12 max-w-3xl"><h1 className="text-4xl font-bold mb-4">{t('pages.faq.title')}</h1><p className="text-neutral-400">{t('landing.subtitle')}</p><Link href="/dashboard" className="inline-block mt-6 px-5 py-3 rounded-lg bg-[#FFD700] text-black font-semibold no-underline">{t('landing.cta')}</Link></section></main> }
