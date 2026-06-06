'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

type Job = {
  id: string
  source_video: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  job_type: 'transcode' | 'caption_burn' | 'export'
  result_url?: string | null
  error?: string | null
  created_at?: string
  transcode_provider?: string | null
}

type Subscription = {
  allowed: boolean
  reason: 'demo_only' | 'over_quota' | 'included' | 'metered_extra'
  plan: string
  used: number
  quota: number
  requiresBilling: boolean
}

type BillingProvider = { provider: 'stripe' | 'paypal'; url: string }

type Phase = 'idle' | 'uploading' | 'queueing'

const COPY = {
  en: {
    eyebrow: 'Video Transcoder', title: 'Burn captions into export-ready MP4s', subtitle: 'Upload source video, enqueue heavy FFmpeg renders on the worker, and store outputs in Supabase.', upload: 'Upload video', export: 'Export MP4', queue: 'Job queue', download: 'Download MP4', quota: 'Quota', billing: 'Extra render billing required', demo: 'Free/demo users can preview demo playback only. Upgrade for full transcoding/export.', footer: 'Worker sync health: queue is polled from Supabase; FFmpeg runs outside serverless.', queued: 'Queued', processing: 'Processing', completed: 'Completed', failed: 'Failed', noJobs: 'No render jobs yet.', source: 'Source video', refresh: 'Refresh', selected: 'Selected', choose: 'Choose a video to upload.', health: 'Supabase storage + render queue ready.' },
    es: { eyebrow: 'Transcodificador de video', title: 'Incrusta subtítulos en MP4 listos para exportar', subtitle: 'Sube el video fuente, encola renders pesados de FFmpeg en el worker y guarda salidas en Supabase.', upload: 'Subir video', export: 'Exportar MP4', queue: 'Cola de trabajos', download: 'Descargar MP4', quota: 'Cuota', billing: 'Se requiere pago por render extra', demo: 'Los usuarios gratis/demo solo pueden ver reproducción demo. Actualiza para transcodificación/exportación completa.', footer: 'Salud de sincronización: la cola se consulta desde Supabase; FFmpeg corre fuera de serverless.', queued: 'En cola', processing: 'Procesando', completed: 'Completado', failed: 'Fallido', noJobs: 'Aún no hay renders.', source: 'Video fuente', refresh: 'Actualizar', selected: 'Seleccionado', choose: 'Elige un video para subir.', health: 'Storage Supabase + cola de render listos.' },
  pt: { eyebrow: 'Transcodificador de vídeo', title: 'Grave legendas em MP4s prontos para exportação', subtitle: 'Envie o vídeo fonte, coloque renders pesados de FFmpeg no worker e salve saídas no Supabase.', upload: 'Enviar vídeo', export: 'Exportar MP4', queue: 'Fila de jobs', download: 'Baixar MP4', quota: 'Cota', billing: 'Pagamento de render extra necessário', demo: 'Usuários grátis/demo têm apenas reprodução demo. Faça upgrade para transcoding/export completo.', footer: 'Saúde da sincronização: a fila é lida no Supabase; FFmpeg roda fora do serverless.', queued: 'Na fila', processing: 'Processando', completed: 'Concluído', failed: 'Falhou', noJobs: 'Nenhum render ainda.', source: 'Vídeo fonte', refresh: 'Atualizar', selected: 'Selecionado', choose: 'Escolha um vídeo para enviar.', health: 'Storage Supabase + fila de render prontos.' },
  pl: { eyebrow: 'Transkoder wideo', title: 'Wypal napisy w MP4 gotowych do eksportu', subtitle: 'Prześlij źródło, dodaj ciężkie rendery FFmpeg do kolejki workera i zapisz wyniki w Supabase.', upload: 'Prześlij wideo', export: 'Eksportuj MP4', queue: 'Kolejka zadań', download: 'Pobierz MP4', quota: 'Limit', billing: 'Wymagana opłata za dodatkowy render', demo: 'Użytkownicy free/demo mają tylko odtwarzanie demo. Ulepsz plan, aby eksportować pełne MP4.', footer: 'Stan synchronizacji: kolejka jest odpytywana z Supabase; FFmpeg działa poza serverless.', queued: 'W kolejce', processing: 'Przetwarzanie', completed: 'Gotowe', failed: 'Błąd', noJobs: 'Brak renderów.', source: 'Źródło wideo', refresh: 'Odśwież', selected: 'Wybrano', choose: 'Wybierz wideo do przesłania.', health: 'Storage Supabase + kolejka renderów gotowe.' },
  ru: { eyebrow: 'Видео транскодер', title: 'Вшивайте субтитры в готовые к экспорту MP4', subtitle: 'Загрузите исходное видео, поставьте тяжелый FFmpeg-рендер в очередь worker и сохраните результат в Supabase.', upload: 'Загрузить видео', export: 'Экспорт MP4', queue: 'Очередь задач', download: 'Скачать MP4', quota: 'Лимит', billing: 'Требуется оплата дополнительного рендера', demo: 'Бесплатные/demo пользователи получают только demo-воспроизведение. Обновите план для полного экспорта.', footer: 'Синхронизация: очередь читается из Supabase; FFmpeg работает вне serverless.', queued: 'В очереди', processing: 'Обработка', completed: 'Готово', failed: 'Ошибка', noJobs: 'Рендеров пока нет.', source: 'Исходное видео', refresh: 'Обновить', selected: 'Выбрано', choose: 'Выберите видео для загрузки.', health: 'Supabase storage + очередь рендера готовы.' },
}

