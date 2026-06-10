'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { defaultCaptionStyle, type CaptionCue, type CaptionStyle, type SupportedVideoLocale, type VideoQuota } from '@/lib/video/types'
import { calculateVideoQuota } from '@/lib/video/subscription'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type ExportState = { status: 'idle' | 'recording' | 'ready' | 'failed'; message: string; url?: string }
type UploadState = { status: 'idle' | 'uploading' | 'ready' | 'failed'; message: string }
type CaptionGenerationState = { status: 'idle' | 'generating' | 'ready' | 'failed'; message: string }
type AspectRatio = '9:16' | '1:1' | '16:9'
type CaptionPreset = { id: string; label: string; descKey: string; style: CaptionStyle }
type CanvasEditorHandle = { startExport: () => Promise<string> }
type CanvasEditorProps = { videoUrl: string | null; cues: CaptionCue[]; style: CaptionStyle; aspectRatio: AspectRatio; seekTime: number; durationSec: number; lang: string; onStyleChange: (s: CaptionStyle) => void; onTime: (t: number) => void; onDuration: (s: number) => void }

const COPY = {
  eyebrow:         { en: 'Video Studio', es: 'Video Studio', pt: 'Video Studio', pl: 'Video Studio', ru: 'Видео студия' },
  heroTitle:       { en: 'AI caption video editor', es: 'Editor de video con subtitulos IA', pt: 'Editor de video com legendas IA', pl: 'Edytor wideo z napisami AI', ru: 'Редактор видео с субтитрами AI' },
  heroSubtitle:    { en: 'Upload a video, generate synced AI captions, drag styled overlays on canvas, and export a captioned video file.', es: 'Sube un video, genera subtitulos IA sincronizados, arrastra overlays en el canvas y exporta el video.', pt: 'Faca upload, gere legendas IA sincronizadas, arraste overlays no canvas e exporte o video.', pl: 'Przeslij wideo, generuj napisy AI, przeciagnij overlaye na canvas i eksportuj.', ru: 'Загрузите видео, создайте субтитры, перетащите оверлеи и экспортируйте.' },
  quotaLabel:      { en: 'Video usage', es: 'Uso de video', pt: 'Uso de video', pl: 'Uzycie wideo', ru: 'Использование видео' },
  quotaNote:       { en: 'Exports record live in your browser. Export time equals video duration.', es: 'Las exportaciones se graban en tu navegador.', pt: 'As exportacoes sao gravadas no seu navegador.', pl: 'Eksporty nagrywane sa w przegladarce.', ru: 'Экспорты записываются в браузере.' },
  demoOnly:        { en: 'Free/demo users get preview playback only. Upgrade to export.', es: 'Usuarios gratuitos solo pueden previsualizar. Actualiza para exportar.', pt: 'Usuarios gratuitos apenas visualizam. Atualize para exportar.', pl: 'Bezplatni uzytkownicy tylko podgladaja. Ulepsz aby eksportowac.', ru: 'Бесплатные пользователи только просматривают. Обновитесь для экспорта.' },
  overage:         { en: 'Overage:', es: 'Exceso:', pt: 'Excesso:', pl: 'Przekroczenie:', ru: 'Превышение:' },
  overageAt:       { en: 'extra minute(s) at', es: 'minuto(s) adicional(es) a', pt: 'minuto(s) extra a', pl: 'dodatkowych min po', ru: 'доп. минут по' },
  overageEnd:      { en: '/min. SignalBoost will open a billing session before rendering.', es: '/min. SignalBoost abrira una sesion de facturacion.', pt: '/min. SignalBoost abrira uma sessao de faturamento.', pl: '/min. SignalBoost otworzy sesje rozliczeniowa.', ru: '/мин. SignalBoost откроет сеанс оплаты.' },
  templates:       { en: 'Templates', es: 'Plantillas', pt: 'Templates', pl: 'Szablony', ru: 'Шаблоны' },
  templatesHint:   { en: 'Canva-style starting points', es: 'Puntos de partida estilo Canva', pt: 'Pontos de partida estilo Canva', pl: 'Punkty startowe w stylu Canva', ru: 'Стартовые точки в стиле Canva' },
  descSignal:      { en: 'Gold business captions.', es: 'Subtitulos dorados para negocios.', pt: 'Legendas douradas para negocios.', pl: 'Zlote napisy dla biznesu.', ru: 'Золотые бизнес-субтитры.' },
  descTiktok:      { en: 'Large white pop captions.', es: 'Subtitulos pop grandes y blancos.', pt: 'Legendas pop grandes e brancas.', pl: 'Duze biale napisy pop.', ru: 'Большие белые поп-субтитры.' },
  descHormozi:     { en: 'High-contrast yellow captions.', es: 'Subtitulos amarillos de alto contraste.', pt: 'Legendas amarelas de alto contraste.', pl: 'Zolte napisy o wysokim kontrascie.', ru: 'Желтые субтитры с высоким контрастом.' },
  descMinimal:     { en: 'Clean lower-third captions.', es: 'Subtitulos de tercio inferior limpio.', pt: 'Legendas de tercio inferior limpo.', pl: 'Czyste napisy w dolnej trzeciej.', ru: 'Чистые субтитры в нижней трети.' },
  captionTimeline: { en: 'Caption timeline', es: 'Linea de tiempo', pt: 'Linha do tempo', pl: 'Os czasu napisow', ru: 'Временная шкала' },
  cues:            { en: 'cues', es: 'senales', pt: 'indicacoes', pl: 'wskazowki', ru: 'реплик' },
  editCaption:     { en: 'Edit selected caption', es: 'Editar subtitulo', pt: 'Editar legenda', pl: 'Edytuj napis', ru: 'Редактировать субтитр' },
  noCaptions:      { en: 'Generate AI captions or upload SRT/VTT to populate the timeline.', es: 'Genera subtitulos IA o sube SRT/VTT para poblar la linea de tiempo.', pt: 'Gere legendas IA ou faca upload de SRT/VTT.', pl: 'Wygeneruj napisy AI lub przeslij SRT/VTT.', ru: 'Создайте AI-субтитры или загрузите SRT/VTT.' },
  captionStyle:    { en: 'Caption style', es: 'Estilo de subtitulos', pt: 'Estilo de legendas', pl: 'Styl napisow', ru: 'Стиль субтитров' },
  format:          { en: 'Format', es: 'Formato', pt: 'Formato', pl: 'Format', ru: 'Формат' },
  fontFamily:      { en: 'Font family', es: 'Familia tipografica', pt: 'Familia de fonte', pl: 'Rodzina czcionek', ru: 'Семейство шрифтов' },
  fontSize:        { en: 'Size', es: 'Tamano', pt: 'Tamanho', pl: 'Rozmiar', ru: 'Размер' },
  textColor:       { en: 'Text color', es: 'Color del texto', pt: 'Cor do texto', pl: 'Kolor tekstu', ru: 'Цвет текста' },
  animation:       { en: 'Animation', es: 'Animacion', pt: 'Animacao', pl: 'Animacja', ru: 'Анимация' },
  background:      { en: 'Background', es: 'Fondo', pt: 'Fundo', pl: 'Tlo', ru: 'Фон' },
  animNone:        { en: 'None', es: 'Ninguna', pt: 'Nenhuma', pl: 'Brak', ru: 'Нет' },
  animFade:        { en: 'Fade', es: 'Desvanecimiento', pt: 'Fade', pl: 'Zanikanie', ru: 'Затухание' },
  animSlide:       { en: 'Slide', es: 'Deslizamiento', pt: 'Deslizamiento', pl: 'Przesuniecie', ru: 'Слайд' },
  animPop:         { en: 'Pop', es: 'Pop', pt: 'Pop', pl: 'Pop', ru: 'Поп' },
  canvasEditor:    { en: 'Canvas editor', es: 'Editor de lienzo', pt: 'Editor de canvas', pl: 'Edytor canvas', ru: 'Редактор холста' },
  uploadPrompt:    { en: 'Upload a source video to start editing', es: 'Sube un video para empezar', pt: 'Faca upload para comecar', pl: 'Przeslij wideo aby edytowac', ru: 'Загрузите видео для редактирования' },
  playing:         { en: 'Playing', es: 'Reproduciendo', pt: 'Reproduzindo', pl: 'Odtwarzanie', ru: 'Воспроизведение' },
  play:            { en: 'Play', es: 'Reproducir', pt: 'Reproduzir', pl: 'Odtwórz', ru: 'Играть' },
  pause:           { en: 'Pause', es: 'Pausar', pt: 'Pausar', pl: 'Pauza', ru: 'Пауза' },
  prevFrame:       { en: '- frame', es: '- fotograma', pt: '- quadro', pl: '- klatka', ru: '- кадр' },
  nextFrame:       { en: '+ frame', es: '+ fotograma', pt: '+ quadro', pl: '+ klatka', ru: '+ кадр' },
  restart:         { en: 'Restart', es: 'Reiniciar', pt: 'Reiniciar', pl: 'Uruchom ponownie', ru: 'Перезапуск' },
  reset:           { en: 'Reset', es: 'Restablecer', pt: 'Redefinir', pl: 'Resetuj', ru: 'Сбросить' },
  exportPanel:     { en: 'Export panel', es: 'Panel de exportacion', pt: 'Painel de exportacao', pl: 'Panel eksportu', ru: 'Панель экспорта' },
  exportNote:      { en: 'Click export then let the video play all the way through. Your browser records the canvas and produces a downloadable .webm file. No server required.', es: 'Haz clic en exportar y deja que el video se reproduzca. Tu navegador graba el canvas y produce un .webm.', pt: 'Clique em exportar e deixe o video reproduzir. Seu navegador grava o canvas e produz um .webm.', pl: 'Kliknij eksport i pozwol wideo sie odtworzyc. Przegladarka nagra canvas i stworzy plik .webm.', ru: 'Нажмите экспорт и дайте видео воспроизвестись. Браузер запишет холст и создаст .webm.' },
  exportBtn:       { en: 'Export captioned video', es: 'Exportar video con subtitulos', pt: 'Exportar video com legendas', pl: 'Eksportuj wideo z napisami', ru: 'Экспорт видео с субтитрами' },
  recording:       { en: 'Recording - let video play through...', es: 'Grabando - deja que el video se reproduzca...', pt: 'Gravando - deixe o video reproduzir...', pl: 'Nagrywanie - pozwol odtworzyc wideo...', ru: 'Запись - дайте видео воспроизвестись...' },
  downloadBtn:     { en: 'Download captioned video (.webm)', es: 'Descargar video con subtitulos (.webm)', pt: 'Baixar video com legendas (.webm)', pl: 'Pobierz wideo z napisami (.webm)', ru: 'Скачать видео с субтитрами (.webm)' },
  webmNote:        { en: '.webm plays in Chrome, Edge, Firefox. Convert to MP4 with HandBrake or cloudconvert.com.', es: '.webm funciona en Chrome, Edge y Firefox. Convierte a MP4 con HandBrake o cloudconvert.com.', pt: '.webm funciona no Chrome, Edge e Firefox. Converta para MP4 com HandBrake ou cloudconvert.com.', pl: '.webm dziala w Chrome, Edge i Firefox. Konwertuj do MP4 za pomoca HandBrake lub cloudconvert.com.', ru: '.webm работает в Chrome, Edge, Firefox. Конвертируйте в MP4 через HandBrake или cloudconvert.com.' },
  videoInput:      { en: 'Video', es: 'Video', pt: 'Video', pl: 'Wideo', ru: 'Видео' },
  aiCaptions:      { en: 'AI captions', es: 'Subtitulos IA', pt: 'Legendas IA', pl: 'Napisy AI', ru: 'AI-субтитры' },
  srtVtt:          { en: 'Optional SRT/VTT', es: 'SRT/VTT opcional', pt: 'SRT/VTT opcional', pl: 'Opcjonalny SRT/VTT', ru: 'Необязательный SRT/VTT' },
  tierLabel:       { en: 'Tier', es: 'Plan', pt: 'Plano', pl: 'Plan', ru: 'Тариф' },
  localeLabel:     { en: 'Locale', es: 'Idioma', pt: 'Idioma', pl: 'Jezyk', ru: 'Язык' },
  genCaptions:     { en: 'Generate Captions', es: 'Generar subtitulos', pt: 'Gerar legendas', pl: 'Generuj napisy', ru: 'Создать субтитры' },
  transcribing:    { en: 'Transcribing...', es: 'Transcribiendo...', pt: 'Transcrevendo...', pl: 'Transkrybowanie...', ru: 'Транскрибирование...' },
  tierFree:        { en: 'Free/demo', es: 'Gratuito/demo', pt: 'Gratuito/demo', pl: 'Bezplatny/demo', ru: 'Бесплатный/демо' },
  storageLabel:    { en: 'Storage:', es: 'Almacenamiento:', pt: 'Armazenamento:', pl: 'Przechowywanie:', ru: 'Хранилище:' },
  captionsLabel:   { en: 'Captions:', es: 'Subtitulos:', pt: 'Legendas:', pl: 'Napisy:', ru: 'Субтитры:' },
  footerTime:      { en: 'Canvas time', es: 'Tiempo canvas', pt: 'Tempo canvas', pl: 'Czas canvas', ru: 'Время холста' },
  footerDuration:  { en: 'duration', es: 'duracion', pt: 'duracao', pl: 'czas trwania', ru: 'длительность' },
  footerCaptions:  { en: 'captions', es: 'subtitulos', pt: 'legendas', pl: 'napisy', ru: 'субтитров' },
  footerNote:      { en: 'exports record from canvas in real time.', es: 'las exportaciones se graban en tiempo real.', pt: 'exportacoes gravam em tempo real.', pl: 'eksporty nagrywane sa w czasie rzeczywistym.', ru: 'экспорты записываются в реальном времени.' },
}

