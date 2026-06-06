'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

type SubscriptionTier = 'free' | 'pro' | 'enterprise'

type TranscodeResponse = {
  ok: boolean
  error?: string
  asset?: {
    id: string
    originalFilename: string
    originalExtension: string
    originalSizeMb: number
    transcodedFilename: string
    transcodedFormat: 'mp4'
    transcodedSizeMb: number
    status: 'ready' | 'failed' | 'pending' | 'processing'
    demoTrimmed: boolean
    usage: {
      subscriptionTier: SubscriptionTier
      quotaMb: number
      usedMb: number
      overageMb: number
      overageCharges: number
      extraChargeRequired: boolean
      playbackMode: 'demo' | 'full' | 'overage_billable'
      demoSeconds: number
    }
  }
  playback?: { mp4Url?: string; hlsUrl?: string; serve: 'hls_preferred_mp4_fallback' }
  billing?: {
    required: boolean
    amountUsd: number
    stripeCheckoutUrl: string | null
    paypalCheckoutUrl: string | null
    message: string | null
  }
}

function formatMb(value: number) {
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`
  return `${Math.round(value)} MB`
}

function percent(used: number, quota: number) {
  if (!quota) return 100
  return Math.min(100, Math.round((used / quota) * 100))
}

export default function VideoPlayerPanel() {
  const { dict } = useI18n()
  const tr = (key: string, fallback: string) => t(dict, key, fallback)
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [tier, setTier] = useState<SubscriptionTier>('free')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TranscodeResponse | null>(null)
  const [streamMode, setStreamMode] = useState<'hls' | 'mp4'>('mp4')

  const usage = result?.asset?.usage
  const canUpload = Boolean(file) && !busy
  const acceptedExtensions = '.mp4,.avi,.mkv,.flv,.mov,.webm,.wmv,.mpeg,.mpg,.m4v,.3gp,.ogv,video/*'

  useEffect(() => {
    const video = videoRef.current
    const playback = result?.playback
    if (!video || !playback) return
    const supportsNativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== ''
    if (supportsNativeHls && playback.hlsUrl) {
      video.src = playback.hlsUrl
      setStreamMode('hls')
    } else if (playback.mp4Url) {
      video.src = playback.mp4Url
      setStreamMode('mp4')
    }
    video.load()
  }, [result])

  const footer = useMemo(() => {
    if (busy) return tr('video_engine.footer.processing', 'Transcoding engine: processing with FFmpeg normalization and HLS packaging.')
    if (result?.asset?.status === 'ready') return tr('video_engine.footer.ready', 'Transcoding engine: ready and synchronized.')
    return tr('video_engine.footer.idle', 'Transcoding engine: idle and healthy.')
  }, [busy, result?.asset?.status, dict])

  function chooseFile(list: FileList | null) {
    const next = list?.[0]
    if (!next) return
    setFile(next)
    setResult(null)
    setError(null)
  }

  async function upload() {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('subscriptionTier', tier)
      const response = await fetch('/api/video/transcode', { method: 'POST', body: fd })
      const data = await response.json() as TranscodeResponse
      if (!response.ok || !data.ok) {
        setError(data.error || tr('video_engine.errors.failed', 'Video transcoding failed.'))
        return
      }
      setResult(data)
    } catch {
      setError(tr('video_engine.errors.network', 'Network error while uploading the video.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 20px 80px' }}>
      <p className="sb-eyebrow">{tr('video_engine.eyebrow', 'Universal Playback')}</p>
      <h2 className="sb-h2">{tr('video_engine.title', 'Video Transcoding + Universal Playback Engine')}</h2>
      <p className="sb-body" style={{ maxWidth: 760, marginTop: 8 }}>
        {tr('video_engine.subtitle', 'Upload AVI, MKV, FLV, MOV, WEBM, MP4, or other video files. SignalBoost archives the original and serves browser-safe MP4 with HLS adaptive streaming.')}
      </p>

      <div className="sb-card" style={{ marginTop: 24, padding: 22, display: 'grid', gap: 18 }}>
        <UploadVideoButton
          tr={tr}
          file={file}
          busy={busy}
          acceptedExtensions={acceptedExtensions}
          inputRef={inputRef}
          onChoose={chooseFile}
        />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="sb-caption">{tr('video_engine.subscription.label', 'Subscription tier')}</span>
          {(['free', 'pro', 'enterprise'] as SubscriptionTier[]).map((option) => (
            <button
              key={option}
              type="button"
              className={tier === option ? 'sb-button-primary' : 'sb-button-secondary'}
              onClick={() => setTier(option)}
              disabled={busy}
            >
              {tr(`video_engine.subscription.${option}`, option === 'free' ? 'Free/demo' : option === 'pro' ? 'Pro' : 'Enterprise')}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="sb-button-primary"
          disabled={!canUpload}
          onClick={upload}
          style={{ opacity: canUpload ? 1 : 0.55, width: 'fit-content' }}
        >
          {busy ? tr('video_engine.upload.processing', 'Transcoding to MP4/HLS…') : tr('video_engine.upload.cta', 'Upload and normalize video')}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 20, padding: 14, borderRadius: 14, border: '1px solid rgba(255,90,90,.45)', color: '#ffb4b4', background: 'rgba(255,90,90,.12)' }}>
          {error}
        </div>
      )}

      <PlaybackView tr={tr} result={result} videoRef={videoRef} streamMode={streamMode} />
      <QuotaStatusBar tr={tr} usage={usage} />
      <BillingBanner tr={tr} result={result} />

      <footer className="sb-caption" style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span>{footer}</span>
        <span>{tr('video_engine.footer.formats', 'Serving standardized MP4/HLS; originals retained for archive.')}</span>
      </footer>
    </section>
  )
}

function UploadVideoButton({ tr, file, busy, acceptedExtensions, inputRef, onChoose }: {
  tr: (key: string, fallback: string) => string
  file: File | null
  busy: boolean
  acceptedExtensions: string
  inputRef: RefObject<HTMLInputElement>
  onChoose: (list: FileList | null) => void
}) {
  return (
    <div>
      <input ref={inputRef} type="file" accept={acceptedExtensions} style={{ display: 'none' }} onChange={(event) => onChoose(event.target.files)} />
      <button type="button" className="sb-button-secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
        {tr('video_engine.upload.choose', 'Choose any video file')}
      </button>
      <p className="sb-body" style={{ marginTop: 10 }}>
        {file ? `${file.name} (${formatMb(file.size / (1024 * 1024))})` : tr('video_engine.upload.none', 'No video selected yet.')}
      </p>
      <p className="sb-caption">{tr('video_engine.upload.accepts', 'Accepted: MP4, AVI, MKV, FLV, MOV, WEBM, WMV, MPEG, 3GP, OGV, and video/* MIME uploads.')}</p>
    </div>
  )
}

function PlaybackView({ tr, result, videoRef, streamMode }: {
  tr: (key: string, fallback: string) => string
  result: TranscodeResponse | null
  videoRef: RefObject<HTMLVideoElement>
  streamMode: 'hls' | 'mp4'
}) {
  if (!result?.asset || !result.playback) return null
  const modeLabel = result.asset.usage.playbackMode === 'demo'
    ? tr('video_engine.playback.demo', 'Free/demo account: this file was automatically trimmed to a short demo clip.')
    : result.asset.usage.playbackMode === 'overage_billable'
      ? tr('video_engine.playback.overage', 'Over-quota account: full playback is available with overage billing reconciliation.')
      : tr('video_engine.playback.full', 'Paid account: full video playback within quota.')
  return (
    <div className="sb-card" style={{ marginTop: 24, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h3 className="sb-h3">{tr('video_engine.playback.title', 'PlaybackView')}</h3>
          <p className="sb-caption">{modeLabel}</p>
        </div>
        <span className="sb-caption">{streamMode === 'hls' ? tr('video_engine.playback.hls', 'Adaptive HLS stream') : tr('video_engine.playback.mp4', 'MP4 fallback stream')}</span>
      </div>
      <video ref={videoRef} controls playsInline preload="metadata" style={{ width: '100%', borderRadius: 16, background: '#05070a' }}>
        <source src={result.playback.hlsUrl} type="application/vnd.apple.mpegurl" />
        <source src={result.playback.mp4Url} type="video/mp4" />
      </video>
      <p className="sb-caption" style={{ marginTop: 10 }}>
        {tr('video_engine.playback.asset', 'Standardized asset')}: {result.asset.transcodedFilename} · {formatMb(result.asset.transcodedSizeMb)}
      </p>
    </div>
  )
}

function QuotaStatusBar({ tr, usage }: { tr: (key: string, fallback: string) => string; usage?: TranscodeResponse['asset']['usage'] }) {
  if (!usage) return null
  const pct = percent(usage.usedMb, usage.quotaMb)
  return (
    <div className="sb-card" style={{ marginTop: 18, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong>{tr('video_engine.quota.title', 'QuotaStatusBar')}</strong>
        <span className="sb-caption">{formatMb(usage.usedMb)} / {formatMb(usage.quotaMb)}</span>
      </div>
      <div style={{ height: 10, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,.09)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: usage.extraChargeRequired ? '#ff9500' : 'var(--cyan, #1af0ff)' }} />
      </div>
      <p className="sb-caption" style={{ marginTop: 8 }}>
        {usage.extraChargeRequired
          ? tr('video_engine.quota.over', 'Storage is over quota and will accrue metered charges.')
          : tr('video_engine.quota.ok', 'Storage is within quota.')}
      </p>
    </div>
  )
}

function BillingBanner({ tr, result }: { tr: (key: string, fallback: string) => string; result: TranscodeResponse | null }) {
  const billing = result?.billing
  if (!billing?.required) return null
  return (
    <div style={{ marginTop: 18, padding: 18, borderRadius: 18, border: '1px solid rgba(255,195,0,.45)', background: 'rgba(255,195,0,.10)' }}>
      <strong>{tr('video_engine.billing.title', 'BillingBanner')}</strong>
      <p className="sb-body" style={{ marginTop: 6 }}>
        {tr('video_engine.billing.copy', 'This account exceeded its video quota. Extra storage/playback is charged per GB/minute according to your billing settings.')}
      </p>
      <p className="sb-caption" style={{ marginTop: 6 }}>
        {tr('video_engine.billing.amount', 'Estimated charge')}: ${billing.amountUsd.toFixed(2)} USD
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        {billing.stripeCheckoutUrl && <a className="sb-button-primary" href={billing.stripeCheckoutUrl}>{tr('video_engine.billing.stripe', 'Pay with Stripe')}</a>}
        {billing.paypalCheckoutUrl && <a className="sb-button-secondary" href={billing.paypalCheckoutUrl}>{tr('video_engine.billing.paypal', 'Pay with PayPal')}</a>}
      </div>
      {billing.message && <p className="sb-caption" style={{ marginTop: 10 }}>{billing.message}</p>}
    </div>
  )
}
