'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { defaultCaptionStyle, type CaptionCue, type CaptionStyle, type SupportedVideoLocale, type VideoQuota } from '@/lib/video/types'
import { calculateVideoQuota } from '@/lib/video/subscription'
import { useTranslation } from '@/lib/i18n/useTranslation'

// ── Types ──────────────────────────────────────────────────────────────────────
type ExportState = { status: 'idle' | 'recording' | 'ready' | 'failed'; message: string; url?: string }
type UploadState = { status: 'idle' | 'uploading' | 'ready' | 'failed'; message: string }
type CaptionGenerationState = { status: 'idle' | 'generating' | 'ready' | 'failed'; message: string }
type AspectRatio = '9:16' | '1:1' | '16:9'
type CaptionPreset = { id: string; label: string; description: string; style: CaptionStyle }
type CanvasEditorHandle = { startExport: () => Promise<string> }
type CanvasEditorProps = {
  videoUrl: string | null; cues: CaptionCue[]; style: CaptionStyle; aspectRatio: AspectRatio
  seekTime: number; durationSec: number; onStyleChange: (s: CaptionStyle) => void
  onTime: (t: number) => void; onDuration: (s: number) => void
}

// ── Constants ──────────────────────────────────────────────────────────────────
const starterCaptions: CaptionCue[] = [
  { id: 'cue-1', start: 0, end: 2.8, text: 'Upload a video, then click Generate Captions to create synced AI captions.' },
  { id: 'cue-2', start: 3, end: 6, text: 'Drag the caption on the canvas, style it, then export your video.' },
]
const captionPresets: CaptionPreset[] = [
  { id: 'signal', label: 'SignalBoost', description: 'Gold business captions.', style: defaultCaptionStyle },
  { id: 'tiktok', label: 'TikTok bold', description: 'Large white pop captions.', style: { ...defaultCaptionStyle, fontFamily: 'Arial Black, Inter, sans-serif', fontSize: 48, color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.72)', animation: 'pop', x: 50, y: 76 } },
  { id: 'hormozi', label: 'Hormozi', description: 'High-contrast yellow captions.', style: { ...defaultCaptionStyle, fontFamily: 'Impact, Inter, sans-serif', fontSize: 52, color: '#FFD700', backgroundColor: 'rgba(0,0,0,0.86)', animation: 'pop', x: 50, y: 70 } },
  { id: 'minimal', label: 'Minimal', description: 'Clean lower-third captions.', style: { ...defaultCaptionStyle, fontFamily: 'Inter, Arial, sans-serif', fontSize: 32, color: '#ffffff', backgroundColor: 'rgba(15,23,42,0.52)', animation: 'fade', x: 50, y: 84 } },
]
const aspectClasses: Record<AspectRatio, string> = { '9:16': 'aspect-[9/16] max-h-[72vh]', '1:1': 'aspect-square max-h-[72vh]', '16:9': 'aspect-video' }
const canvasSizes: Record<AspectRatio, { width: number; height: number }> = { '9:16': { width: 720, height: 1280 }, '1:1': { width: 1080, height: 1080 }, '16:9': { width: 1280, height: 720 } }

// ── Helpers ────────────────────────────────────────────────────────────────────
// ── i18n ───────────────────────────────────────────────────────────────────────
// Native per-language copy, consistent with sibling dashboard pages (launchpad,
// builder). Each sub-component pulls `lang` from useTranslation() and resolves
// via vt(). No English-fallback gaps — every user-facing label is translated.
type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const VID_LANGS: Lang[] = ['en', 'es', 'pt', 'pl', 'ru']
function vt(map: Record<Lang, string>, lang: string): string {
  return map[(VID_LANGS as string[]).includes(lang) ? (lang as Lang) : 'en']
}
const VID = {
  captionTimeline: { en: 'Caption timeline', es: 'Línea de subtítulos', pt: 'Linha de legendas', pl: 'Oś czasu napisów', ru: 'Лента субтитров' },
  cues: { en: 'cues', es: 'subtítulos', pt: 'legendas', pl: 'napisy', ru: 'субтитры' },
  editSelected: { en: 'Edit selected caption', es: 'Editar subtítulo seleccionado', pt: 'Editar legenda selecionada', pl: 'Edytuj wybrany napis', ru: 'Редактировать выбранный субтитр' },
  emptyTimeline: { en: 'Generate AI captions or upload SRT/VTT to populate the timeline.', es: 'Genera subtítulos con IA o sube un SRT/VTT para llenar la línea de tiempo.', pt: 'Gere legendas com IA ou envie um SRT/VTT para preencher a linha do tempo.', pl: 'Wygeneruj napisy AI lub prześlij plik SRT/VTT, aby wypełnić oś czasu.', ru: 'Сгенерируйте субтитры с ИИ или загрузите SRT/VTT, чтобы заполнить ленту.' },
  captionStyle: { en: 'Caption style', es: 'Estilo de subtítulos', pt: 'Estilo das legendas', pl: 'Styl napisów', ru: 'Стиль субтитров' },
  format: { en: 'Format', es: 'Formato', pt: 'Formato', pl: 'Format', ru: 'Формат' },
  fontFamily: { en: 'Font family', es: 'Tipografía', pt: 'Fonte', pl: 'Czcionka', ru: 'Шрифт' },
  size: { en: 'Size', es: 'Tamaño', pt: 'Tamanho', pl: 'Rozmiar', ru: 'Размер' },
  textColor: { en: 'Text color', es: 'Color del texto', pt: 'Cor do texto', pl: 'Kolor tekstu', ru: 'Цвет текста' },
  animation: { en: 'Animation', es: 'Animación', pt: 'Animação', pl: 'Animacja', ru: 'Анимация' },
  animNone: { en: 'None', es: 'Ninguna', pt: 'Nenhuma', pl: 'Brak', ru: 'Нет' },
  animFade: { en: 'Fade', es: 'Desvanecer', pt: 'Esmaecer', pl: 'Zanikanie', ru: 'Затухание' },
  animSlide: { en: 'Slide', es: 'Deslizar', pt: 'Deslizar', pl: 'Wsuwanie', ru: 'Слайд' },
  animPop: { en: 'Pop', es: 'Aparecer', pt: 'Surgir', pl: 'Pop', ru: 'Поп' },
  background: { en: 'Background', es: 'Fondo', pt: 'Fundo', pl: 'Tło', ru: 'Фон' },
  canvasEditor: { en: 'Canvas editor', es: 'Editor de lienzo', pt: 'Editor de tela', pl: 'Edytor kanwy', ru: 'Редактор холста' },
  exportPanel: { en: 'Export panel', es: 'Panel de exportación', pt: 'Painel de exportação', pl: 'Panel eksportu', ru: 'Панель экспорта' },
  exportHelp: {
    en: 'Click export then let the video play all the way through. Your browser records the canvas with captions burned in and produces a downloadable .webm file. No server required.',
    es: 'Haz clic en exportar y deja que el video se reproduzca por completo. Tu navegador graba el lienzo con los subtítulos incrustados y genera un archivo .webm descargable. Sin servidor.',
    pt: 'Clique em exportar e deixe o vídeo reproduzir até o fim. Seu navegador grava a tela com as legendas embutidas e gera um arquivo .webm para download. Sem servidor.',
    pl: 'Kliknij eksport i pozwól, aby wideo odtworzyło się do końca. Przeglądarka nagra kanwę z wtopionymi napisami i utworzy plik .webm do pobrania. Bez serwera.',
    ru: 'Нажмите «Экспорт» и дайте видео доиграть до конца. Браузер запишет холст с вшитыми субтитрами и создаст файл .webm для скачивания. Без сервера.',
  },
  recording: { en: '● Recording — let video play through…', es: '● Grabando — deja que el video termine…', pt: '● Gravando — deixe o vídeo terminar…', pl: '● Nagrywanie — pozwól wideo dograć…', ru: '● Запись — дайте видео доиграть…' },
  exportBtn: { en: 'Export captioned video', es: 'Exportar video con subtítulos', pt: 'Exportar vídeo com legendas', pl: 'Eksportuj wideo z napisami', ru: 'Экспортировать видео с субтитрами' },
  downloadBtn: { en: '↓ Download captioned video (.webm)', es: '↓ Descargar video con subtítulos (.webm)', pt: '↓ Baixar vídeo com legendas (.webm)', pl: '↓ Pobierz wideo z napisami (.webm)', ru: '↓ Скачать видео с субтитрами (.webm)' },
  exportNote: {
    en: '.webm plays in Chrome, Edge, and Firefox. To convert to MP4, use HandBrake (free) or cloudconvert.com.',
    es: '.webm se reproduce en Chrome, Edge y Firefox. Para convertir a MP4, usa HandBrake (gratis) o cloudconvert.com.',
    pt: '.webm é reproduzido no Chrome, Edge e Firefox. Para converter para MP4, use o HandBrake (grátis) ou cloudconvert.com.',
    pl: '.webm działa w Chrome, Edge i Firefox. Aby przekonwertować na MP4, użyj HandBrake (darmowy) lub cloudconvert.com.',
    ru: '.webm воспроизводится в Chrome, Edge и Firefox. Для конвертации в MP4 используйте HandBrake (бесплатно) или cloudconvert.com.',
  },
  video: { en: 'Video', es: 'Video', pt: 'Vídeo', pl: 'Wideo', ru: 'Видео' },
  aiCaptions: { en: 'AI captions', es: 'Subtítulos con IA', pt: 'Legendas com IA', pl: 'Napisy AI', ru: 'Субтитры с ИИ' },
  transcribing: { en: 'Transcribing…', es: 'Transcribiendo…', pt: 'Transcrevendo…', pl: 'Transkrypcja…', ru: 'Расшифровка…' },
  generateCaptions: { en: 'Generate Captions', es: 'Generar subtítulos', pt: 'Gerar legendas', pl: 'Generuj napisy', ru: 'Создать субтитры' },
  optionalSrt: { en: 'Optional SRT/VTT', es: 'SRT/VTT opcional', pt: 'SRT/VTT opcional', pl: 'Opcjonalny SRT/VTT', ru: 'SRT/VTT (необязательно)' },
  tier: { en: 'Tier', es: 'Plan', pt: 'Plano', pl: 'Plan', ru: 'Тариф' },
  locale: { en: 'Locale', es: 'Idioma', pt: 'Idioma', pl: 'Język', ru: 'Язык' },

  // Status / toast messages ({n}, {file}, {code} are interpolated at the call site)
  stUploadBegin: { en: 'Upload a source video to begin.', es: 'Sube un video de origen para empezar.', pt: 'Envie um vídeo de origem para começar.', pl: 'Prześlij wideo źródłowe, aby rozpocząć.', ru: 'Загрузите исходное видео, чтобы начать.' },
  stCaptionIdle: { en: 'Generate AI captions after uploading a video, or upload SRT/VTT manually.', es: 'Genera subtítulos con IA tras subir un video, o sube un SRT/VTT manualmente.', pt: 'Gere legendas com IA após enviar um vídeo, ou envie um SRT/VTT manualmente.', pl: 'Wygeneruj napisy AI po przesłaniu wideo lub prześlij plik SRT/VTT ręcznie.', ru: 'Создайте субтитры с ИИ после загрузки видео или загрузите SRT/VTT вручную.' },
  stCaptionsReady: { en: '{n} AI captions ready.', es: '{n} subtítulos con IA listos.', pt: '{n} legendas com IA prontas.', pl: 'Gotowe napisy AI: {n}.', ru: 'Готово субтитров с ИИ: {n}.' },
  stUploading: { en: 'Uploading {file} to secure storage…', es: 'Subiendo {file} al almacenamiento seguro…', pt: 'Enviando {file} para o armazenamento seguro…', pl: 'Przesyłanie {file} do bezpiecznego magazynu…', ru: 'Загрузка {file} в защищённое хранилище…' },
  stVideoSelected: { en: 'Video selected. Click Generate Captions after upload completes.', es: 'Video seleccionado. Haz clic en Generar subtítulos cuando termine la subida.', pt: 'Vídeo selecionado. Clique em Gerar legendas após concluir o envio.', pl: 'Wybrano wideo. Kliknij Generuj napisy po zakończeniu przesyłania.', ru: 'Видео выбрано. Нажмите «Создать субтитры» после завершения загрузки.' },
  stUploadFailed: { en: 'Storage upload failed ({code}). Check Supabase bucket permissions.', es: 'Falló la subida al almacenamiento ({code}). Revisa los permisos del bucket de Supabase.', pt: 'Falha no envio ao armazenamento ({code}). Verifique as permissões do bucket do Supabase.', pl: 'Przesyłanie do magazynu nie powiodło się ({code}). Sprawdź uprawnienia bucketa Supabase.', ru: 'Не удалось загрузить в хранилище ({code}). Проверьте права доступа к бакету Supabase.' },
  stStored: { en: '{file} stored — ready to generate captions.', es: '{file} almacenado — listo para generar subtítulos.', pt: '{file} armazenado — pronto para gerar legendas.', pl: 'Zapisano {file} — gotowe do generowania napisów.', ru: '{file} сохранён — можно создавать субтитры.' },
  stWaitUpload: { en: 'Wait for the video upload to finish before generating captions.', es: 'Espera a que termine la subida del video antes de generar subtítulos.', pt: 'Aguarde o envio do vídeo terminar antes de gerar legendas.', pl: 'Poczekaj na zakończenie przesyłania wideo przed wygenerowaniem napisów.', ru: 'Дождитесь окончания загрузки видео перед созданием субтитров.' },
  stSubmitting: { en: 'Submitting to AI transcription (30–90 seconds)…', es: 'Enviando a transcripción con IA (30–90 segundos)…', pt: 'Enviando para transcrição com IA (30–90 segundos)…', pl: 'Wysyłanie do transkrypcji AI (30–90 sekund)…', ru: 'Отправка на ИИ-расшифровку (30–90 секунд)…' },
  stTranscribingPoll: { en: 'Transcribing… checking every 3 seconds.', es: 'Transcribiendo… comprobando cada 3 segundos.', pt: 'Transcrevendo… verificando a cada 3 segundos.', pl: 'Transkrypcja… sprawdzanie co 3 sekundy.', ru: 'Расшифровка… проверка каждые 3 секунды.' },
  stParseFailed: { en: 'Could not parse captions — verify the file is valid SRT or VTT.', es: 'No se pudieron procesar los subtítulos — verifica que el archivo sea SRT o VTT válido.', pt: 'Não foi possível processar as legendas — verifique se o arquivo é SRT ou VTT válido.', pl: 'Nie udało się przetworzyć napisów — sprawdź, czy plik to prawidłowy SRT lub VTT.', ru: 'Не удалось разобрать субтитры — проверьте, что файл — корректный SRT или VTT.' },
  stImported: { en: '{n} captions imported from {file}.', es: '{n} subtítulos importados de {file}.', pt: '{n} legendas importadas de {file}.', pl: 'Zaimportowano {n} napisów z {file}.', ru: 'Импортировано субтитров: {n} из {file}.' },
  stReadFailed: { en: 'Could not read captions file.', es: 'No se pudo leer el archivo de subtítulos.', pt: 'Não foi possível ler o arquivo de legendas.', pl: 'Nie udało się odczytać pliku napisów.', ru: 'Не удалось прочитать файл субтитров.' },
  stRecording: { en: 'Recording — let the video play all the way through. Do not close this tab.', es: 'Grabando — deja que el video se reproduzca por completo. No cierres esta pestaña.', pt: 'Gravando — deixe o vídeo reproduzir até o fim. Não feche esta aba.', pl: 'Nagrywanie — pozwól wideo odtworzyć się do końca. Nie zamykaj tej karty.', ru: 'Запись — дайте видео доиграть до конца. Не закрывайте эту вкладку.' },
  stExportDone: { en: 'Done! Captions are burned in. Download your video below.', es: '¡Listo! Los subtítulos están incrustados. Descarga tu video abajo.', pt: 'Pronto! As legendas estão embutidas. Baixe seu vídeo abaixo.', pl: 'Gotowe! Napisy są wtopione. Pobierz wideo poniżej.', ru: 'Готово! Субтитры вшиты. Скачайте видео ниже.' },

  // Canvas-drawn prompt + user-facing export errors
  canvasPrompt: { en: 'Upload a source video to start editing', es: 'Sube un video de origen para empezar a editar', pt: 'Envie um vídeo de origem para começar a editar', pl: 'Prześlij wideo źródłowe, aby rozpocząć edycję', ru: 'Загрузите исходное видео, чтобы начать редактирование' },
  errCanvasNotReady: { en: 'Canvas or video not ready.', es: 'El lienzo o el video no están listos.', pt: 'A tela ou o vídeo não estão prontos.', pl: 'Kanwa lub wideo nie są gotowe.', ru: 'Холст или видео не готовы.' },
  errSafari: { en: 'Video export requires Chrome, Edge, or Firefox. Safari is not yet supported.', es: 'La exportación de video requiere Chrome, Edge o Firefox. Safari aún no es compatible.', pt: 'A exportação de vídeo requer Chrome, Edge ou Firefox. O Safari ainda não é compatível.', pl: 'Eksport wideo wymaga Chrome, Edge lub Firefox. Safari nie jest jeszcze obsługiwane.', ru: 'Экспорт видео требует Chrome, Edge или Firefox. Safari пока не поддерживается.' },

  // Quota + billing panels
  quota: { en: 'Quota', es: 'Cuota', pt: 'Cota', pl: 'Limit', ru: 'Квота' },
  min: { en: 'min', es: 'min', pt: 'min', pl: 'min', ru: 'мин' },
  quotaInfo: { en: 'Exports record live in your browser — no server required. Export time equals video duration.', es: 'Las exportaciones se graban en vivo en tu navegador — sin servidor. El tiempo de exportación equivale a la duración del video.', pt: 'As exportações são gravadas ao vivo no seu navegador — sem servidor. O tempo de exportação é igual à duração do vídeo.', pl: 'Eksporty są nagrywane na żywo w przeglądarce — bez serwera. Czas eksportu równa się długości wideo.', ru: 'Экспорт записывается вживую в браузере — без сервера. Время экспорта равно длительности видео.' },
  demoOnly: { en: 'Free/demo users get preview playback only. Upgrade to export final videos.', es: 'Los usuarios gratuitos/demo solo obtienen reproducción de vista previa. Mejora tu plan para exportar videos finales.', pt: 'Usuários gratuitos/demo têm apenas reprodução de pré-visualização. Faça upgrade para exportar vídeos finais.', pl: 'Użytkownicy darmowi/demo mają tylko podgląd. Przejdź na wyższy plan, aby eksportować gotowe wideo.', ru: 'Бесплатные/демо пользователи получают только предпросмотр. Перейдите на платный план для экспорта финальных видео.' },
  overage: { en: 'Overage: {n} extra minute(s) at ${rate}/min. SignalBoost will open a {provider} billing session before rendering.', es: 'Excedente: {n} minuto(s) extra a ${rate}/min. SignalBoost abrirá una sesión de pago con {provider} antes de renderizar.', pt: 'Excedente: {n} minuto(s) extra a ${rate}/min. O SignalBoost abrirá uma sessão de pagamento com {provider} antes de renderizar.', pl: 'Przekroczenie: {n} dodatkowych minut po ${rate}/min. SignalBoost otworzy sesję płatności {provider} przed renderowaniem.', ru: 'Превышение: {n} доп. минут(ы) по ${rate}/мин. SignalBoost откроет сессию оплаты {provider} перед рендерингом.' },

  // Preset picker
  templates: { en: 'Templates', es: 'Plantillas', pt: 'Modelos', pl: 'Szablony', ru: 'Шаблоны' },
  presetTagline: { en: 'Canva-style starting points', es: 'Puntos de partida estilo Canva', pt: 'Pontos de partida estilo Canva', pl: 'Punkty startowe w stylu Canva', ru: 'Заготовки в стиле Canva' },
  presetSignal: { en: 'Gold business captions.', es: 'Subtítulos dorados para negocios.', pt: 'Legendas douradas para negócios.', pl: 'Złote napisy biznesowe.', ru: 'Золотые деловые субтитры.' },
  presetTiktok: { en: 'Large white pop captions.', es: 'Grandes subtítulos blancos pop.', pt: 'Grandes legendas brancas pop.', pl: 'Duże białe napisy pop.', ru: 'Крупные белые поп-субтитры.' },
  presetHormozi: { en: 'High-contrast yellow captions.', es: 'Subtítulos amarillos de alto contraste.', pt: 'Legendas amarelas de alto contraste.', pl: 'Żółte napisy o wysokim kontraście.', ru: 'Жёлтые субтитры высокой контрастности.' },
  presetMinimal: { en: 'Clean lower-third captions.', es: 'Subtítulos limpios en el tercio inferior.', pt: 'Legendas limpas no terço inferior.', pl: 'Czyste napisy w dolnej tercji.', ru: 'Аккуратные субтитры в нижней трети.' },
  footerStatus: {
    en: 'Canvas time {t}s · duration {d}s · {n} captions · exports record from canvas in real time.',
    es: 'Tiempo del lienzo {t}s · duración {d}s · {n} subtítulos · las exportaciones se graban del lienzo en tiempo real.',
    pt: 'Tempo da tela {t}s · duração {d}s · {n} legendas · as exportações são gravadas da tela em tempo real.',
    pl: 'Czas kanwy {t}s · długość {d}s · {n} napisów · eksporty są nagrywane z kanwy w czasie rzeczywistym.',
    ru: 'Время холста {t}с · длительность {d}с · субтитров: {n} · экспорт записывается с холста в реальном времени.',
  },
} as const

// Preset id → description key in VID (labels stay as brand names).
const PRESET_DESC: Record<string, keyof typeof VID> = {
  signal: 'presetSignal', tiktok: 'presetTiktok', hormozi: 'presetHormozi', minimal: 'presetMinimal',
}

function activeCue(cues: CaptionCue[], time: number) { return cues.find((c) => time >= c.start && time <= c.end) || null }
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

/** Parse SRT or VTT caption files entirely in the browser — no server call needed. */
function parseCaptionFile(text: string): CaptionCue[] {
  const parseTime = (s: string) => { const t = s.trim().replace(',', '.'); const p = t.split(':'); return p.length === 3 ? +p[0] * 3600 + +p[1] * 60 + +p[2] : 0 }
  const body = text.replace(/^WEBVTT[^\n]*\n?/, '').trim()
  const cues: CaptionCue[] = []
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.trim().split('\n')
    const ti = lines.findIndex(l => l.includes('-->'))
    if (ti < 0) continue
    const [a, b] = lines[ti].split('-->')
    const txt = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim()
    if (!txt) continue
    cues.push({ id: `cue-${cues.length + 1}`, start: parseTime(a), end: parseTime(b), text: txt })
  }
  return cues
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function QuotaStatusBar({ quota }: { quota: VideoQuota }) {
  const { lang } = useTranslation()
  const pct = Math.min(100, Math.round((quota.usedMinutes / Math.max(1, quota.includedMinutes)) * 100))
  return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
    <div className="flex items-center justify-between text-sm"><span>{vt(VID.quota, lang)}</span><span>{quota.usedMinutes}/{quota.includedMinutes} {vt(VID.min, lang)}</span></div>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#FFD700]" style={{ width: `${pct}%` }} /></div>
    <p className="mt-2 text-xs text-white/55">{vt(VID.quotaInfo, lang)}</p>
    {quota.demoOnly ? <p className="mt-2 text-sm text-amber-200">{vt(VID.demoOnly, lang)}</p> : null}
  </div>
}

function BillingBanner({ quota }: { quota: VideoQuota }) {
  const { lang } = useTranslation()
  if (!quota.requiresOverageCharge) return null
  return <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">{vt(VID.overage, lang).replace('{n}', String(quota.overageMinutes)).replace('{rate}', quota.overageRateUsd.toFixed(2)).replace('{provider}', String(quota.overageProvider))}</div>
}

function PresetPicker({ activePreset, onPreset }: { activePreset: string; onPreset: (p: CaptionPreset) => void }) {
  const { lang } = useTranslation()
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{vt(VID.templates, lang)}</h2><span className="text-xs text-white/50">{vt(VID.presetTagline, lang)}</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {captionPresets.map((p) => <button key={p.id} type="button" onClick={() => onPreset(p)} className={`rounded-2xl border p-4 text-left transition ${activePreset === p.id ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}>
        <span className="font-bold">{p.label}</span><span className="mt-1 block text-xs text-white/55">{PRESET_DESC[p.id] ? vt(VID[PRESET_DESC[p.id]], lang) : p.description}</span>
      </button>)}
    </div>
  </section>
}

function CaptionTimeline({ cues, currentTime, selectedCueId, onSeek, onSelect, onUpdateText }: { cues: CaptionCue[]; currentTime: number; selectedCueId: string | null; onSeek: (s: number) => void; onSelect: (id: string) => void; onUpdateText: (id: string, text: string) => void }) {
  const sel = cues.find((c) => c.id === selectedCueId) || activeCue(cues, currentTime) || cues[0]
  const { lang } = useTranslation()
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{vt(VID.captionTimeline, lang)}</h2><span className="text-xs text-white/50">{cues.length} {vt(VID.cues, lang)}</span></div>
    {sel ? <label className="mt-4 block text-sm">{vt(VID.editSelected, lang)}<textarea className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-white/10 p-3" value={sel.text} onChange={(e) => onUpdateText(sel.id, e.target.value)} /><span className="mt-1 block font-mono text-xs text-[#FFD700]">{formatTime(sel.start)} → {formatTime(sel.end)}</span></label> : null}
    <div className="mt-4 max-h-72 space-y-2 overflow-auto">
      {cues.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/55">{vt(VID.emptyTimeline, lang)}</p> : null}
      {cues.map((c) => <button key={c.id} type="button" onClick={() => { onSelect(c.id); onSeek(c.start) }} className={`w-full rounded-2xl border p-3 text-left text-sm transition ${sel?.id === c.id || (currentTime >= c.start && currentTime <= c.end) ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}><span className="font-mono text-xs text-[#FFD700]">{formatTime(c.start)} → {formatTime(c.end)}</span><br />{c.text}</button>)}
    </div>
  </section>
}

function StyleControls({ style, aspectRatio, onChange, onAspectRatio }: { style: CaptionStyle; aspectRatio: AspectRatio; onChange: (s: CaptionStyle) => void; onAspectRatio: (r: AspectRatio) => void }) {
  const { lang } = useTranslation()
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{vt(VID.captionStyle, lang)}</h2><span className="text-xs text-white/50">x {style.x}% · y {style.y}%</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">{vt(VID.format, lang)}<select className="mt-1 w-full rounded-xl border border-white/10 bg-black p-2" value={aspectRatio} onChange={(e) => onAspectRatio(e.target.value as AspectRatio)}><option value="9:16">9:16 Shorts/Reels/TikTok</option><option value="1:1">1:1 Square</option><option value="16:9">16:9 YouTube</option></select></label>
      <label className="text-sm">{vt(VID.fontFamily, lang)}<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 p-2" value={style.fontFamily} onChange={(e) => onChange({ ...style, fontFamily: e.target.value })} /></label>
      <label className="text-sm">{vt(VID.size, lang)}: {style.fontSize}px<input type="range" min="18" max="84" value={style.fontSize} onChange={(e) => onChange({ ...style, fontSize: Number(e.target.value) })} className="mt-3 w-full" /></label>
      <label className="text-sm">{vt(VID.textColor, lang)}<input type="color" value={style.color} onChange={(e) => onChange({ ...style, color: e.target.value })} className="mt-1 block h-10 w-full rounded-xl" /></label>
      <label className="text-sm">{vt(VID.animation, lang)}<select className="mt-1 w-full rounded-xl border border-white/10 bg-black p-2" value={style.animation} onChange={(e) => onChange({ ...style, animation: e.target.value as CaptionStyle['animation'] })}><option value="none">{vt(VID.animNone, lang)}</option><option value="fade">{vt(VID.animFade, lang)}</option><option value="slide">{vt(VID.animSlide, lang)}</option><option value="pop">{vt(VID.animPop, lang)}</option></select></label>
      <label className="text-sm">{vt(VID.background, lang)}<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 p-2" value={style.backgroundColor} onChange={(e) => onChange({ ...style, backgroundColor: e.target.value })} /></label>
    </div>
  </section>
}

const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>(
  ({ videoUrl, cues, style, aspectRatio, seekTime, durationSec, onStyleChange, onTime, onDuration }, ref) => {
    const { lang } = useTranslation()
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [time, setTime] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [dragging, setDragging] = useState(false)
    const durationRef = useRef(durationSec)
    useEffect(() => { durationRef.current = durationSec }, [durationSec])
    const cue = activeCue(cues, time)
    const size = canvasSizes[aspectRatio]

    useEffect(() => {
      if (videoRef.current && Math.abs(videoRef.current.currentTime - seekTime) > 0.08) {
        videoRef.current.currentTime = seekTime; setTime(seekTime)
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
              ctx.fillText(vt(VID.canvasPrompt, lang), canvas.width / 2, canvas.height / 2)
            }
            if (cue) {
              const ao = style.animation === 'slide' ? Math.max(0, 1 - ((time - cue.start) / 0.2)) * (canvas.height * 0.05) : 0
              const sc = style.animation === 'pop' ? 1 + Math.max(0, 1 - ((time - cue.start) / 0.18)) * 0.08 : 1
              const fs = style.fontSize * sc * (canvas.width / 1280)
              ctx.save()
              ctx.globalAlpha = style.animation === 'fade' ? clamp(Math.min(time - cue.start, cue.end - time) / 0.18, 0.25, 1) : 1
              ctx.font = `800 ${fs}px ${style.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
              const cx = canvas.width * style.x / 100; const cy = (canvas.height * style.y / 100) + ao
              const lines = wrapCaption(ctx, cue.text, canvas.width * 0.82)
              const lh = fs * 1.18
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
    }, [cue, style, time, aspectRatio])

    const setPos = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      onStyleChange({ ...style, x: Math.round(clamp(((e.clientX - r.left) / r.width) * 100, 8, 92)), y: Math.round(clamp(((e.clientY - r.top) / r.height) * 100, 8, 92)) })
    }, [onStyleChange, style])

    const seek = (s: number) => {
      const next = clamp(s, 0, Math.max(0, durationSec || videoRef.current?.duration || 0))
      if (videoRef.current) videoRef.current.currentTime = next; setTime(next); onTime(next)
    }

    useImperativeHandle(ref, () => ({
      async startExport(): Promise<string> {
        const canvas = canvasRef.current; const video = videoRef.current
        if (!canvas || !video) throw new Error(vt(VID.errCanvasNotReady, lang))
        if (!('MediaRecorder' in window)) throw new Error(vt(VID.errSafari, lang))
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
          let timeout: ReturnType<typeof setTimeout> | null = null
          let started = false
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

    return <section className="rounded-3xl border border-white/10 bg-black/50 p-5">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{vt(VID.canvasEditor, lang)}</h2><span className="font-mono text-xs text-white/50">{formatTime(time)} · {aspectRatio}</span></div>
      <div className={`relative mx-auto mt-4 w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 ${aspectClasses[aspectRatio]}`}>
        {videoUrl ? <video ref={videoRef} src={videoUrl} className="hidden" playsInline crossOrigin="anonymous" onLoadedMetadata={(e) => onDuration(Math.round(e.currentTarget.duration || 0))} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onTimeUpdate={(e) => { const n = e.currentTarget.currentTime; setTime(n); onTime(n) }} /> : null}
        <canvas ref={canvasRef} width={size.width} height={size.height} onPointerDown={(e) => { setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); setPos(e) }} onPointerMove={(e) => dragging && setPos(e)} onPointerUp={(e) => { setDragging(false); e.currentTarget.releasePointerCapture(e.pointerId) }} className="h-full w-full cursor-move touch-none" aria-label="Video canvas with draggable caption overlay" />
      </div>
      <div className="mt-4 space-y-3">
        <input type="range" min="0" max={Math.max(1, durationSec)} step="0.05" value={Math.min(time, Math.max(1, durationSec))} disabled={!videoUrl} onChange={(e) => seek(Number(e.target.value))} className="w-full" />
        <div className="flex flex-wrap gap-3">
          <button className="rounded-full bg-[#FFD700] px-5 py-2 font-bold text-black disabled:opacity-50" disabled={!videoUrl} onClick={() => videoRef.current?.play()}>{isPlaying ? 'Playing' : 'Play'}</button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => videoRef.current?.pause()}>Pause</button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(time - 0.1)}>− frame</button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(time + 0.1)}>+ frame</button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(0)}>Restart</button>
        </div>
      </div>
    </section>
  }
)

CanvasEditor.displayName = 'CanvasEditor'

// ── Export Panel ───────────────────────────────────────────────────────────────
function ExportPanel({ canExport, hasSource, exportState, onExport }: { canExport: boolean; hasSource: boolean; exportState: ExportState; onExport: () => void }) {
  const { lang } = useTranslation()
  const isRecording = exportState.status === 'recording'
  const isDone = exportState.status === 'ready'
  return <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
    <h2 className="text-xl font-bold">{vt(VID.exportPanel, lang)}</h2>
    <p className="mt-2 text-sm text-white/55">{vt(VID.exportHelp, lang)}</p>
    <button onClick={onExport} disabled={!canExport || !hasSource || isRecording} className="mt-4 w-full rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black disabled:opacity-50">
      {isRecording ? vt(VID.recording, lang) : vt(VID.exportBtn, lang)}
    </button>
    {exportState.message ? <p className={`mt-3 text-sm ${exportState.status === 'failed' ? 'text-red-300' : 'text-white/70'}`}>{exportState.message}</p> : null}
    {isDone && exportState.url ? <a href={exportState.url} download="captioned-video.webm" className="mt-3 block rounded-full border border-[#FFD700] px-5 py-2 text-center font-bold text-[#FFD700]">{vt(VID.downloadBtn, lang)}</a> : null}
    <p className="mt-3 text-xs text-white/40">{vt(VID.exportNote, lang)}</p>
  </section>
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function VideoEditor() {
  const { t, lang } = useTranslation()
  const canvasEditorRef = useRef<CanvasEditorHandle>(null)

  const [locale, setLocale] = useState<SupportedVideoLocale>('en')
  const [tier, setTier] = useState('free')
  const [durationSec, setDurationSec] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [transcriptId, setTranscriptId] = useState<string | null>(null)
  const [cues, setCues] = useState(starterCaptions)
  const [style, setStyle] = useState(defaultCaptionStyle)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16')
  const [activePreset, setActivePreset] = useState('signal')
  const [selectedCueId, setSelectedCueId] = useState<string | null>(starterCaptions[0]?.id || null)
  const [currentTime, setCurrentTime] = useState(0)
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', message: vt(VID.stUploadBegin, lang) })
  const [captionState, setCaptionState] = useState<CaptionGenerationState>({ status: 'idle', message: vt(VID.stCaptionIdle, lang) })
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle', message: '' })

  const quota = useMemo(() => calculateVideoQuota(tier, Math.ceil(Math.max(1, durationSec) / 60)), [tier, durationSec])

  // ── Poll AssemblyAI until transcription is complete ────────────────────────
  useEffect(() => {
    if (!transcriptId) return
    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(`/api/video/transcribe?id=${encodeURIComponent(transcriptId)}`)
        const json = await res.json()
        if (!json.ok) {
          setCaptionState({ status: 'failed', message: json.error || 'Transcription failed.' }); setTranscriptId(null); return
        }
        const { status, cues: newCues, cueCount } = json.data
        if (status === 'completed' && newCues) {
          setCues(newCues); setSelectedCueId(newCues[0]?.id || null); setCurrentTime(newCues[0]?.start || 0)
          setCaptionState({ status: 'ready', message: vt(VID.stCaptionsReady, lang).replace('{n}', String(cueCount)) }); setTranscriptId(null)
        }
        // else still processing — keep polling
      } catch { /* network hiccup — keep polling */ }
    }
    const timer = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [transcriptId])

  // ── Upload: get signed URL → PUT file directly to Supabase Storage ─────────
  async function uploadVideo(file: File) {
    setVideoUrl(URL.createObjectURL(file)) // local preview immediately, no wait
    setUploadState({ status: 'uploading', message: vt(VID.stUploading, lang).replace('{file}', file.name) })
    setCaptionState({ status: 'idle', message: vt(VID.stVideoSelected, lang) })
    try {
      const urlRes = await fetch('/api/video/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name }) })
      const urlJson = await urlRes.json()
      if (!urlJson.ok) { setUploadState({ status: 'failed', message: urlJson.error || 'Could not get upload URL.' }); return }
      const { path, token } = urlJson.data
      // PUT directly to Supabase Storage — bypasses Vercel's 4.5 MB body limit entirely
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const putRes = await fetch(`${supabaseUrl}/storage/v1/object/upload/sign/video-uploads/${path}?token=${encodeURIComponent(token)}`, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'video/mp4' } })
      if (!putRes.ok) { setUploadState({ status: 'failed', message: vt(VID.stUploadFailed, lang).replace('{code}', String(putRes.status)) }); return }
      setStoragePath(path)
      setUploadState({ status: 'ready', message: vt(VID.stStored, lang).replace('{file}', file.name) })
    } catch (e) {
      setUploadState({ status: 'failed', message: e instanceof Error ? e.message : 'Upload failed.' })
    }
  }

  // ── Submit video to AssemblyAI for transcription ───────────────────────────
  async function generateCaptions() {
    if (!storagePath) { setCaptionState({ status: 'failed', message: vt(VID.stWaitUpload, lang) }); return }
    setCaptionState({ status: 'generating', message: vt(VID.stSubmitting, lang) })
    try {
      const res = await fetch('/api/video/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: storagePath }) })
      const json = await res.json()
      if (!json.ok) { setCaptionState({ status: 'failed', message: json.error || 'Caption generation failed.' }); return }
      setTranscriptId(json.data.transcriptId)
      setCaptionState({ status: 'generating', message: vt(VID.stTranscribingPoll, lang) })
    } catch (e) {
      setCaptionState({ status: 'failed', message: e instanceof Error ? e.message : 'Caption generation failed.' })
    }
  }

  // ── Import SRT / VTT captions entirely in-browser (no server call) ─────────
  async function uploadCaptions(file: File) {
    try {
      const newCues = parseCaptionFile(await file.text())
      if (!newCues.length) { setCaptionState({ status: 'failed', message: vt(VID.stParseFailed, lang) }); return }
      setCues(newCues); setSelectedCueId(newCues[0]?.id || null); setCurrentTime(newCues[0]?.start || 0)
      setCaptionState({ status: 'ready', message: vt(VID.stImported, lang).replace('{n}', String(newCues.length)).replace('{file}', file.name) })
    } catch { setCaptionState({ status: 'failed', message: vt(VID.stReadFailed, lang) }) }
  }

  // ── Export: MediaRecorder records the live canvas → downloadable .webm ─────
  async function exportVideo() {
    if (!canvasEditorRef.current) return
    setExportState({ status: 'recording', message: vt(VID.stRecording, lang) })
    try {
      const url = await canvasEditorRef.current.startExport()
      setExportState({ status: 'ready', message: vt(VID.stExportDone, lang), url })
    } catch (e) {
      setExportState({ status: 'failed', message: e instanceof Error ? e.message : 'Export failed.' })
    }
  }

  const updateCueText = (id: string, text: string) => setCues((items) => items.map((c) => c.id === id ? { ...c, text } : c))

  return <main className="min-h-screen bg-[#05070b] p-6 text-white">
    <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.20),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
      <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('video.kicker', 'Video Studio')}</p>
      <h1 className="mt-4 text-4xl font-black">{t('video.title', 'AI caption video editor')}</h1>
      <p className="mt-3 max-w-3xl text-white/70">{t('video.subtitle', 'Upload a video, generate synced AI captions, drag styled overlays on canvas, and export a captioned video file.')}</p>
    </section>
    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_.35fr]"><QuotaStatusBar quota={quota} /><BillingBanner quota={quota} /></div>
    <section className="mt-6 grid gap-4 rounded-3xl border border-white/10 bg-white/[.03] p-5 md:grid-cols-5">
      <label className="text-sm">{vt(VID.video, lang)}<input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])} className="mt-2 w-full" /></label>
      <div className="text-sm"><span>{vt(VID.aiCaptions, lang)}</span><button type="button" onClick={generateCaptions} disabled={!storagePath || captionState.status === 'generating'} className="mt-2 w-full rounded-xl bg-[#FFD700] px-4 py-2 font-bold text-black disabled:opacity-50">{captionState.status === 'generating' ? vt(VID.transcribing, lang) : vt(VID.generateCaptions, lang)}</button></div>
      <label className="text-sm">{vt(VID.optionalSrt, lang)}<input type="file" accept=".srt,.vtt,text/vtt" onChange={(e) => e.target.files?.[0] && uploadCaptions(e.target.files[0])} className="mt-2 w-full" /></label>
      <label className="text-sm">{vt(VID.tier, lang)}<select className="mt-2 w-full rounded-xl bg-black p-2" value={tier} onChange={(e) => setTier(e.target.value)}><option value="free">Free/demo</option><option value="launch">Launch</option><option value="growth">Growth</option><option value="command">Command</option></select></label>
      <label className="text-sm">{vt(VID.locale, lang)}<select className="mt-2 w-full rounded-xl bg-black p-2" value={locale} onChange={(e) => setLocale(e.target.value as SupportedVideoLocale)}><option>en</option><option>es</option><option>pt</option><option>pl</option><option>ru</option></select></label>
      <p className="text-xs text-white/55 md:col-span-5">Storage: {uploadState.message}<br />Captions: {captionState.message}</p>
    </section>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_.42fr]">
      <div className="space-y-6">
        <CanvasEditor ref={canvasEditorRef} videoUrl={videoUrl} cues={cues} style={style} aspectRatio={aspectRatio} seekTime={currentTime} durationSec={durationSec} onStyleChange={setStyle} onTime={setCurrentTime} onDuration={setDurationSec} />
        <StyleControls style={style} aspectRatio={aspectRatio} onChange={setStyle} onAspectRatio={setAspectRatio} />
        <PresetPicker activePreset={activePreset} onPreset={(p) => { setActivePreset(p.id); setStyle(p.style) }} />
      </div>
      <div className="space-y-6">
        <CaptionTimeline cues={cues} currentTime={currentTime} selectedCueId={selectedCueId} onSeek={setCurrentTime} onSelect={setSelectedCueId} onUpdateText={updateCueText} />
        <ExportPanel canExport={quota.exportEnabled} hasSource={Boolean(videoUrl)} exportState={exportState} onExport={exportVideo} />
      </div>
    </div>
    <footer className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-white/60">{vt(VID.footerStatus, lang).replace('{t}', currentTime.toFixed(2)).replace('{d}', String(durationSec || 0)).replace('{n}', String(cues.length))}</footer>
  </main>
}