function c(key: string, lang: string): string {
  return (COPY as any)[key]?.[lang as Lang] ?? (COPY as any)[key]?.en ?? key
}

const starterCaptions: CaptionCue[] = [
  { id: 'cue-1', start: 0, end: 2.8, text: 'Upload a video, then click Generate Captions to create synced AI captions.' },
  { id: 'cue-2', start: 3, end: 6, text: 'Drag the caption on the canvas, style it, then export your video.' },
]

const captionPresets: CaptionPreset[] = [
  { id: 'signal',  label: 'SignalBoost', descKey: 'descSignal',  style: defaultCaptionStyle },
  { id: 'tiktok',  label: 'TikTok bold', descKey: 'descTiktok',  style: { ...defaultCaptionStyle, fontFamily: 'Arial Black, Inter, sans-serif', fontSize: 48, color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.72)', animation: 'pop', x: 50, y: 76 } },
  { id: 'hormozi', label: 'Hormozi',      descKey: 'descHormozi', style: { ...defaultCaptionStyle, fontFamily: 'Impact, Inter, sans-serif', fontSize: 52, color: '#FFD700', backgroundColor: 'rgba(0,0,0,0.86)', animation: 'pop', x: 50, y: 70 } },
  { id: 'minimal', label: 'Minimal',      descKey: 'descMinimal', style: { ...defaultCaptionStyle, fontFamily: 'Inter, Arial, sans-serif', fontSize: 32, color: '#ffffff', backgroundColor: 'rgba(15,23,42,0.52)', animation: 'fade', x: 50, y: 84 } },
]

const aspectClasses: Record<AspectRatio, string> = { '9:16': 'aspect-[9/16] max-h-[72vh]', '1:1': 'aspect-square max-h-[72vh]', '16:9': 'aspect-video' }
const canvasSizes: Record<AspectRatio, { width: number; height: number }> = { '9:16': { width: 720, height: 1280 }, '1:1': { width: 1080, height: 1080 }, '16:9': { width: 1280, height: 720 } }

function activeCue(cues: CaptionCue[], time: number) { return cues.find((cu) => time >= cu.start && time <= cu.end) || null }
function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)) }
function formatTime(s: number) { const safe = Math.max(0, Number(s) || 0); const m = Math.floor(safe / 60); const sec = Math.floor(safe % 60); const t = Math.floor((safe - Math.floor(safe)) * 10); return `${m}:${String(sec).padStart(2, '0')}.${t}` }

