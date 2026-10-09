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

const de: VideoProductionCopy = {
  title: 'Produktionsaufträge',
  intro: 'Gerenderte MP4-Aufträge erscheinen hier zur finalen Prüfung vor der Veröffentlichung oder bezahlten Verbreitung.',
  refresh: 'Aufträge aktualisieren',
  empty: 'Noch keine Produktionsaufträge.',
  finalReview: 'Finale Prüfung',
  status: 'Status',
  tier: 'Stufe',
  outputReady: 'Gerendertes MP4 bereit',
  outputPending: 'Ausgabe ausstehend',
  approveFinal: 'Finales Video freigeben',
  rejectFinal: 'Finales Video ablehnen',
  openFile: 'MP4 öffnen',
  error: 'Fehler',
  platforms: 'Plattformen',
}

const fr: VideoProductionCopy = {
  title: 'Tâches de production',
  intro: 'Les MP4 rendus apparaissent ici pour une validation finale avant publication ou diffusion payante.',
  refresh: 'Actualiser les tâches',
  empty: 'Aucune tâche de production pour le moment.',
  finalReview: 'Validation finale',
  status: 'statut',
  tier: 'niveau',
  outputReady: 'MP4 rendu prêt',
  outputPending: 'Sortie en attente',
  approveFinal: 'Approuver la vidéo finale',
  rejectFinal: 'Rejeter la vidéo finale',
  openFile: 'Ouvrir le MP4',
  error: 'erreur',
  platforms: 'plateformes',
}

const it: VideoProductionCopy = {
  title: 'Lavori di produzione',
  intro: 'I lavori MP4 renderizzati compaiono qui per la revisione finale prima della pubblicazione o della distribuzione a pagamento.',
  refresh: 'Aggiorna lavori',
  empty: 'Ancora nessun lavoro di produzione.',
  finalReview: 'Revisione finale',
  status: 'stato',
  tier: 'livello',
  outputReady: 'MP4 renderizzato pronto',
  outputPending: 'Output in attesa',
  approveFinal: 'Approva video finale',
  rejectFinal: 'Rifiuta video finale',
  openFile: 'Apri MP4',
  error: 'errore',
  platforms: 'piattaforme',
}

const ja: VideoProductionCopy = {
  title: '制作ジョブ',
  intro: 'レンダリング済みの MP4 ジョブは、公開または有料配信の前に最終確認のためここに表示されます。',
  refresh: 'ジョブを更新',
  empty: '制作ジョブはまだありません。',
  finalReview: '最終確認',
  status: 'ステータス',
  tier: 'ティア',
  outputReady: 'レンダリング済み MP4 の準備完了',
  outputPending: '出力待ち',
  approveFinal: '最終動画を承認',
  rejectFinal: '最終動画を却下',
  openFile: 'MP4 を開く',
  error: 'エラー',
  platforms: 'プラットフォーム',
}

const ko: VideoProductionCopy = {
  title: '제작 작업',
  intro: '렌더링된 MP4 작업은 게시 또는 유료 배포 전에 최종 검토를 위해 여기에 표시됩니다.',
  refresh: '작업 새로고침',
  empty: '아직 제작 작업이 없습니다.',
  finalReview: '최종 검토',
  status: '상태',
  tier: '등급',
  outputReady: '렌더링된 MP4 준비 완료',
  outputPending: '출력 대기 중',
  approveFinal: '최종 동영상 승인',
  rejectFinal: '최종 동영상 거절',
  openFile: 'MP4 열기',
  error: '오류',
  platforms: '플랫폼',
}

const ar: VideoProductionCopy = {
  title: 'مهام الإنتاج',
  intro: 'تظهر مهام ملفات MP4 المعروضة هنا للمراجعة النهائية قبل النشر أو التوزيع المدفوع.',
  refresh: 'تحديث المهام',
  empty: 'لا توجد مهام إنتاج بعد.',
  finalReview: 'المراجعة النهائية',
  status: 'الحالة',
  tier: 'المستوى',
  outputReady: 'ملف MP4 المعروض جاهز',
  outputPending: 'المخرجات قيد الانتظار',
  approveFinal: 'الموافقة على الفيديو النهائي',
  rejectFinal: 'رفض الفيديو النهائي',
  openFile: 'فتح MP4',
  error: 'خطأ',
  platforms: 'المنصات',
}

export function getVideoProductionCopy(lang?: string): VideoProductionCopy {
  if (lang?.startsWith('es')) return es
  if (lang?.startsWith('pt')) return pt
  if (lang?.startsWith('pl')) return pl
  if (lang?.startsWith('ru')) return ru
  if (lang?.startsWith('de')) return de
  if (lang?.startsWith('fr')) return fr
  if (lang?.startsWith('it')) return it
  if (lang?.startsWith('ja')) return ja
  if (lang?.startsWith('ko')) return ko
  if (lang?.startsWith('ar')) return ar
  return en
}