function activeLocale(dict: Record<string, unknown>): keyof typeof COPY {
  const raw = String(dict?.locale || dict?.language || 'en').slice(0, 2).toLowerCase()
  if (raw === 'es' || raw === 'pt' || raw === 'pl' || raw === 'ru') return raw
  return 'en'
}

async function safeJson(res: Response): Promise<any> {
  try { return await res.json() } catch { return { error: `Unexpected response (${res.status})` } }
}

export default function TranscoderPanel() {
  const i18n: any = useI18n()
  const dict = i18n?.dict ?? i18n ?? {}
  const locale = activeLocale(dict)
  const c = COPY[locale]
  const tr = (key: string, fallback: string) => t(dict, key, fallback)

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    return url && key ? createBrowserClient(url, key) : null
  }, [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sourcePath, setSourcePath] = useState<string>('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [jobs, setJobs] = useState<Job[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [billingProviders, setBillingProviders] = useState<BillingProvider[]>([])
  const [error, setError] = useState<string | null>(null)

  const quotaPercent = subscription?.quota ? Math.min(100, Math.round((subscription.used / subscription.quota) * 100)) : 0
  const canExport = Boolean(sourcePath) && phase === 'idle'

  async function refreshJobs() {
    const response = await fetch('/api/video/export')
    const data = await safeJson(response)
    if (response.ok) {
      setJobs(data.jobs || [])
      setSubscription(data.subscription || null)
    }
  }

  useEffect(() => { refreshJobs() }, [])

  async function uploadVideo() {
    if (!file || phase !== 'idle') return
    setError(null)
    setBillingProviders([])
    setPhase('uploading')
    try {
      const prep = await fetch('/api/video/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, langs: ['en'], formats: ['srt'], sourceOnly: true }),
      })
      const prepData = await safeJson(prep)
      if (!prep.ok) throw new Error(prepData.error || 'Could not prepare upload')

      if (!supabase) throw new Error('Supabase browser client is not configured.')
      const { error: uploadError } = await supabase.storage.from('video-jobs').uploadToSignedUrl(prepData.path, prepData.token, file)
      if (uploadError) throw new Error(uploadError.message)
      setSourcePath(prepData.path)
      await refreshJobs()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError))
    } finally {
      setPhase('idle')
    }
  }

  async function exportVideo() {
    if (!canExport) return
    setError(null)
    setBillingProviders([])
    setPhase('queueing')
    try {
      const response = await fetch('/api/video/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceVideo: sourcePath, jobType: 'export' }),
      })
      const data = await safeJson(response)
      if (!response.ok) {
        if (data.billing?.providers) setBillingProviders(data.billing.providers)
        setSubscription(data.subscription || subscription)
        throw new Error(data.message || data.billing?.message || data.error || 'Could not queue export')
      }
      setSourcePath('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await refreshJobs()
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError))
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 20px 80px' }}>
      <p className="sb-eyebrow">{tr('transcoder.eyebrow', c.eyebrow)}</p>
      <h2 className="sb-h2">{tr('transcoder.title', c.title)}</h2>
      <p className="sb-body" style={{ maxWidth: 720, marginTop: 8 }}>{tr('transcoder.subtitle', c.subtitle)}</p>

      <div className="sb-card" style={{ marginTop: 24, padding: 20, display: 'grid', gap: 18 }}>
        <div>
          <strong>{tr('transcoder.source', c.source)}</strong>
          <p className="sb-caption" style={{ marginTop: 4 }}>{file ? `${c.selected}: ${file.name}` : tr('transcoder.choose', c.choose)}</p>
        </div>
        <input ref={fileRef} type="file" accept="video/*,.mp4,.mov,.webm,.mkv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="sb-button-secondary" disabled={!file || phase !== 'idle'} onClick={uploadVideo}>{phase === 'uploading' ? 'Uploading…' : tr('transcoder.upload', c.upload)}</button>
          <button className="sb-button-primary" disabled={!canExport} onClick={exportVideo}>{phase === 'queueing' ? 'Queueing…' : tr('transcoder.export', c.export)}</button>
          <button className="sb-button-ghost" onClick={refreshJobs}>{tr('transcoder.refresh', c.refresh)}</button>
        </div>
        {sourcePath && <p className="sb-caption">Supabase: {sourcePath}</p>}
      </div>

      <QuotaStatusBar label={tr('transcoder.quota', c.quota)} subscription={subscription} percent={quotaPercent} />
      <BillingBanner copy={c} subscription={subscription} providers={billingProviders} error={error} />

      <div className="sb-card" style={{ marginTop: 24, padding: 20 }}>
        <h3 className="sb-h3">{tr('transcoder.queue', c.queue)}</h3>
        <JobQueueView jobs={jobs} copy={c} />
      </div>

      <footer className="sb-caption" style={{ marginTop: 24 }}>
        {tr('transcoder.footer', c.footer)} {tr('transcoder.health', c.health)}
      </footer>
    </div>
  )
}

