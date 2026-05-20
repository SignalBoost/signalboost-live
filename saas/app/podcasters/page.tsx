'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const CONTACT_EMAIL = 'support@signalboostapp.com'

const CURRENCIES = ['USD', 'BRL', 'PLN', 'MXN', 'EUR']
const SYMBOLS: Record<string, string> = { USD: '$', BRL: 'R$', PLN: 'zł', MXN: '$', EUR: '€' }

export default function PodcastersPage() {
  const { dict } = useI18n()
  const [currency, setCurrency] = useState('USD')

  const PLANS = [
    {
      name: t(dict, 'podcasters.plans.indie.name', 'Indie'),
      key: 'indie',
      price: { USD: 29, BRL: 149, PLN: 120, MXN: 540, EUR: 27 },
      description: t(dict, 'podcasters.plans.indie.description', 'Perfect for independent podcasters getting started globally.'),
      features: [
        t(dict, 'podcasters.plans.indie.f1', '1 show'),
        t(dict, 'podcasters.plans.indie.f2', '4 episodes per month'),
        t(dict, 'podcasters.plans.indie.f3', '2 languages'),
        t(dict, 'podcasters.plans.indie.f4', 'Native AI voiceover'),
        t(dict, 'podcasters.plans.indie.f5', 'Captions in 2 languages'),
        t(dict, 'podcasters.plans.indie.f6', 'Basic clip generation (5 clips/ep)'),
        t(dict, 'podcasters.plans.indie.f7', 'Podcast website'),
        t(dict, 'podcasters.plans.indie.f8', 'Listener reviews'),
        t(dict, 'podcasters.plans.indie.f9', 'Email support'),
      ],
      cta: t(dict, 'podcasters.plans.indie.cta', 'Get started'),
      highlight: false,
    },
    {
      name: t(dict, 'podcasters.plans.pro.name', 'Pro'),
      key: 'pro',
      price: { USD: 79, BRL: 399, PLN: 320, MXN: 1450, EUR: 74 },
      description: t(dict, 'podcasters.plans.pro.description', 'For serious podcasters who want global reach.'),
      features: [
        t(dict, 'podcasters.plans.pro.f1', '3 shows'),
        t(dict, 'podcasters.plans.pro.f2', 'Unlimited episodes'),
        t(dict, 'podcasters.plans.pro.f3', 'All 5 languages'),
        t(dict, 'podcasters.plans.pro.f4', 'Native AI voiceover (priority)'),
        t(dict, 'podcasters.plans.pro.f5', 'Captions in all 5 languages'),
        t(dict, 'podcasters.plans.pro.f6', 'Clip factory (unlimited clips)'),
        t(dict, 'podcasters.plans.pro.f7', 'Multi-language podcast website'),
        t(dict, 'podcasters.plans.pro.f8', 'Listener reviews + analytics'),
        t(dict, 'podcasters.plans.pro.f9', 'Transcript in all languages'),
        t(dict, 'podcasters.plans.pro.f10', 'Priority support'),
      ],
      cta: t(dict, 'podcasters.plans.pro.cta', 'Get started'),
      highlight: true,
    },
    {
      name: t(dict, 'podcasters.plans.network.name', 'Network'),
      key: 'network',
      price: { USD: 299, BRL: 1490, PLN: 1200, MXN: 5400, EUR: 279 },
      description: t(dict, 'podcasters.plans.network.description', 'For podcast networks managing multiple shows.'),
      features: [
        t(dict, 'podcasters.plans.network.f1', 'Unlimited shows'),
        t(dict, 'podcasters.plans.network.f2', 'Unlimited episodes'),
        t(dict, 'podcasters.plans.network.f3', 'All 5 languages + custom'),
        t(dict, 'podcasters.plans.network.f4', 'Native AI voiceover (dedicated)'),
        t(dict, 'podcasters.plans.network.f5', 'Custom caption formats (SRT, VTT, ASS)'),
        t(dict, 'podcasters.plans.network.f6', 'Clip factory (unlimited)'),
        t(dict, 'podcasters.plans.network.f7', 'White label website'),
        t(dict, 'podcasters.plans.network.f8', 'Full analytics suite'),
        t(dict, 'podcasters.plans.network.f9', 'API access'),
        t(dict, 'podcasters.plans.network.f10', 'Dedicated account manager'),
        t(dict, 'podcasters.plans.network.f11', 'SLA guarantee'),
      ],
      cta: t(dict, 'podcasters.plans.network.cta', 'Contact us'),
      highlight: false,
    },
  ]

  const HOW_IT_WORKS = [
    { step: '01', title: t(dict, 'podcasters.how.s1.title', 'Upload your episode'), desc: t(dict, 'podcasters.how.s1.desc', 'Drop your finished audio or video file. We support MP3, MP4, WAV and more. No raw editing needed.') },
    { step: '02', title: t(dict, 'podcasters.how.s2.title', 'Choose your languages'), desc: t(dict, 'podcasters.how.s2.desc', 'Select which languages you want. Pick from English, Portuguese, Spanish, Polish and Russian.') },
    { step: '03', title: t(dict, 'podcasters.how.s3.title', 'We generate everything'), desc: t(dict, 'podcasters.how.s3.desc', 'Native AI voiceover, captions, short clips, translated show notes — all automatic.') },
    { step: '04', title: t(dict, 'podcasters.how.s4.title', 'Publish everywhere'), desc: t(dict, 'podcasters.how.s4.desc', 'Download your multilingual episodes or publish directly to your SignalBoost podcast website.') },
  ]

  const DELIVERABLES = [
    { icon: '🎙️', title: t(dict, 'podcasters.deliver.d1.title', 'Native AI voiceover'), desc: t(dict, 'podcasters.deliver.d1.desc', 'Your episode dubbed in Portuguese, Spanish, Polish and Russian with natural-sounding AI voices.') },
    { icon: '💬', title: t(dict, 'podcasters.deliver.d2.title', 'Multilingual captions'), desc: t(dict, 'podcasters.deliver.d2.desc', 'Auto-generated subtitles in all your languages. Download as SRT, VTT or burn them into your video.') },
    { icon: '✂️', title: t(dict, 'podcasters.deliver.d3.title', 'Social clips'), desc: t(dict, 'podcasters.deliver.d3.desc', 'Short-form clips for TikTok, Instagram Reels and YouTube Shorts — in every language.') },
    { icon: '📝', title: t(dict, 'podcasters.deliver.d4.title', 'Translated show notes'), desc: t(dict, 'podcasters.deliver.d4.desc', 'Episode summaries written natively in each language — not machine translated.') },
    { icon: '🌐', title: t(dict, 'podcasters.deliver.d5.title', 'Podcast website'), desc: t(dict, 'podcasters.deliver.d5.desc', 'A branded site with episode player, show notes, and a multilingual language switcher.') },
    { icon: '⭐', title: t(dict, 'podcasters.deliver.d6.title', 'Listener reviews'), desc: t(dict, 'podcasters.deliver.d6.desc', 'Collect and display listener testimonials in their native language.') },
  ]

  const STATS = [
    { value: '5', label: t(dict, 'podcasters.stats.languages', 'Languages') },
    { value: '< 2hr', label: t(dict, 'podcasters.stats.turnaround', 'Turnaround') },
    { value: 'SRT/VTT', label: t(dict, 'podcasters.stats.captionFormats', 'Caption formats') },
    { value: t(dict, 'podcasters.stats.freeSketch', 'Free sketch'), label: t(dict, 'podcasters.stats.noCommitment', 'No commitment') },
  ]

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui' }}>

      <section style={{ maxWidth: 800, margin: '0 auto', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)', borderRadius: 999, padding: '4px 16px', marginBottom: 24, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ffc300' }}>
          🎙️ {t(dict, 'podcasters.badge', 'For p
