'use client'

import { createClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type SupportedVideoLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type SubscriptionTier = 'free' | 'demo' | 'launch' | 'growth' | 'command' | 'paid'
type AspectRatio = '9:16' | '1:1' | '16:9'
type CaptionCue = { id: string; start: number; end: number; text: string }
type CaptionStyle = { fontFamily: string; color: string; backgroundColor: string; fontSize: number; animation: 'none' | 'fade' | 'slide' | 'pop'; x: number; y: number }
type VideoQuota = { tier: SubscriptionTier; usedMinutes: number; includedMinutes: number; overageMinutes: number; overageRateUsd: number; exportEnabled: boolean; demoOnly: boolean; requiresOverageCharge: boolean; overageProvider: 'stripe' | 'paypal' }
type JobState = { jobId: string; status: string; result_url?: string | null; error?: string | null }
type UploadState = { status: 'idle' | 'uploading' | 'ready' | 'failed'; message: string }
type CaptionGenerationState = { status: 'idle' | 'generating' | 'ready' | 'failed'; message: string }
type CaptionPreset = { id: string; label: string; description: string; style: CaptionStyle; aspectRatio?: AspectRatio }
type StorageObject = { bucket: string; path: string; signedUrl: string }

const COPY = {
  eyebrow:          { en: 'Video Studio', es: 'Video Studio', pt: 'Video Studio', pl: 'Video Studio', ru: 'Видео Студия' },
  heroTitle:        { en: 'Create social-ready videos with AI captions', es: 'Crea videos para redes con subtítulos IA', pt: 'Crie vídeos para redes com legendas IA', pl: 'Twórz gotowe filmy z napisami AI', ru: 'Видео для соцсетей с AI-субтитрами' },
  heroSubtitle:     { en: 'Upload a video, generate timestamped captions, choose a branded template, drag the overlay, and export a ready-to-post MP4.', es: 'Sube un video, genera subtítulos con timestamp, elige una plantilla, arrastra la superposición y exporta un MP4 listo.', pt: 'Faça upload de um vídeo, gere legendas com timestamp, escolha um template e exporte um MP4 pronto.', pl: 'Prześlij wideo, generuj napisy, wybierz szablon i eksportuj MP4 gotowy do publikacji.', ru: 'Загрузите видео, создайте субтитры, выберите шаблон и экспортируйте готовый MP4.' },
  step:             { en: 'Step', es: 'Paso', pt: 'Passo', pl: 'Krok', ru: 'Шаг' },
  stepUpload:       { en: 'Upload video', es: 'Subir video', pt: 'Fazer upload', pl: 'Prześlij wideo', ru: 'Загрузить видео' },
  stepCaptions:     { en: 'Generate captions', es: 'Generar subtítulos', pt: 'Gerar legendas', pl: 'Generuj napisy', ru: 'Создать субтитры' },
  stepStyle:        { en: 'Style template', es: 'Estilo de plantilla', pt: 'Estilo do template', pl: 'Styl szablonu', ru: 'Стиль шаблона' },
  stepExport:       { en: 'Export MP4', es: 'Exportar MP4', pt: 'Exportar MP4', pl: 'Eksportuj MP4', ru: 'Экспорт MP4' },
  videoUsage:       { en: 'Video usage', es: 'Uso de video', pt: 'Uso de vídeo', pl: 'Użycie wideo', ru: 'Использование видео' },
  quotaNote:        { en: 'AI captions and exports spend video credits. Preview/editing stays free.', es: 'Los subtítulos IA y exportaciones gastan créditos. La previsualización es gratuita.', pt: 'Legendas IA e exportações gastam créditos. Pré-visualização é gratuita.', pl: 'Napisy AI i eksporty zużywają kredyty. Podgląd jest bezpłatny.', ru: 'AI-субтитры и экспорт тратят кредиты. Предпросмотр бесплатен.' },
  demoNote:         { en: 'Free/demo users can preview the editor. Use credits for captions and exports.', es: 'Usuarios gratuitos pueden previsualizar el editor. Usa créditos para subtítulos y exportaciones.', pt: 'Usuários gratuitos podem pré-visualizar. Use créditos para legendas e exportações.', pl: 'Użytkownicy bezpłatni mogą przeglądać edytor. Użyj kredytów na napisy i eksporty.', ru: 'Бесплатные пользователи могут просматривать редактор. Используйте кредиты для субтитров.' },
  overageMsg:       { en: 'Overage detected:', es: 'Exceso detectado:', pt: 'Excesso detectado:', pl: 'Wykryto przekroczenie:', ru: 'Обнаружено превышение:' },
  overageAt:        { en: 'extra minute(s) at', es: 'minuto(s) adicional(es) a', pt: 'minuto(s) extra a', pl: 'dodatkowa(e) min po', ru: 'доп. минут по' },
  overageMin:       { en: '/min.', es: '/min.', pt: '/min.', pl: '/min.', ru: '/мин.' },
  overageCreate:    { en: 'SignalBoost should create a', es: 'SignalBoost debería crear un', pt: 'SignalBoost deve criar um', pl: 'SignalBoost powinien utworzyć', ru: 'SignalBoost должен создать' },
  overageEvent:     { en: 'billing event before rendering.', es: 'evento de facturación antes de renderizar.', pt: 'evento de faturamento antes de renderizar.', pl: 'zdarzenie rozliczeniowe przed renderowaniem.', ru: 'событие биллинга перед рендерингом.' },
  templates:        { en: 'Templates', es: 'Plantillas', pt: 'Templates', pl: 'Szablony', ru: 'Шаблоны' },
  templatesHint:    { en: 'Canva-style starting points', es: 'Puntos de partida estilo Canva', pt: 'Pontos de partida estilo Canva', pl: 'Punkty startowe w stylu Canva', ru: 'Стартовые точки в стиле Canva' },
  descSignal:       { en: 'Gold business captions.', es: 'Subtítulos dorados para negocios.', pt: 'Legendas douradas para negócios.', pl: 'Złote napisy dla biznesu.', ru: 'Золотые бизнес-субтитры.' },
  descTiktok:       { en: 'Large white pop captions.', es: 'Subtítulos pop grandes y blancos.', pt: 'Legendas pop grandes e brancas.', pl: 'Duże białe napisy pop.', ru: 'Большие белые поп-субтитры.' },
  descHormozi:      { en: 'High-contrast yellow captions.', es: 'Subtítulos amarillos de alto contraste.', pt: 'Legendas amarelas de alto contraste.', pl: 'Żółte napisy o wysokim kontraście.', ru: 'Жёлтые субтитры с высоким контрастом.' },
  descMinimal:      { en: 'Clean lower-third captions.', es: 'Subtítulos de tercio inferior limpio.', pt: 'Legendas de terço inferior limpo.', pl: 'Czyste napisy w dolnej trzeciej.', ru: 'Чистые субтитры в нижней трети.' },
  captionTimeline:  { en: 'Caption timeline', es: 'Línea de tiempo de subtítulos', pt: 'Linha do tempo de legendas', pl: 'Oś czasu napisów', ru: 'Временная шкала субтитров' },
  cues:             { en: 'cues', es: 'señales', pt: 'indicações', pl: 'wskazówki', ru: 'реплик' },
  editCaption:      { en: 'Edit selected caption', es: 'Editar subtítulo seleccionado', pt: 'Editar legenda selecionada', pl: 'Edytuj wybrany napis', ru: 'Редактировать субтитр' },
  noCaptionsTL:     { en: 'Generate AI captions or upload SRT/VTT captions to populate the timeline.', es: 'Genera subtítulos IA o sube SRT/VTT para poblar la línea de tiempo.', pt: 'Gere legendas IA ou faça upload de SRT/VTT para preencher a linha do tempo.', pl: 'Wygeneruj napisy AI lub prześlij SRT/VTT, aby wypełnić oś czasu.', ru: 'Создайте AI-субтитры или загрузите SRT/VTT для временной шкалы.' },
  captionStyle:     { en: 'Caption style', es: 'Estilo de subtítulos', pt: 'Estilo de legendas', pl: 'Styl napisów', ru: 'Стиль субтитров' },
  format:           { en: 'Format', es: 'Formato', pt: 'Formato', pl: 'Format', ru: 'Формат' },
  fontFamily:       { en: 'Font family', es: 'Familia tipográfica', pt: 'Família de fonte', pl: 'Rodzina czcionek', ru: 'Семейство шрифтов' },
  fontSize:         { en: 'Size', es: 'Tamaño', pt: 'Tamanho', pl: 'Rozmiar', ru: 'Размер' },
  textColor:        { en: 'Text color', es: 'Color del texto', pt: 'Cor do texto', pl: 'Kolor tekstu', ru: 'Цвет текста' },
  animation:        { en: 'Animation', es: 'Animación', pt: 'Animação', pl: 'Animacja', ru: 'Анимация' },
  background:       { en: 'Background', es: 'Fondo', pt: 'Fundo', pl: 'Tło', ru: 'Фон' },
  animNone:         { en: 'None', es: 'Ninguna', pt: 'Nenhuma', pl: 'Brak', ru: 'Нет' },
  animFade:         { en: 'Fade', es: 'Desvanecimiento', pt: 'Fade', pl: 'Zanikanie', ru: 'Затухание' },
  animSlide:        { en: 'Slide', es: 'Deslizamiento', pt: 'Deslizamiento', pl: 'Przesunięcie', ru: 'Слайд' },
  animPop:          { en: 'Pop', es: 'Pop', pt: 'Pop', pl: 'Pop', ru: 'Поп' },
  canvasEditor:     { en: 'Canvas editor', es: 'Editor de lienzo', pt: 'Editor de canvas', pl: 'Edytor canvas', ru: 'Редактор холста' },
  uploadPrompt:     { en: 'Upload a source video to start editing', es: 'Sube un video fuente para empezar a editar', pt: 'Faça upload de um vídeo para começar a editar', pl: 'Prześlij wideo, aby rozpocząć edycję', ru: 'Загрузите видео для начала редактирования' },
  playing:          { en: 'Playing', es: 'Reproduciendo', pt: 'Reproduzindo', pl: 'Odtwarzanie', ru: 'Воспроизведение' },
  play:             { en: 'Play', es: 'Reproducir', pt: 'Reproduzir', pl: 'Odtwórz', ru: 'Играть' },
  pause:            { en: 'Pause', es: 'Pausar', pt: 'Pausar', pl: 'Pauza', ru: 'Пауза' },
  prevFrame:        { en: '− frame', es: '− fotograma', pt: '− quadro', pl: '− klatka', ru: '− кадр' },
  nextFrame:        { en: '+ frame', es: '+ fotograma', pt: '+ quadro', pl: '+ klatka', ru: '+ кадр' },
  restart:          { en: 'Restart', es: 'Reiniciar', pt: 'Reiniciar', pl: 'Uruchom ponownie', ru: 'Перезапуск' },
  exportPanel:      { en: 'Export panel', es: 'Panel de exportación', pt: 'Painel de exportação', pl: 'Panel eksportu', ru: 'Панель экспорта' },
  exportNote:       { en: 'Renders are queued for the video worker, burned in with FFmpeg ASS subtitles, and stored as downloadable MP4s.', es: 'Los renders se ponen en cola, se integran con subtítulos FFmpeg y se almacenan como MP4.', pt: 'Renders são enfileirados, incorporados com legendas FFmpeg e armazenados como MP4.', pl: 'Renderowania są kolejkowane, wbudowywane z napisami FFmpeg i przechowywane jako MP4.', ru: 'Рендеры ставятся в очередь, встраиваются с субтитрами FFmpeg и сохраняются как MP4.' },
  exportBtn:        { en: 'Export burned-caption MP4', es: 'Exportar MP4 con subtítulos integrados', pt: 'Exportar MP4 com legendas integradas', pl: 'Eksportuj MP4 z wbudowanymi napisami', ru: 'Экспорт MP4 с субтитрами' },
  exportDemoNote:   { en: 'Free/demo users can preview the editor. Choose a paid tier to export full videos.', es: 'Usuarios gratuitos pueden previsualizar. Elige un plan de pago para exportar.', pt: 'Usuários gratuitos podem pré-visualizar. Escolha um plano pago para exportar.', pl: 'Użytkownicy bezpłatni mogą przeglądać. Wybierz płatny plan, aby eksportować.', ru: 'Бесплатные пользователи могут просматривать. Выберите платный план для экспорта.' },
  jobLabel:         { en: 'Job:', es: 'Trabajo:', pt: 'Trabalho:', pl: 'Zadanie:', ru: 'Задание:' },
  statusLabel:      { en: 'Status:', es: 'Estado:', pt: 'Status:', pl: 'Status:', ru: 'Статус:' },
  refresh:          { en: 'Refresh', es: 'Actualizar', pt: 'Atualizar', pl: 'Odśwież', ru: 'Обновить' },
  downloadMp4:      { en: 'Download MP4', es: 'Descargar MP4', pt: 'Baixar MP4', pl: 'Pobierz MP4', ru: 'Скачать MP4' },
  videoLabel:       { en: 'Video', es: 'Video', pt: 'Vídeo', pl: 'Wideo', ru: 'Видео' },
  captionsFallback: { en: 'Captions fallback', es: 'Subtítulos alternativos', pt: 'Legendas alternativas', pl: 'Zapasowe napisy', ru: 'Запасные субтитры' },
  tierLabel:        { en: 'Tier', es: 'Plan', pt: 'Plano', pl: 'Plan', ru: 'Тариф' },
  localeLabel:      { en: 'Locale', es: 'Idioma', pt: 'Idioma', pl: 'Język', ru: 'Язык' },
  usedMinutesLabel: { en: 'Used minutes', es: 'Minutos usados', pt: 'Minutos usados', pl: 'Zużyte minuty', ru: 'Использовано минут' },
  tierFree:         { en: 'Free/demo', es: 'Gratuito/demo', pt: 'Gratuito/demo', pl: 'Bezpłatny/demo', ru: 'Бесплатный/демо' },
  storagePrefix:    { en: 'Storage:', es: 'Almacenamiento:', pt: 'Armazenamento:', pl: 'Przechowywanie:', ru: 'Хранилище:' },
  captionsPrefix:   { en: 'Captions:', es: 'Subtítulos:', pt: 'Legendas:', pl: 'Napisy:', ru: 'Субтитры:' },
  genCaptionsBtn:   { en: 'Generate Captions', es: 'Generar subtítulos', pt: 'Gerar legendas', pl: 'Generuj napisy', ru: 'Создать субтитры' },
  generatingBtn:    { en: 'Generating…', es: 'Generando…', pt: 'Gerando…', pl: 'Generowanie…', ru: 'Создание…' },
  initUpload:       { en: 'Upload a source video to begin.', es: 'Sube un video fuente para comenzar.', pt: 'Faça upload de um vídeo para começar.', pl: 'Prześlij źródłowe wideo, aby rozpocząć.', ru: 'Загрузите исходное видео для начала.' },
  initCaptions:     { en: 'Generate AI captions after uploading a video, or upload an SRT/VTT file.', es: 'Genera subtítulos IA después de subir un video, o sube un archivo SRT/VTT.', pt: 'Gere legendas IA após upload de um vídeo ou faça upload de um SRT/VTT.', pl: 'Generuj napisy AI po przesłaniu wideo lub prześlij plik SRT/VTT.', ru: 'Создайте AI-субтитры после загрузки видео или загрузите SRT/VTT.' },
  msgUploading:     { en: 'Preparing', es: 'Preparando', pt: 'Preparando', pl: 'Przygotowywanie', ru: 'Подготовка' },
  msgVideoSelected: { en: 'Video selected. Uploading before caption generation…', es: 'Video seleccionado. Subiendo antes de generar subtítulos…', pt: 'Vídeo selecionado. Fazendo upload antes de gerar legendas…', pl: 'Wideo wybrane. Przesyłanie przed generowaniem napisów…', ru: 'Видео выбрано. Загрузка перед созданием субтитров…' },
  msgUploadReady:   { en: 'uploaded directly to storage.', es: 'subido directamente al almacenamiento.', pt: 'enviado diretamente para o armazenamento.', pl: 'przesłane bezpośrednio do przechowywania.', ru: 'загружено непосредственно в хранилище.' },
  msgTooLarge:      { en: 'Immediate captions currently support up to', es: 'Los subtítulos inmediatos soportan hasta', pt: 'Legendas imediatas suportam até', pl: 'Natychmiastowe napisy obsługują do', ru: 'Немедленные субтитры поддерживают до' },
  msgTooLargeEnd:   { en: 'MB. Larger videos need background caption processing.', es: 'MB. Videos más grandes necesitan procesamiento en segundo plano.', pt: 'MB. Vídeos maiores precisam de processamento em segundo plano.', pl: 'MB. Większe filmy wymagają przetwarzania w tle.', ru: 'МБ. Большие видео требуют фоновой обработки.' },
  msgReadyCaptions: { en: 'Ready for AI captions. This video is', es: 'Listo para subtítulos IA. Este video es de', pt: 'Pronto para legendas IA. Este vídeo tem', pl: 'Gotowy na napisy AI. To wideo ma', ru: 'Готово для AI-субтитров. Размер видео:' },
  msgUploadFailed:  { en: 'Upload failed.', es: 'Carga fallida.', pt: 'Upload falhou.', pl: 'Przesyłanie nie powiodło się.', ru: 'Загрузка не удалась.' },
  msgNeedVideo:     { en: 'Upload a video before generating captions.', es: 'Sube un video antes de generar subtítulos.', pt: 'Faça upload de um vídeo antes de gerar legendas.', pl: 'Prześlij wideo przed generowaniem napisów.', ru: 'Загрузите видео перед созданием субтитров.' },
  msgWaitUpload:    { en: 'Wait for the video upload to finish before generating captions.', es: 'Espera que termine la carga antes de generar subtítulos.', pt: 'Aguarde o upload terminar antes de gerar legendas.', pl: 'Poczekaj na zakończenie przesyłania przed generowaniem napisów.', ru: 'Дождитесь окончания загрузки перед созданием субтитров.' },
  msgGenCaptions:   { en: 'Generating AI captions from stored video…', es: 'Generando subtítulos IA del video almacenado…', pt: 'Gerando legendas IA do vídeo armazenado…', pl: 'Generowanie napisów AI ze przechowywanego wideo…', ru: 'Создание AI-субтитров из сохранённого видео…' },
  msgCaptionsReady: { en: 'caption cues. Refresh to update credit count.', es: 'señales de subtítulos. Actualiza para ver el saldo.', pt: 'indicações de legendas. Atualize para ver o saldo.', pl: 'wskazówek napisów. Odśwież, aby zaktualizować kredyty.', ru: 'реплик субтитров. Обновите для обновления кредитов.' },
  msgCaptionFailed: { en: 'Caption generation failed.', es: 'La generación de subtítulos falló.', pt: 'A geração de legendas falhou.', pl: 'Generowanie napisów nie powiodło się.', ru: 'Создание субтитров не удалось.' },
  msgReading:       { en: 'Reading', es: 'Leyendo', pt: 'Lendo', pl: 'Czytanie', ru: 'Чтение' },
  msgCaptionLoaded: { en: 'caption cues from', es: 'señales de subtítulos de', pt: 'indicações de legendas de', pl: 'wskazówek napisów z', ru: 'реплик субтитров из' },
  msgCaptionUpFailed: { en: 'Caption upload failed.', es: 'La carga de subtítulos falló.', pt: 'O upload de legendas falhou.', pl: 'Przesyłanie napisów nie powiodło się.', ru: 'Загрузка субтитров не удалась.' },
  msgNeedSource:    { en: 'Upload the video to storage before exporting.', es: 'Sube el video al almacenamiento antes de exportar.', pt: 'Faça upload do vídeo para o armazenamento antes de exportar
function PresetPicker({ activePreset, onPreset }: { activePreset: string; onPreset: (preset: CaptionPreset) => void }) {
  const { lang } = useI18n()
  return (
    <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{c('templates', lang)}</h2>
        <span className="text-xs text-white/50">{c('templatesHint', lang)}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {captionPresets.map((preset) => (
          <button key={preset.id} type="button" onClick={() => onPreset(preset)}
            className={`rounded-2xl border p-4 text-left transition ${activePreset === preset.id ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}>
            <span className="font-bold">{preset.label}</span>
            <span className="mt-1 block text-xs text-white/55">{c(preset.description, lang)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function CaptionTimeline({ cues, currentTime, selectedCueId, onSeek, onSelect, onUpdateText }: {
  cues: CaptionCue[]; currentTime: number; selectedCueId: string | null
  onSeek: (seconds: number) => void; onSelect: (id: string) => void; onUpdateText: (id: string, text: string) => void
}) {
  const { lang } = useI18n()
  const selectedCue = cues.find((cue) => cue.id === selectedCueId) || activeCue(cues, currentTime) || cues[0]
  return (
    <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{c('captionTimeline', lang)}</h2>
        <span className="text-xs text-white/50">{cues.length} {c('cues', lang)}</span>
      </div>
      {selectedCue ? (
        <label className="mt-4 block text-sm">
          {c('editCaption', lang)}
          <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-white/10 p-3" value={selectedCue.text} onChange={(event) => onUpdateText(selectedCue.id, event.target.value)} />
          <span className="mt-1 block font-mono text-xs text-[#FFD700]">{formatTime(selectedCue.start)} → {formatTime(selectedCue.end)}</span>
        </label>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/55">{c('noCaptionsTL', lang)}</p>
      )}
      <div className="mt-4 max-h-72 space-y-2 overflow-auto">
        {cues.map((cue) => (
          <button key={cue.id} type="button" onClick={() => { onSelect(cue.id); onSeek(cue.start) }}
            className={`w-full rounded-2xl border p-3 text-left text-sm transition ${selectedCue?.id === cue.id || (currentTime >= cue.start && currentTime <= cue.end) ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}>
            <span className="font-mono text-xs text-[#FFD700]">{formatTime(cue.start)} → {formatTime(cue.end)}</span>
            <br />{cue.text}
          </button>
        ))}
      </div>
    </section>
  )
}

function StyleControls({ style, aspectRatio, onChange, onAspectRatio }: {
  style: CaptionStyle; aspectRatio: AspectRatio
  onChange: (style: CaptionStyle) => void; onAspectRatio: (ratio: AspectRatio) => void
}) {
  const { lang } = useI18n()
  return (
    <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{c('captionStyle', lang)}</h2>
        <span className="text-xs text-white/50">x {style.x}% · y {style.y}%</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {c('format', lang)}
          <select className="mt-1 w-full rounded-xl border border-white/10 bg-black p-2" value={aspectRatio} onChange={(event) => onAspectRatio(event.target.value as AspectRatio)}>
            <option value="9:16">9:16 Shorts/Reels/TikTok</option>
            <option value="1:1">1:1 Square</option>
            <option value="16:9">16:9 YouTube</option>
          </select>
        </label>
        <label className="text-sm">
          {c('fontFamily', lang)}
          <input className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 p-2" value={style.fontFamily} onChange={(event) => onChange({ ...style, fontFamily: event.target.value })} />
        </label>
        <label className="text-sm">
          {c('fontSize', lang)}: {style.fontSize}px
          <input type="range" min="18" max="84" value={style.fontSize} onChange={(event) => onChange({ ...style, fontSize: Number(event.target.value) })} className="mt-3 w-full" />
        </label>
        <label className="text-sm">
          {c('textColor', lang)}
          <input type="color" value={style.color} onChange={(event) => onChange({ ...style, color: event.target.value })} className="mt-1 block h-10 w-full rounded-xl" />
        </label>
        <label className="text-sm">
          {c('animation', lang)}
          <select className="mt-1 w-full rounded-xl border border-white/10 bg-black p-2" value={style.animation} onChange={(event) => onChange({ ...style, animation: event.target.value as CaptionStyle['animation'] })}>
            <option value="none">{c('animNone', lang)}</option>
            <option value="fade">{c('animFade', lang)}</option>
            <option value="slide">{c('animSlide', lang)}</option>
            <option value="pop">{c('animPop', lang)}</option>
          </select>
        </label>
        <label className="text-sm">
          {c('background', lang)}
          <input className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 p-2" value={style.backgroundColor} onChange={(event) => onChange({ ...style, backgroundColor: event.target.value })} />
        </label>
      </div>
    </section>
  )
}
function InnerCanvasEditor({ videoUrl, cues, style, aspectRatio, seekTime, durationSec, onStyleChange, onTime, onDuration }: {
  videoUrl: string | null; cues: CaptionCue[]; style: CaptionStyle; aspectRatio: AspectRatio
  seekTime: number; durationSec: number; onStyleChange: (style: CaptionStyle) => void; onTime: (time: number) => void; onDuration: (seconds: number) => void
}) {
  const { lang } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [time, setTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)
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
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          if (!videoUrl) {
            ctx.fillStyle = 'rgba(255,255,255,.08)'
            drawRoundRect(ctx, canvas.width * 0.12, canvas.height * 0.42, canvas.width * 0.76, canvas.height * 0.16, 28)
            ctx.fill()
            ctx.fillStyle = 'rgba(255,255,255,.68)'
            ctx.font = `700 ${Math.max(22, canvas.width * 0.035)}px Inter, Arial, sans-serif`
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText(c('uploadPrompt', lang), canvas.width / 2, canvas.height / 2)
          }
          const renderTime = video?.currentTime ?? time
          const cue = activeCue(cues, renderTime)
          if (cue) {
            const animationOffset = style.animation === 'slide' ? Math.max(0, 1 - ((renderTime - cue.start) / 0.2)) * (canvas.height * 0.05) : 0
            const scale = style.animation === 'pop' ? 1 + Math.max(0, 1 - ((renderTime - cue.start) / 0.18)) * 0.08 : 1
            const fontScale = aspectRatio === '9:16' ? canvas.width / 720 : aspectRatio === '1:1' ? canvas.width / 1080 : canvas.width / 1280
            const fontSize = style.fontSize * scale * fontScale
            const x = canvas.width * style.x / 100
            const y = (canvas.height * style.y / 100) + animationOffset
            ctx.save()
            ctx.globalAlpha = style.animation === 'fade' ? clamp(Math.min(renderTime - cue.start, cue.end - renderTime) / 0.18, 0.25, 1) : 1
            ctx.font = `800 ${fontSize}px ${style.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            const lines = wrapCaption(ctx, cue.text, canvas.width * 0.82)
            const lineHeight = fontSize * 1.18
            const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), fontSize * 2)
            const boxWidth = Math.min(canvas.width - 48, textWidth + 48)
            const boxHeight = (lines.length * lineHeight) + 34
            ctx.fillStyle = style.backgroundColor
            drawRoundRect(ctx, x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, 22); ctx.fill()
            ctx.fillStyle = style.color
            lines.forEach((line, index) => { ctx.fillText(line, x, y + ((index - (lines.length - 1) / 2) * lineHeight)) })
            ctx.restore()
          }
        }
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [videoUrl, cues, style, aspectRatio, time, lang])

  const setPosition = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    onStyleChange({ ...style, x: Math.round(clamp(((event.clientX - rect.left) / rect.width) * 100, 8, 92)), y: Math.round(clamp(((event.clientY - rect.top) / rect.height) * 100, 8, 92)) })
  }, [onStyleChange, style])

  const seek = (seconds: number) => {
    const maxDuration = Math.max(0, durationSec || videoRef.current?.duration || 0)
    const next = clamp(seconds, 0, maxDuration)
    if (videoRef.current) videoRef.current.currentTime = next
    setTime(next); onTime(next)
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-black/50 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{c('canvasEditor', lang)}</h2>
        <span className="font-mono text-xs text-white/50">{formatTime(time)} · {aspectRatio}</span>
      </div>
      <div className={`relative mx-auto mt-4 w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 ${aspectClasses[aspectRatio]}`}>
        {videoUrl ? (
          <video ref={videoRef} src={videoUrl} className="absolute inset-0 h-full w-full object-cover" playsInline preload="metadata"
            onLoadedMetadata={(event) => onDuration(Number((event.currentTarget.duration || 0).toFixed(2)))}
            onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
            onTimeUpdate={(event) => { const next = event.currentTarget.currentTime; setTime(next); onTime(next) }} />
        ) : null}
        <canvas ref={canvasRef} width={size.width} height={size.height}
          onPointerDown={(event) => { setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); setPosition(event) }}
          onPointerMove={(event) => dragging && setPosition(event)}
          onPointerUp={(event) => { setDragging(false); event.currentTarget.releasePointerCapture(event.pointerId) }}
          onPointerCancel={() => setDragging(false)}
          className="relative z-10 h-full w-full cursor-move touch-none"
          aria-label="Video canvas with draggable caption overlay" />
      </div>
      <div className="mt-4 space-y-3">
        <input type="range" min="0" max={Math.max(1, durationSec)} step="0.05" value={Math.min(time, Math.max(1, durationSec))} disabled={!videoUrl} onChange={(event) => seek(Number(event.target.value))} className="w-full" />
        <div className="flex flex-wrap gap-3">
          <button className="rounded-full bg-[#FFD700] px-5 py-2 font-bold text-black disabled:opacity-50" disabled={!videoUrl} onClick={() => videoRef.current?.play()}>
            {isPlaying ? c('playing', lang) : c('play', lang)}
          </button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => videoRef.current?.pause()}>{c('pause', lang)}</button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(time - 0.1)}>{c('prevFrame', lang)}</button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(time + 0.1)}>{c('nextFrame', lang)}</button>
          <button className="rounded-full border border-white/20 px-5 py-2 disabled:opacity-50" disabled={!videoUrl} onClick={() => seek(0)}>{c('restart', lang)}</button>
        </div>
      </div>
    </section>
  )
}

function ExportPanel({ canExport, hasSource, job, onExport, onRefresh }: {
  canExport: boolean; hasSource: boolean; job: JobState | null; onExport: () => void; onRefresh: () => void
}) {
  const { lang } = useI18n()
  return (
    <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
      <h2 className="text-xl font-bold">{c('exportPanel', lang)}</h2>
      <p className="mt-2 text-sm text-white/55">{c('exportNote', lang)}</p>
      <button onClick={onExport} className="mt-4 w-full rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black disabled:opacity-50" disabled={!canExport || !hasSource}>
        {c('exportBtn', lang)}
      </button>
      {!canExport ? (
        <p className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{c('exportDemoNote', lang)}</p>
      ) : null}
      {job ? (
        <div className="mt-4 rounded-2xl bg-white/[.04] p-4 text-sm">
          <p className="break-all">{c('jobLabel', lang)} {job.jobId}</p>
          <p>{c('statusLabel', lang)} {job.status}</p>
          {job.error ? <p className="text-red-300">{job.error}</p> : null}
          <button onClick={onRefresh} className="mt-3 rounded-full border border-white/20 px-4 py-2 disabled:opacity-50" disabled={job.jobId === 'blocked'}>
            {c('refresh', lang)}
          </button>
          {job.result_url ? (
            <a className="ml-3 text-[#FFD700]" href={job.result_url} download>{c('downloadMp4', lang)}</a>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export default function VideoEditor() {
  return null
}
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en')

  const [locale, setLocale]             = useState<SupportedVideoLocale>('en')
  const [tier, setTier]                 = useState<SubscriptionTier>('free')
  const [usedMinutes, setUsedMinutes]   = useState(0)
  const [durationSec, setDurationSec]   = useState(0)
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null)
  const [sourceUrl, setSourceUrl]       = useState<string | null>(null)
  const [storageObject, setStorageObject] = useState<StorageObject | null>(null)
  const [videoFile, setVideoFile]       = useState<File | null>(null)
  const [filename, setFilename]         = useState('source-video.mp4')
  const [cues, setCues]                 = useState<CaptionCue[]>([])
  const [style, setStyle]               = useState(defaultCaptionStyle)
  const [aspectRatio, setAspectRatio]   = useState<AspectRatio>('9:16')
  const [activePreset, setActivePreset] = useState('signal')
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null)
  const [currentTime, setCurrentTime]   = useState(0)
  const [job, setJob]                   = useState<JobState | null>(null)
  const localPreviewRef                 = useRef<string | null>(null)

  const [uploadState, setUploadState] = useState<UploadState>(() => ({ status: 'idle', message: c('initUpload', l) }))
  const [captionState, setCaptionState] = useState<CaptionGenerationState>(() => ({ status: 'idle', message: c('initCaptions', l) }))

  const quota = useMemo(() => {
    const projectedMinutes = usedMinutes + Math.ceil(Math.max(1, durationSec) / 60)
    return calculateVideoQuota(tier, projectedMinutes)
  }, [tier, usedMinutes, durationSec])

  useEffect(() => { return () => { if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current) } }, [])

  async function uploadVideo(file: File) {
    setUploadState({ status: 'uploading', message: `${c('msgUploading', l)} ${file.name} (${formatFileSize(file.size)})…` })
    setCaptionState({ status: 'idle', message: c('msgVideoSelected', l) })
    setVideoFile(file); setFilename(file.name); setCues([]); setSelectedCueId(null); setCurrentTime(0); setSourceUrl(null); setStorageObject(null); setJob(null)
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current)
    const nextPreviewUrl = URL.createObjectURL(file)
    localPreviewRef.current = nextPreviewUrl; setPreviewUrl(nextPreviewUrl)
    try {
      const uploadUrlResponse = await fetch('/api/video/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name }) })
      const uploadUrlPayload = await readJsonResponse<{ ok: boolean; data?: { bucket: string; path: string; token: string }; error?: string }>(uploadUrlResponse)
      if (!uploadUrlPayload.ok || !uploadUrlPayload.data) throw new Error(uploadUrlPayload.error || c('msgUrlFailed', l))
      const supabase = getBrowserSupabase()
      const { bucket, path, token } = uploadUrlPayload.data
      const { error: uploadError } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)
      if (uploadError) throw new Error(uploadError.message)
      const completeResponse = await fetch('/api/video/upload-complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket, path }) })
      const completePayload = await readJsonResponse<{ ok: boolean; data?: { signedUrl: string; bucket: string; path: string }; error?: string }>(completeResponse)
      if (!completePayload.ok || !completePayload.data?.signedUrl) throw new Error(completePayload.error || c('msgFinalizeFailed', l))
      setSourceUrl(completePayload.data.signedUrl)
      setStorageObject({ bucket: completePayload.data.bucket, path: completePayload.data.path, signedUrl: completePayload.data.signedUrl })
      setUploadState({ status: 'ready', message: `${file.name} ${c('msgUploadReady', l)}` })
      if (file.size > immediateCaptionMaxMb * 1024 * 1024) {
        setCaptionState({ status: 'failed', message: `${c('msgTooLarge', l)} ${immediateCaptionMaxMb} ${c('msgTooLargeEnd', l)}` })
      } else {
        setCaptionState({ status: 'idle', message: `${c('msgReadyCaptions', l)} ${formatFileSize(file.size)}.` })
      }
    } catch (error) {
      setUploadState({ status: 'failed', message: error instanceof Error ? error.message : c('msgUploadFailed', l) })
    }
  }

  async function generateCaptions() {
    if (!videoFile) { setCaptionState({ status: 'failed', message: c('msgNeedVideo', l) }); return }
    if (!storageObject) { setCaptionState({ status: 'failed', message: c('msgWaitUpload', l) }); return }
    setCaptionState({ status: 'generating', message: c('msgGenCaptions', l) })
    try {
      const res = await fetch('/api/video/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket: storageObject.bucket, path: storageObject.path, locale, durationSec }) })
      const payload = await readJsonResponse<{ ok: boolean; data?: { cues?: CaptionCue[]; creditsRemaining?: number }; error?: string }>(res)
      if (payload.ok) {
        const nextCues = Array.isArray(payload.data?.cues) ? payload.data.cues : []
        setCues(nextCues); setSelectedCueId(nextCues[0]?.id || null); setCurrentTime(nextCues[0]?.start || 0)
        setCaptionState({ status: 'ready', message: `${nextCues.length} ${c('msgCaptionsReady', l)}` })
      } else {
        setCaptionState({ status: 'failed', message: payload.error || c('msgCaptionFailed', l) })
      }
    } catch (error) {
      setCaptionState({ status: 'failed', message: error instanceof Error ? error.message : c('msgCaptionFailed', l) })
    }
  }

  async function uploadCaptions(file: File) {
    setCaptionState({ status: 'generating', message: `${c('msgReading', l)} ${file.name}…` })
    const form = new FormData(); form.set('captions', file)
    try {
      const res = await fetch(`/api/video/captions?locale=${locale}`, { method: 'POST', body: form })
      const payload = await readJsonResponse<{ ok: boolean; data?: { cues?: CaptionCue[] }; error?: string }>(res)
      if (payload.ok) {
        const nextCues = Array.isArray(payload.data?.cues) ? payload.data.cues : []
        setCues(nextCues); setSelectedCueId(nextCues[0]?.id || null); setCurrentTime(nextCues[0]?.start || 0)
        setCaptionState({ status: 'ready', message: `${nextCues.length} ${c('msgCaptionLoaded', l)} ${file.name}.` })
      } else {
        setCaptionState({ status: 'failed', message: payload.error || c('msgCaptionUpFailed', l) })
      }
    } catch (error) {
      setCaptionState({ status: 'failed', message: error instanceof Error ? error.message : c('msgCaptionUpFailed', l) })
    }
  }

  async function exportVideo() {
    if (!sourceUrl) { setJob({ jobId: 'blocked', status: 'failed', error: c('msgNeedSource', l) }); return }
    try {
      const res = await fetch('/api/video/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceUrl, filename, durationSec: Math.max(1, durationSec), captions: cues, style, aspectRatio, locale, tier, usedMinutes }) })
      const payload = await readJsonResponse<{ ok: boolean; data?: { jobId: string; status: string }; error?: string }>(res)
      if (payload.ok && payload.data) { setJob({ jobId: payload.data.jobId, status: payload.data.status }) }
      else { setJob({ jobId: 'blocked', status: 'failed', error: payload.error || c('msgExportFailed', l) }) }
    } catch (error) {
      setJob({ jobId: 'blocked', status: 'failed', error: error instanceof Error ? error.message : c('msgExportFailed', l) })
    }
  }

  async function refreshJob() {
    if (!job || job.jobId === 'blocked') return
    try {
      const res = await fetch(`/api/video/jobs/${job.jobId}`)
      const payload = await readJsonResponse<{ ok: boolean; data?: { status: string; result_url?: string | null; error?: string | null }; error?: string }>(res)
      if (payload.ok && payload.data) { setJob({ jobId: job.jobId, status: payload.data.status, result_url: payload.data.result_url, error: payload.data.error }) }
    } catch (error) {
      setJob({ jobId: job.jobId, status: 'failed', error: error instanceof Error ? error.message : c('msgJobFailed', l) })
    }
  }

  useEffect(() => {
    if (!job || job.jobId === 'blocked' || ['completed', 'failed'].includes(job.status)) return
    const timer = window.setInterval(refreshJob, 4000)
    return () => window.clearInterval(timer)
  }, [job?.jobId, job?.status])

  const updateCueText = (id: string, text: string) => {
    setCues((items) => items.map((cue) => cue.id === id ? { ...cue, text } : cue))
  }

  return (
    <main className="min-h-screen bg-[#05070b] p-6 text-white">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.20),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{c('eyebrow', l)}</p>
        <h1 className="mt-4 text-4xl font-black">{c('heroTitle', l)}</h1>
        <p className="mt-3 max-w-3xl text-white/70">{c('heroSubtitle', l)}</p>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {(['stepUpload', 'stepCaptions', 'stepStyle', 'stepExport'] as const).map((key, i) => (
            <div key={key} className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <span className="text-xs text-[#FFD700]">{c('step', l)} {i + 1}</span>
              <p className="mt-1 font-semibold">{c(key, l)}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_.35fr]">
        <QuotaStatusBar quota={quota} />
        <BillingBanner quota={quota} />
      </div>

      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[.03] p-5">
        <div className="grid gap-4 md:grid-cols-5">
          <label className="text-sm">
            {c('videoLabel', l)}
            <input type="file" accept="video/*" onChange={(event) => event.target.files?.[0] && uploadVideo(event.target.files[0])} className="mt-2 w-full" />
          </label>
          <label className="text-sm">
            {c('captionsFallback', l)}
            <input type="file" accept=".srt,.vtt,text/vtt" onChange={(event) => event.target.files?.[0] && uploadCaptions(event.target.files[0])} className="mt-2 w-full" />
          </label>
          <label className="text-sm">
            {c('tierLabel', l)}
            <select className="mt-2 w-full rounded-xl bg-black p-2" value={tier} onChange={(event) => setTier(event.target.value as SubscriptionTier)}>
              <option value="free">{c('tierFree', l)}</option>
              <option value="launch">Launch</option>
              <option value="growth">Growth</option>
              <option value="command">Command</option>
            </select>
          </label>
          <label className="text-sm">
            {c('localeLabel', l)}
            <select className="mt-2 w-full rounded-xl bg-black p-2" value={locale} onChange={(event) => setLocale(event.target.value as SupportedVideoLocale)}>
              <option value="en">en</option><option value="es">es</option><option value="pt">pt</option><option value="pl">pl</option><option value="ru">ru</option>
            </select>
          </label>
          <label className="text-sm">
            {c('usedMinutesLabel', l)}
            <input type="number" min="0" className="mt-2 w-full rounded-xl bg-black p-2" value={usedMinutes} onChange={(event) => setUsedMinutes(Number(event.target.value))} />
          </label>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className={`text-xs ${uploadState.status === 'failed' ? 'text-red-300' : 'text-white/55'}`}>{c('storagePrefix', l)} {uploadState.message}</p>
            <p className={`mt-1 text-xs ${captionState.status === 'failed' ? 'text-red-300' : 'text-white/55'}`}>{c('captionsPrefix', l)} {captionState.message}</p>
          </div>
          <button type="button" onClick={generateCaptions} disabled={!videoFile || captionState.status === 'generating' || uploadState.status === 'uploading'} className="rounded-full bg-[#FFD700] px-6 py-3 font-bold text-black disabled:opacity-50">
            {captionState.status === 'generating' ? c('generatingBtn', l) : c('genCaptionsBtn', l)}
          </button>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_.42fr]">
        <div className="space-y-6">
          <InnerCanvasEditor videoUrl={previewUrl} cues={cues} style={style} aspectRatio={aspectRatio} seekTime={currentTime} durationSec={durationSec} onStyleChange={setStyle} onTime={setCurrentTime} onDuration={setDurationSec} />
          <StyleControls style={style} aspectRatio={aspectRatio} onChange={setStyle} onAspectRatio={setAspectRatio} />
          <PresetPicker activePreset={activePreset} onPreset={(preset) => { setActivePreset(preset.id); setStyle(preset.style); if (preset.aspectRatio) setAspectRatio(preset.aspectRatio) }} />
        </div>
        <div className="space-y-6">
          <CaptionTimeline cues={cues} currentTime={currentTime} selectedCueId={selectedCueId} onSeek={setCurrentTime} onSelect={setSelectedCueId} onUpdateText={updateCueText} />
          <ExportPanel canExport={quota.exportEnabled} hasSource={Boolean(sourceUrl)} job={job} onExport={exportVideo} onRefresh={refreshJob} />
        </div>
      </div>

      <footer className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-white/60">
        {c('footerSync', l)} {currentTime.toFixed(2)}s · {c('footerDuration', l)} {durationSec || 0}s · {cues.length} {c('footerCaptions', l)} · {c('footerStorage', l)} · {c('footerWorker', l)} <code>npm run worker:video</code>.
      </footer>
    </main>
  )
}