function QuotaStatusBar({ label, subscription, percent }: { label: string; subscription: Subscription | null; percent: number }) {
  return (
    <div className="sb-card" style={{ marginTop: 24, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong>{label}</strong>
        <span className="sb-caption">{subscription ? `${subscription.used}/${subscription.quota} · ${subscription.plan}` : '—'}</span>
      </div>
      <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: 'linear-gradient(90deg,#1af0ff,#ffc300)' }} />
      </div>
    </div>
  )
}

function BillingBanner({ copy, subscription, providers, error }: { copy: (typeof COPY)['en']; subscription: Subscription | null; providers: BillingProvider[]; error: string | null }) {
  if (!error && !subscription?.requiresBilling && subscription?.reason !== 'demo_only') return null
  const demo = subscription?.reason === 'demo_only'
  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 14, border: '1px solid rgba(255,195,0,.35)', background: 'rgba(255,195,0,.1)', color: '#fff' }}>
      <strong>{demo ? 'Demo playback' : copy.billing}</strong>
      <p className="sb-body" style={{ marginTop: 6 }}>{demo ? copy.demo : error}</p>
      {providers.length > 0 && <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>{providers.map((item) => <a key={item.provider} className="sb-button-secondary" href={item.url}>{item.provider === 'stripe' ? 'Stripe' : 'PayPal'}</a>)}</div>}
    </div>
  )
}

function JobQueueView({ jobs, copy }: { jobs: Job[]; copy: (typeof COPY)['en'] }) {
  if (!jobs.length) return <p className="sb-caption" style={{ marginTop: 12 }}>{copy.noJobs}</p>
  const statusLabel = (status: Job['status']) => copy[status]
  return (
    <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
      {jobs.map((job) => (
        <div key={job.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.03)' }}>
          <div>
            <strong>{statusLabel(job.status)} · {job.job_type}</strong>
            <p className="sb-caption" style={{ marginTop: 4 }}>{job.source_video}</p>
            {job.error && <p style={{ color: '#ffb4b4', marginTop: 4 }}>{job.error}</p>}
          </div>
          {job.status === 'completed' && job.result_url ? <a className="sb-button-primary" href={job.result_url}>{copy.download}</a> : <span className="sb-caption">{job.transcode_provider || 'ffmpeg'}</span>}
        </div>
      ))}
    </div>
  )
}