function wrapCaption(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let cur = ''
  for (const w of words) { const next = cur ? `${cur} ${w}` : w; if (ctx.measureText(next).width <= maxWidth || !cur) cur = next; else { lines.push(cur); cur = w } }
  if (cur) lines.push(cur)
  return lines.slice(0, 4)
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const sr = Math.min(r, w / 2, h / 2)
  ctx.beginPath(); ctx.moveTo(x + sr, y); ctx.lineTo(x + w - sr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + sr)
  ctx.lineTo(x + w, y + h - sr); ctx.quadraticCurveTo(x + w, y + h, x + w - sr, y + h)
  ctx.lineTo(x + sr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - sr)
  ctx.lineTo(x, y + sr); ctx.quadraticCurveTo(x, y, x + sr, y); ctx.closePath()
}

function parseCaptionFile(text: string): CaptionCue[] {
  const parseTime = (s: string) => { const t = s.trim().replace(',', '.'); const p = t.split(':'); return p.length === 3 ? +p[0] * 3600 + +p[1] * 60 + +p[2] : 0 }
  const body = text.replace(/^WEBVTT[^\n]*\n?/, '').trim(); const cues: CaptionCue[] = []
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.trim().split('\n'); const ti = lines.findIndex(l => l.includes('-->'))
    if (ti < 0) continue
    const [a, b] = lines[ti].split('-->')
    const txt = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim()
    if (!txt) continue
    cues.push({ id: `cue-${cues.length + 1}`, start: parseTime(a), end: parseTime(b), text: txt })
  }
  return cues
}
function QuotaStatusBar({ quota, lang }: { quota: VideoQuota; lang: string }) {
  const pct = Math.min(100, Math.round((quota.usedMinutes / Math.max(1, quota.includedMinutes)) * 100))
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
      <div className="flex items-center justify-between text-sm"><span>{c('quotaLabel', lang)}</span><span>{quota.usedMinutes}/{quota.includedMinutes} min</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#FFD700]" style={{ width: `${pct}%` }} /></div>
      <p className="mt-2 text-xs text-white/55">{c('quotaNote', lang)}</p>
      {quota.demoOnly ? <p className="mt-2 text-sm text-amber-200">{c('demoOnly', lang)}</p> : null}
    </div>
  )
}

