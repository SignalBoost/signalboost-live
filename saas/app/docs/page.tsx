'use client'
import Link from 'next/link'
import { useState } from 'react'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

// Internal contact address. NEVER rendered as text on the page — only used inside
// mailto: links so the user's mail client opens with the right recipient.
// Bots scraping the rendered HTML do not see this string.
const CONTACT_EMAIL = 'cadomos@gmail.com'

const SECTIONS = [
  {
    id: 'how-it-works',
    icon: '⚡',
    title: 'How SignalBoost works',
    content: [
      {
        q: 'What is SignalBoost?',
        a: 'SignalBoost is a multilingual content platform. We help businesses build websites, collect customer reviews, produce native audio and video content, and reach global audiences in 5 languages: English, Portuguese, Spanish, Polish and Russian. We are not a translation service — we create native content that sounds and reads like it was made by a local.'
      },
      {
        q: 'Who is SignalBoost for?',
        a: 'Anyone who wants to reach an international audience. From a bakery in Lisbon that wants a website in Portuguese and English, to a podcast network that wants to reach listeners in Brazil, Poland and Russia. We serve both complete beginners and technical developers — the experience adapts to your level.'
      },
      {
        q: 'What does SignalBoost NOT do?',
        a: 'We do not do hardware or recording equipment. We do not edit raw audio (removing background noise, cutting mistakes). We do not host podcast RSS feeds or submit to Spotify/Apple Podcasts. We do not produce music or intros. We are honest about our limits.'
      },
      {
        q: 'How does the AI work?',
        a: 'SignalBoost uses AI to generate native voiceover, captions, social clips, show notes, website content and more. Our AI support agent monitors your activity and proactively helps when it detects you are stuck — without you having to ask. If the AI cannot solve something, it brings in additional AI support silently, then escalates to Luis (our founder) if still unresolved.'
      },
    ]
  },
  {
    id: 'partners',
    icon: '🤝',
    title: 'Our partners — full transparency',
    content: [
      {
        q: 'Why does SignalBoost recommend certain providers?',
        a: 'We recommend providers based on quality, reliability and value. We have tested all of them. Some of our recommendations include affiliate links — meaning SignalBoost earns a commission if you sign up through our link, at no extra cost to you. We always disclose this clearly.'
      },
      {
        q: 'Which providers do you recommend and why?',
        a: 'Domain names: Namecheap (best value, easy DNS), Cloudflare (at-cost pricing, free SSL). Hosting: Vercel (best performance, free tier), Netlify (great for static sites). Audio AI: ElevenLabs (most natural voices available). We do not recommend providers we have not tested ourselves.'
      },
      {
        q: 'Do partner commissions affect your recommendations?',
        a: 'No. We list Cloudflare as a domain option even though they do not pay commissions, because they are genuinely good. If a provider becomes worse than their competitors we will say so and remove them from our recommendations, regardless of commission. Our users trust matters more than commission income.'
      },
      {
        q: 'Can SignalBoost get a partnership deal that benefits me?',
        a: 'Yes — we actively seek partnerships that give SignalBoost users discounts or extended trials. If we secure a deal, we pass the benefit to you. Check our pricing page for current partner benefits.'
      },
    ]
  },
  {
    id: 'your-data',
    icon: '🔒',
    title: 'Your data and privacy',
    content: [
      {
        q: 'Where is my data stored?',
        a: 'Your account data and project metadata are stored in Supabase — a secure, open-source database platform hosted on AWS. Your audio and video files are stored in Supabase Storage. Your site files are deployed via Vercel. We do not store your API keys in plain text — they are encrypted at rest.'
      },
      {
        q: 'Who can see my data?',
        a: 'Only you can see your projects and files. Luis (founder) has admin access for support purposes only and does not access user data unless you request help. We do not sell your data to anyone. We do not share it with third parties except the infrastructure providers listed above.'
      },
      {
        q: 'What happens if I cancel?',
        a: 'You keep access until the end of your billing period. After that your data is kept for 30 days in case you want to return. After 30 days it is permanently deleted. You can request immediate deletion at any time by opening a support ticket from this page.'
      },
      {
        q: 'How do I delete my account?',
        a: 'Open a support ticket from this page with the subject "Delete my account" sent from your registered email address. We will delete everything within 48 hours and confirm when done. No questions asked.'
      },
    ]
  },
  {
    id: 'ai-support',
    icon: '🤖',
    title: 'AI support — how it works',
    content: [
      {
        q: 'How does the AI support system work?',
        a: 'SignalBoost monitors your activity in real time. If you spend more than 3 minutes on the same page, click repeatedly without progress, or encounter an error — the AI proactively opens and offers help. It already knows your account, your plan, your current page, and what went wrong. You never have to explain your situation from scratch.'
      },
      {
        q: 'What happens when the AI cannot solve my problem?',
        a: 'The AI escalates seamlessly.
