'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'

const languages = ['en', 'es', 'pt', 'pl', 'ru']

export default function ReviewsPage() {
  const { t } = useTranslation()
  const [rating, setRating] = useState(5)
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const smartRoute = useMemo(() => rating <= 3 ? t('reviews.recovery', 'Route to recovery workflow') : t('reviews.public', 'Ready for public proof'), [rating, t])

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')
    const form = event.currentTarget
    const data = new FormData(form)
    const upload = data.get('upload') as File | null
    const payload = {
      customer_name: String(data.get('customer_name') || ''),
      customer_email: String(data.get('customer_email') || ''),
      rating,
      comment: String(data.get('comment') || ''),
      language: String(data.get('language') || 'en'),
      route: rating <= 3 ? 'recovery' : 'publishable',
      media_name: upload?.name || '',
      media_type: upload?.type || '',
    }
    const res = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.ok) { form.reset(); setRating(5); setStatus('success') } else { setStatus('error') }
  }

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.2),transparent_34%),linear-gradient(135deg,rgba(13,20,35,.96),rgba(5,7,11,.98))] p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('reviews.stage', 'Reviews Stage 1')}</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight md:text-5xl">{t('reviews.title', 'Collect multilingual customer reviews with smart routing.')}</h1>
        <p className="mt-4 max-w-3xl text-lg text-white/70">{t('reviews.subtitle', 'Invite customers to leave star ratings, comments, and optional photo or video proof.')}</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {['reviews.stage1', 'reviews.stage2', 'reviews.stage3'].map((key, index) => <div key={key} className="rounded-2xl border border-white/10 bg-black/30 p-4"><span className="text-[#FFD700]">0{index + 1}</span><p className="mt-2 text-sm text-white/75">{t(key)}</p></div>)}
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <form onSubmit={submitReview} className="rounded-3xl border border-white/10 bg-white/[.04] p-6">
          <h2 className="text-2xl font-bold">{t('reviews.formTitle', 'Collect a review')}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-white/70">{t('reviews.name', 'Customer name')}<input name="customer_name" required className="rounded-xl border border-white/10 bg-black/40 p-3 text-white" /></label>
            <label className="grid gap-2 text-sm text-white/70">{t('reviews.email', 'Customer email')}<input name="customer_email" type="email" required className="rounded-xl border border-white/10 bg-black/40 p-3 text-white" /></label>
          </div>
          <div className="mt-5"><p className="text-sm text-white/70">{t('reviews.rating', 'Star rating')}</p><div className="mt-2 flex gap-2">{[1,2,3,4,5].map((star) => <button key={star} type="button" onClick={() => setRating(star)} className={`text-3xl ${star <= rating ? 'text-[#FFD700]' : 'text-white/25'}`} aria-label={`${star} stars`}>★</button>)}</div></div>
          <label className="mt-5 grid gap-2 text-sm text-white/70">{t('reviews.comment', 'Comment')}<textarea name="comment" required rows={5} className="rounded-xl border border-white/10 bg-black/40 p-3 text-white" /></label>
          <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm text-white/70">{t('reviews.language', 'Review language')}<select name="language" className="rounded-xl border border-white/10 bg-black/40 p-3 text-white">{languages.map((lang) => <option key={lang} value={lang}>{lang.toUpperCase()}</option>)}</select></label><label className="grid gap-2 text-sm text-white/70">{t('reviews.upload', 'Photo or video proof')}<input name="upload" type="file" accept="image/*,video/*" className="rounded-xl border border-white/10 bg-black/40 p-3 text-white" /></label></div>
          <div className="mt-5 rounded-2xl border border-[#FFD700]/30 bg-[#FFD700]/10 p-4"><p className="text-xs uppercase tracking-[0.25em] text-[#FFD700]">{t('reviews.route', 'Smart route')}</p><p className="mt-2 font-bold">{smartRoute}</p></div>
          <button disabled={status === 'saving'} className="mt-6 rounded-full bg-[#FFD700] px-6 py-3 font-bold text-black disabled:opacity-60">{status === 'saving' ? '…' : t('reviews.submit', 'Save review')}</button>
          {status === 'success' && <p className="mt-4 text-emerald-300">{t('reviews.success', 'Review captured and routed.')}</p>}
          {status === 'error' && <p className="mt-4 text-red-300">{t('reviews.error', 'Could not save review yet.')}</p>}
        </form>
        <aside className="rounded-3xl border border-white/10 bg-black/40 p-6"><h2 className="text-2xl font-bold">SignalBoost routing</h2><div className="mt-5 space-y-4">{['reviews.preview1','reviews.preview2','reviews.preview3'].map((key) => <div key={key} className="rounded-2xl border border-white/10 bg-white/[.03] p-4 text-white/75">{t(key)}</div>)}</div></aside>
      </section>
    </main>
  )
}