function BillingBanner({ quota, lang }: { quota: VideoQuota; lang: string }) {
  if (!quota.requiresOverageCharge) return null
  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      {c('overage', lang)} {quota.overageMinutes} {c('overageAt', lang)} ${quota.overageRateUsd.toFixed(2)}{c('overageEnd', lang)}
    </div>
  )
}

function PresetPicker({ activePreset, onPreset, lang }: { activePreset: string; onPreset: (p: CaptionPreset) => void; lang: string }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{c('templates', lang)}</h2><span className="text-xs text-white/50">{c('templatesHint', lang)}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {captionPresets.map((p) => (
          <button key={p.id} type="button" onClick={() => onPreset(p)} className={`rounded-2xl border p-4 text-left transition ${activePreset === p.id ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}>
            <span className="font-bold">{p.label}</span><span className="mt-1 block text-xs text-white/55">{c(p.descKey, lang)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function CaptionTimeline({ cues, currentTime, selectedCueId, onSeek, onSelect, onUpdateText, lang }: { cues: CaptionCue[]; currentTime: number; selectedCueId: string | null; onSeek: (s: number) => void; onSelect: (id: string) => void; onUpdateText: (id: string, text: string) => void; lang: string }) {
  const sel = cues.find((cu) => cu.id === selectedCueId) || activeCue(cues, currentTime) || cues[0]
  return (
    <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{c('captionTimeline', lang)}</h2><span className="text-xs text-white/50">{cues.length} {c('cues', lang)}</span></div>
      {sel ? (
        <label className="mt-4 block text-sm">{c('editCaption', lang)}
          <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-white/10 p-3" value={sel.text} onChange={(e) => onUpdateText(sel.id, e.target.value)} />
          <span className="mt-1 block font-mono text-xs text-[#FFD700]">{formatTime(sel.start)} → {formatTime(sel.end)}</span>
        </label>
      ) : null}
      <div className="mt-4 max-h-72 space-y-2 overflow-auto">
        {cues.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/55">{c('noCaptions', lang)}</p> : null}
        {cues.map((cu) => (
          <button key={cu.id} type="button" onClick={() => { onSelect(cu.id); onSeek(cu.start) }} className={`w-full rounded-2xl border p-3 text-left text-sm transition ${sel?.id === cu.id || (currentTime >= cu.start && currentTime <= cu.end) ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}>
            <span className="font-mono text-xs text-[#FFD700]">{formatTime(cu.start)} → {formatTime(cu.end)}</span><br />{cu.text}
          </button>
        ))}
      </div>
    </section>
  )
}

