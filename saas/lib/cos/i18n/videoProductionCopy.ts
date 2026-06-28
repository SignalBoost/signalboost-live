export type VideoProductionCopy = {
  title: string
  intro: string
  refresh: string
  empty: string
  finalReview: string
  status: string
  tier: string
  outputReady: string
  outputPending: string
  approveFinal: string
  rejectFinal: string
  openFile: string
  error: string
  platforms: string
}

const en: VideoProductionCopy = {
  title: 'Production jobs',
  intro: 'Rendered MP4 jobs appear here for final review before publishing or paid distribution.',
  refresh: 'Refresh jobs',
  empty: 'No production jobs yet.',
  finalReview: 'Final review',
  status: 'status',
  tier: 'tier',
  outputReady: 'Rendered MP4 ready',
  outputPending: 'Output pending',
  approveFinal: 'Approve final video',
  rejectFinal: 'Reject final video',
  openFile: 'Open MP4',
  error: 'error',
  platforms: 'platforms',
}

const es: VideoProductionCopy = {
  title: 'Trabajos de producción',
  intro: 'Los MP4 renderizados aparecen aquí para revisión final antes de publicar o distribuir con pago.',
  refresh: 'Actualizar trabajos',
  empty: 'Aún no hay trabajos de producción.',
  finalReview: 'Revisión final',
  status: 'estado',
  tier: 'nivel',
  outputReady: 'MP4 renderizado listo',
  outputPending: 'Salida pendiente',
  approveFinal: 'Aprobar video final',
  rejectFinal: 'Rechazar video final',
  openFile: 'Abrir MP4',
  error: 'error',
  platforms: 'plataformas',
}

const pt: VideoProductionCopy = {
  title: 'Trabalhos de produção',
  intro: 'Os MP4 renderizados aparecem aqui para revisão final antes de publicar ou distribuir com mídia paga.',
  refresh: 'Atualizar trabalhos',
  empty: 'Ainda não há trabalhos de produção.',
  finalReview: 'Revisão final',
  status: 'status',
  tier: 'nível',
  outputReady: 'MP4 renderizado pronto',
  outputPending: 'Saída pendente',
  approveFinal: 'Aprovar vídeo final',
  rejectFinal: 'Rejeitar vídeo final',
  openFile: 'Abrir MP4',
  error: 'erro',
  platforms: 'plataformas',
}

const pl: VideoProductionCopy = {
  title: 'Zadania produkcyjne',
  intro: 'Wyrenderowane pliki MP4 pojawią się tutaj do końcowej akceptacji przed publikacją lub płatną dystrybucją.',
  refresh: 'Odśwież zadania',
  empty: 'Nie ma jeszcze zadań produkcyjnych.',
  finalReview: 'Końcowa akceptacja',
  status: 'status',
  tier: 'poziom',
  outputReady: 'MP4 jest gotowe',
  outputPending: 'Plik oczekuje',
  approveFinal: 'Zatwierdź finalne wideo',
  rejectFinal: 'Odrzuć finalne wideo',
  openFile: 'Otwórz MP4',
  error: 'błąd',
  platforms: 'platformy',
}

const ru: VideoProductionCopy = {
  title: 'Производственные задания',
  intro: 'Готовые MP4 появляются здесь для финального утверждения перед публикацией или платным продвижением.',
  refresh: 'Обновить задания',
  empty: 'Производственных заданий пока нет.',
  finalReview: 'Финальная проверка',
  status: 'статус',
  tier: 'уровень',
  outputReady: 'MP4 готов',
  outputPending: 'Файл ожидается',
  approveFinal: 'Утвердить финальное видео',
  rejectFinal: 'Отклонить финальное видео',
  openFile: 'Открыть MP4',
  error: 'ошибка',
  platforms: 'платформы',
}

export function getVideoProductionCopy(lang?: string): VideoProductionCopy {
  if (lang?.startsWith('es')) return es
  if (lang?.startsWith('pt')) return pt
  if (lang?.startsWith('pl')) return pl
  if (lang?.startsWith('ru')) return ru
  return en
}