function StyleControls({ style, aspectRatio, onChange, onAspectRatio, lang }: { style: CaptionStyle; aspectRatio: AspectRatio; onChange: (s: CaptionStyle) => void; onAspectRatio: (r: AspectRatio) => void; lang: string }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{c('captionStyle', lang)}</h2><span className="text-xs text-white/50">x {style.x}% · y {style.y}%</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{c('format', lang)}<select className="mt-1 w-full rounded-xl border border-white/10 bg-black p-2" value={aspectRatio} onChange={(e) => onAspectRatio(e.target.value as AspectRatio)}><option value="9:16">9:16 Shorts/Reels/TikTok</option><option value="1:1">1:1 Square</option><option value="16:9">16:9 YouTube</option></select></label>
        <label className="text-sm">{c('fontFamily', lang)}<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 p-2" value={style.fontFamily} onChange={(e) => onChange({ ...style, fontFamily: e.target.value })} /></label>
        <label className="text-sm">{c('fontSize', lang)}: {style.fontSize}px<input type="range" min="18" max="84" value={style.fontSize} onChange={(e) => onChange({ ...style, fontSize: Number(e.target.value) })} className="mt-3 w-full" /></label>
        <label className="text-sm">{c('textColor', lang)}<input type="color" value={style.color} onChange={(e) => onChange({ ...style, color: e.target.value })} className="mt-1 block h-10 w-full rounded-xl" /></label>
        <label className="text-sm">{c('animation', lang)}<select className="mt-1 w-full rounded-xl border border-white/10 bg-black p-2" value={style.animation} onChange={(e) => onChange({ ...style, animation: e.target.value as CaptionStyle['animation'] })}><option value="none">{c('animNone', lang)}</option><option value="fade">{c('animFade', lang)}</option><option value="slide">{c('animSlide', lang)}</option><option value="pop">{c('animPop', lang)}</option></select></label>
        <label className="text-sm">{c('background', lang)}<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 p-2" value={style.backgroundColor} onChange={(e) => onChange({ ...style, backgroundColor: e.target.value })} /></label>
      </div>
    </section>
  )
}

const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>(
  ({ videoUrl, cues, style, aspectRatio, seekTime, durationSec, lang, onStyleChange, onTime, onDuration }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [time, setTime] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [dragging, setDragging] = useState(false)
    const durationRef = useRef(durationSec)
    const lastReportedRef = useRef(-1)
    useEffect(() => { durationRef.current = durationSec }, [durationSec])
    const cue = activeCue(cues, time)
    const size = canvasSizes[aspectRatio]

    useEffect(() => {
      const video = videoRef.current
      if (!video) return
      if (Math.abs(seekTime - lastReportedRef.current) < 0.001) return
      if (Math.abs(video.currentTime - seekTime) > 0.08) {
        video.currentTime = seekTime; setTime(seekTime)
      }
    }, [seekTime])

    useEffect(() => {
      let frame = 0
      const draw = () => {
        const canvas = canvasRef.current; const video = videoRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, canvas.width, canvas.height)
            if (video && video.readyState >= 2) {
              const vr = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9
              const cr = canvas.width / canvas.height
              let dw = canvas.width; let dh = canvas.height; let ox = 0; let oy = 0
              if (vr > cr) { dh = canvas.height; dw = dh * vr; ox = (canvas.width - dw) / 2 } else { dw = canvas.width; dh = dw / vr; oy = (canvas.height - dh) / 2 }
              ctx.drawImage(video, ox, oy, dw, dh)
            } else {
              ctx.fillStyle = 'rgba(255,255,255,.08)'; drawRoundRect(ctx, canvas.width * 0.12, canvas.height * 0.42, canvas.width * 0.76, canvas.height * 0.16, 28); ctx.fill()
              ctx.fillStyle = 'rgba(255,255,255,.68)'; ctx.font = `700 ${Math.max(22, canvas.width * 0.035)}px Inter, Arial, sans-serif`; ctx.textAlign = 'center'
              ctx.fillText(c('uploadPrompt', lang), canvas.width / 2, canvas.height / 2)
            }
            if (cue) {
              const ao = style.animation === 'slide' ? Math.max(0, 1 - ((time - cue.start) / 0.2)) * (canvas.height * 0.05) : 0
              const sc = style.animation === 'pop' ? 1 + Math.max(0, 1 - ((time - cue.start) / 0.18)) * 0.08 : 1
              const fs = style.fontSize * sc * (canvas.width / 1280)
              ctx.save()
              ctx.globalAlpha = style.animation === 'fade' ? clamp(Math.min(time - cue.start, cue.end - time) / 0.18, 0.25, 1) : 1
              ctx.font = `800 ${fs}px ${style.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
              const cx = canvas.width * style.x / 100; const cy = (canvas.height * style.y / 100) + ao
              const lines = wrapCaption(ctx, cue.text, canvas.width * 0.82); const lh = fs * 1.18
              const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), fs * 2)
              const bw = Math.min(canvas.width - 48, tw + 48); const bh = (lines.length * lh) + 34
              ctx.fillStyle = style.backgroundColor; drawRoundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 22); ctx.fill()
              ctx.fillStyle = style.color; lines.forEach((l, i) => ctx.fillText(l, cx, cy + ((i - (lines.length - 1) / 2) * lh)))
              ctx.restore()
            }
          }
        }
        frame = requestAnimationFrame(draw)
      }
      frame = requestAnimationFrame(draw)
      return () => cancelAnimationFrame(frame)
    }, [cue, style, time, aspectRatio, lang])

    const setPos = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      onStyleChange({ ...style, x: Math.round(clamp(((e.clientX - r.left) / r.width) * 100, 8, 92)), y: Math.round(clamp(((e.clientY - r.top) / r.height) * 100, 8, 92)) })
    }, [onStyleChange, style])

    const seek = (s: number) => {
      const next = clamp(s, 0, Math.max(0, durationSec || videoRef.current?.duration || 0))
      if (videoRef.current) videoRef.current.currentTime = next
      lastReportedRef.current = next; setTime(next); onTime(next)
    }

    useImperativeHandle(ref, () => ({
      async startExport(): Promise<string> {
        const canvas = canvasRef.current; const video = videoRef.current
        if (!canvas || !video) throw new Error('Canvas or video not ready.')
        if (!('MediaRecorder' in window)) throw new Error('Video export requires Chrome, Edge, or Firefox. Safari is not yet supported.')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const canvasStream: MediaStream = (canvas as any).captureStream(30)
        const tracks = [...canvasStream.getVideoTracks()]
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const vStream: MediaStream = (video as any).captureStream()
          const at = vStream.getAudioTracks(); if (at.length) tracks.push(at[0])
        } catch {}
        const combined = new MediaStream(tracks)
        let mimeType = 'video/webm'
        try { if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mimeType = 'video/webm;codecs=vp9,opus' } catch {}
        const recorder = new MediaRecorder(combined, { mimeType })
        const chunks: BlobPart[] = []
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
        return new Promise<string>((resolve, reject) => {
          let timeout: ReturnType<typeof setTimeout> | null = null; let started = false
          recorder.onstop = () => { if (timeout) clearTimeout(timeout); resolve(URL.createObjectURL(new Blob(chunks, { type: mimeType }))) }
          const begin = () => {
            if (started) return; started = true; video.onseeked = null
            recorder.start(100); video.play().catch(reject)
            video.onended = () => recorder.stop()
            timeout = setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, (Math.max(10, durationRef.current) + 30) * 1000)
          }
          video.onseeked = begin; video.currentTime = 0
          if (video.readyState >= 3 && video.currentTime <= 0.01) begin()
        })
      }
    }))

    return (
      <section className="rounded-3xl border border-white/10 bg-black/50 p-5">
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{c('canvasEditor', lang)}</h2><span className="font-mono text-xs text-white/50">{formatTime(time)} · {aspectRatio}</span></div>
        <div className={`relative mx-auto mt-4 w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 ${aspectClasses[aspectRatio]}`}>
          {videoUrl ? <video ref={videoRef} src={videoUrl} className="hidden" playsInline crossOrigin="anonymous" onLoadedMetadata={(e) => onDuration(Math.round(e.currentTarget.duration || 0))} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onTimeUpdate={(e) => { const n = e.currentTarget.currentTime; lastReportedRef.current = n; setTime(n); onTime(n) }} /> : null}
          <canvas ref={canvasRef} width={size.width} height={size.height} onPointerDown={(e) => { setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); setPos(e) }} onPointerMove={(e) => dragging && setPos(e)} onPointerUp={(e) => { setDragging(false); e.currentTarget.releasePointerCapture(e.pointerId) }} className="h-full w-full cursor-move touch-none" aria-label="Video canvas with draggable caption overlay" />
        </div>
        <div className="mt-4 space-y-3">
          <input type="range" min="0" max={Math.max(1, durationSec)} step="0.05" value={Math.min(time, Math.max(1, durationSec))} disabled={!videoUrl} onChange={(e) => seek(Number(e.target.value))} className="w-full" />
          <div className="flex flex-wrap gap-3">
            <button className="rounded-full bg-[#FFD700] px-5 py-2 font-bold text-black disabled:opacity-50" disabled={!videoUrl} onClick={() => videoRef.current?.play()}>{isPlaying ? c('playing', lang) : c('play', lang)}</button>
            <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => videoRef.current?.pause()}>{c('pause', lang)}</button>
            <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(time - 0.1)}>{c('prevFrame', lang)}</button>
            <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(time + 0.1)}>{c('nextFrame', lang)}</button>
            <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(0)}>{c('restart', lang)}</button>
          </div>
        </div>
      </section>
    )
  }
)

CanvasEditor.displayName = 'CanvasEditor'

function ExportPanel({ canExport, hasSource, exportState, onExport, lang }: { canExport: boolean; hasSource: boolean; exportState: ExportState; onExport: () => void; lang: string }) {
  const isRecording = exportState.status === 'recording'
  const isDone = exportState.status === 'ready'
  return (
    <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
      <h2 className="text-xl font-bold">{c('exportPanel', lang)}</h2>
      <p className="mt-2 text-sm text-white/55">{c('exportNote', lang)}</p>
      <button onClick={onExport} disabled={!canExport || !hasSource || isRecording} className="mt-4 w-full rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black disabled:opacity-50">
        {isRecording ? c('recording', lang) : c('exportBtn', lang)}
      </button>
      {exportState.message ? <p className={`mt-3 text-sm ${exportState.status === 'failed' ? 'text-red-300' : 'text-white/70'}`}>{exportState.message}</p> : null}
      {isDone && exportState.url ? <a href={exportState.url} download="captioned-video.webm" className="mt-3 block rounded-full border border-[#FFD700] px-5 py-2 text-center font-bold text-[#FFD700]">{c('downloadBtn', lang)}</a> : null}
      <p className="mt-3 text-xs text-white/40">{c('webmNote', lang)}</p>
    </section>
  )
}
export default function VideoEditor() {
  const { lang } = useI18n()
  const canvasEditorRef = useRef<CanvasEditorHandle>(null)

  const [mounted, setMounted]             = useState(false)
  const [locale, setLocale]               = useState<SupportedVideoLocale>('en')
  const [tier, setTier]                   = useState('free')
  const [durationSec, setDurationSec]     = useState(0)
  const [videoUrl, setVideoUrl]           = useState<string | null>(null)
  const [storagePath, setStoragePath]     = useState<string | null>(null)
  const [transcriptId, setTranscriptId]   = useState<string | null>(null)
  const [cues, setCues]                   = useState(starterCaptions)
  const [style, setStyle]                 = useState(defaultCaptionStyle)
  const [aspectRatio, setAspectRatio]     = useState<AspectRatio>('9:16')
  const [activePreset, setActivePreset]   = useState('signal')
  const [selectedCueId, setSelectedCueId] = useState<string | null>(starterCaptions[0]?.id || null)
  const [currentTime, setCurrentTime]     = useState(0)
  const [uploadState, setUploadState]     = useState<UploadState>({ status: 'idle', message: 'Upload a source video to begin.' })
  const [captionState, setCaptionState]   = useState<CaptionGenerationState>({ status: 'idle', message: 'Generate AI captions after uploading a video, or upload SRT/VTT manually.' })
  const [exportState, setExportState]     = useState<ExportState>({ status: 'idle', message: '' })

  const quota = useMemo(() => calculateVideoQuota(tier, Math.ceil(Math.max(1, durationSec) / 60)), [tier, durationSec])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { const t = d?.tier || d?.plan || 'free'; setTier(t) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!transcriptId) return
    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(`/api/video/transcribe?id=${encodeURIComponent(transcriptId)}`)
        const json = await res.json()
        if (!json.ok) { setCaptionState({ status: 'failed', message: json.error || 'Transcription failed.' }); setTranscriptId(null); return }
        const { status, cues: newCues, cueCount } = json.data
        if (status === 'completed' && newCues) {
          setCues(newCues); setSelectedCueId(newCues[0]?.id || null); setCurrentTime(newCues[0]?.start || 0)
          setCaptionState({ status: 'ready', message: `${cueCount} AI captions ready.` }); setTranscriptId(null)
        }
      } catch {}
    }
    const timer = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [transcriptId])

  function resetAll() {
    setVideoUrl(null)
    setStoragePath(null)
    setTranscriptId(null)
    setCues(starterCaptions)
    setSelectedCueId(starterCaptions[0]?.id || null)
    setCurrentTime(0)
    setDurationSec(0)
    setUploadState({ status: 'idle', message: 'Upload a source video to begin.' })
    setCaptionState({ status: 'idle', message: 'Generate AI captions after uploading a video, or upload SRT/VTT manually.' })
    setExportState({ status: 'idle', message: '' })
  }

  async function uploadVideo(file: File) {
    setVideoUrl(URL.createObjectURL(file))
    setUploadState({ status: 'uploading', message: `Uploading ${file.name} to secure storage...` })
    setCaptionState({ status: 'idle', message: 'Video selected. Click Generate Captions after upload completes.' })
    try {
      const urlRes = await fetch('/api/video/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name }) })
      const urlJson = await urlRes.json()
      if (!urlJson.ok) { setUploadState({ status: 'failed', message: urlJson.error || 'Could not get upload URL.' }); return }
      const { path, token } = urlJson.data
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const putRes = await fetch(`${supabaseUrl}/storage/v1/object/upload/sign/video-uploads/${path}?token=${encodeURIComponent(token)}`, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'video/mp4' } })
      if (!putRes.ok) { setUploadState({ status: 'failed', message: `Storage upload failed (${putRes.status}). Check Supabase bucket permissions.` }); return }
      setStoragePath(path)
      setUploadState({ status: 'ready', message: `${file.name} stored - ready to generate captions.` })
    } catch (e) { setUploadState({ status: 'failed', message: e instanceof Error ? e.message : 'Upload failed.' }) }
  }

  async function generateCaptions() {
    if (!storagePath) { setCaptionState({ status: 'failed', message: 'Wait for the video upload to finish before generating captions.' }); return }
    setCaptionState({ status: 'generating', message: 'Submitting to AI transcription (30-90 seconds)...' })
    try {
      const res = await fetch('/api/video/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: storagePath }) })
      const json = await res.json()
      if (!json.ok) { setCaptionState({ status: 'failed', message: json.error || 'Caption generation failed.' }); return }
      setTranscriptId(json.data.transcriptId)
      setCaptionState({ status: 'generating', message: 'Transcribing... checking every 3 seconds.' })
    } catch (e) { setCaptionState({ status: 'failed', message: e instanceof Error ? e.message : 'Caption generation failed.' }) }
  }

  async function uploadCaptions(file: File) {
    try {
      const newCues = parseCaptionFile(await file.text())
      if (!newCues.length) { setCaptionState({ status: 'failed', message: 'Could not parse captions - verify the file is valid SRT or VTT.' }); return }
      setCues(newCues); setSelectedCueId(newCues[0]?.id || null); setCurrentTime(newCues[0]?.start || 0)
      setCaptionState({ status: 'ready', message: `${newCues.length} captions imported from ${file.name}.` })
    } catch { setCaptionState({ status: 'failed', message: 'Could not read captions file.' }) }
  }

  async function exportVideo() {
    if (!canvasEditorRef.current) return
    setExportState({ status: 'recording', message: 'Recording - let the video play all the way through. Do not close this tab.' })
    try {
      const url = await canvasEditorRef.current.startExport()
      setExportState({ status: 'ready', message: 'Done! Captions are burned in. Download your video below.', url })
    } catch (e) { setExportState({ status: 'failed', message: e instanceof Error ? e.message : 'Export failed.' }) }
  }

  const updateCueText = (id: string, text: string) => setCues((items) => items.map((cu) => cu.id === id ? { ...cu, text } : cu))

  if (!mounted) return <main className="min-h-screen bg-[#05070b]" />

  return (
    <main className="min-h-screen bg-[#05070b] p-6 text-white">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.20),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{c('eyebrow', lang)}</p>
        <h1 className="mt-4 text-4xl font-black">{c('heroTitle', lang)}</h1>
        <p className="mt-3 max-w-3xl text-white/70">{c('heroSubtitle', lang)}</p>
      </section>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_.35fr]"><QuotaStatusBar quota={quota} lang={lang} /><BillingBanner quota={quota} lang={lang} /></div>
      <section className="mt-6 grid gap-4 rounded-3xl border border-white/10 bg-white/[.03] p-5 md:grid-cols-5">
        <label className="text-sm">{c('videoInput', lang)}<input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])} className="mt-2 w-full" /></label>
        <div className="text-sm"><span>{c('aiCaptions', lang)}</span><button type="button" onClick={generateCaptions} disabled={!storagePath || captionState.status === 'generating'} className="mt-2 w-full rounded-xl bg-[#FFD700] px-4 py-2 font-bold text-black disabled:opacity-50">{captionState.status === 'generating' ? c('transcribing', lang) : c('genCaptions', lang)}</button></div>
        <label className="text-sm">{c('srtVtt', lang)}<input type="file" accept=".srt,.vtt,text/vtt" onChange={(e) => e.target.files?.[0] && uploadCaptions(e.target.files[0])} className="mt-2 w-full" /></label>
        <label className="text-sm">{c('tierLabel', lang)}<select className="mt-2 w-full rounded-xl bg-black p-2" value={tier} onChange={(e) => setTier(e.target.value)}><option value="free">{c('tierFree', lang)}</option><option value="launch">Launch</option><option value="growth">Growth</option><option value="command">Command</option></select></label>
        <label className="text-sm">{c('localeLabel', lang)}<select className="mt-2 w-full rounded-xl bg-black p-2" value={locale} onChange={(e) => setLocale(e.target.value as SupportedVideoLocale)}><option>en</option><option>es</option><option>pt</option><option>pl</option><option>ru</option></select></label>
        <p className="text-xs text-white/55 md:col-span-4">{c('storageLabel', lang)} {uploadState.message}<br />{c('captionsLabel', lang)} {captionState.message}</p>
        <div className="flex items-end md:col-span-1">
          <button type="button" onClick={resetAll} className="w-full rounded-xl border border-white/20 px-4 py-2 text-sm text-white/60 hover:border-white/40 hover:text-white/80 transition">↺ {c('reset', lang)}</button>
        </div>
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_.42fr]">
        <div className="space-y-6">
          <CanvasEditor ref={canvasEditorRef} videoUrl={videoUrl} cues={cues} style={style} aspectRatio={aspectRatio} seekTime={currentTime} durationSec={durationSec} lang={lang} onStyleChange={setStyle} onTime={setCurrentTime} onDuration={setDurationSec} />
          <StyleControls style={style} aspectRatio={aspectRatio} onChange={setStyle} onAspectRatio={setAspectRatio} lang={lang} />
          <PresetPicker activePreset={activePreset} onPreset={(p) => { setActivePreset(p.id); setStyle(p.style) }} lang={lang} />
        </div>
        <div className="space-y-6">
          <CaptionTimeline cues={cues} currentTime={currentTime} selectedCueId={selectedCueId} onSeek={setCurrentTime} onSelect={setSelectedCueId} onUpdateText={updateCueText} lang={lang} />
          <ExportPanel canExport={quota.exportEnabled} hasSource={Boolean(videoUrl)} exportState={exportState} onExport={exportVideo} lang={lang} />
        </div>
      </div>
      <footer className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-white/60">
        {c('footerTime', lang)} {currentTime.toFixed(2)}s · {c('footerDuration', lang)} {durationSec || 0}s · {cues.length} {c('footerCaptions', lang)} · {c('footerNote', lang)}
      </footer>
    </main>
  )
}
