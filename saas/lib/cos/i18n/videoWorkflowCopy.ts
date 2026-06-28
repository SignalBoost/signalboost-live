export type VideoWorkflowCopy = {
  pageEyebrow: string
  pageTitle: string
  pageIntro: string
  leftPanelTitle: string
  centerPanelTitle: string
  rightPanelTitle: string
  bottomPanelTitle: string
  approvalQueue: string
  renderingStage: string
  publishingStage: string
  monitoringDashboard: string
  ideaGeneration: string
  draftPreview: string
  statusNeedApproval: string
  statusApprovedRender: string
  statusRejected: string
  statusOnHold: string
  statusInProgress: string
  statusFinalReview: string
  statusPublished: string
  preview: string
  approve: string
  reject: string
  hold: string
  approveRendering: string
  finalApprove: string
  publishReady: string
  metadata: string
  hook: string
  niche: string
  hero: string
  format: string
  quality: string
  platforms: string
  monetization: string
  analytics: string
  views: string
  clicks: string
  comments: string
  engagement: string
  revenue: string
  noRenderedVideo: string
}

const en: VideoWorkflowCopy = {
  pageEyebrow: 'COSA Video Campaign Workflow',
  pageTitle: 'From idea to published campaign',
  pageIntro: 'COSA proposes, you approve, the renderer creates the MP4, and published videos return with performance data.',
  leftPanelTitle: 'Campaign Queue',
  centerPanelTitle: 'Draft Preview + Actions',
  rightPanelTitle: 'Campaign Metadata',
  bottomPanelTitle: 'Publishing + Analytics',
  approvalQueue: 'Approval Queue',
  renderingStage: 'Rendering Stage',
  publishingStage: 'Publishing Stage',
  monitoringDashboard: 'Monitoring Dashboard',
  ideaGeneration: 'Idea Generation',
  draftPreview: 'Draft video preview',
  statusNeedApproval: 'Need Approval',
  statusApprovedRender: 'Approved for Rendering',
  statusRejected: 'Rejected',
  statusOnHold: 'On Hold',
  statusInProgress: 'In Progress',
  statusFinalReview: 'Final Review',
  statusPublished: 'Published',
  preview: 'Preview',
  approve: 'Approve',
  reject: 'Reject',
  hold: 'Hold',
  approveRendering: 'Approve for rendering',
  finalApprove: 'Approve final MP4',
  publishReady: 'Ready for publishing package',
  metadata: 'Metadata',
  hook: 'Hook',
  niche: 'Niche',
  hero: 'Hero',
  format: 'Format',
  quality: 'Quality',
  platforms: 'Platforms',
  monetization: 'Monetization',
  analytics: 'Analytics',
  views: 'Views',
  clicks: 'Clicks',
  comments: 'Comments',
  engagement: 'Engagement',
  revenue: 'Revenue',
  noRenderedVideo: 'Rendered MP4 appears here after the worker finishes.',
}

const es: VideoWorkflowCopy = { ...en,
  pageEyebrow: 'Flujo de campaña de video COSA', pageTitle: 'De idea a campaña publicada', pageIntro: 'COSA propone, tú apruebas, el renderizador crea el MP4 y los videos publicados vuelven con datos de rendimiento.',
  leftPanelTitle: 'Cola de campañas', centerPanelTitle: 'Vista previa + acciones', rightPanelTitle: 'Metadatos de campaña', bottomPanelTitle: 'Publicación + analíticas', approvalQueue: 'Cola de aprobación', renderingStage: 'Etapa de renderizado', publishingStage: 'Etapa de publicación', monitoringDashboard: 'Panel de monitoreo', ideaGeneration: 'Generación de ideas', draftPreview: 'Vista previa del borrador', statusNeedApproval: 'Necesita aprobación', statusApprovedRender: 'Aprobado para renderizar', statusRejected: 'Rechazado', statusOnHold: 'En pausa', statusInProgress: 'En progreso', statusFinalReview: 'Revisión final', statusPublished: 'Publicado', preview: 'Vista previa', approve: 'Aprobar', reject: 'Rechazar', hold: 'Pausar', approveRendering: 'Aprobar para renderizar', finalApprove: 'Aprobar MP4 final', publishReady: 'Listo para paquete de publicación', metadata: 'Metadatos', hook: 'Gancho', niche: 'Nicho', hero: 'Héroe', format: 'Formato', quality: 'Calidad', platforms: 'Plataformas', monetization: 'Monetización', analytics: 'Analíticas', views: 'Vistas', clicks: 'Clics', comments: 'Comentarios', engagement: 'Interacción', revenue: 'Ingresos', noRenderedVideo: 'El MP4 renderizado aparecerá aquí cuando el worker termine.' }

const pt: VideoWorkflowCopy = { ...en,
  pageEyebrow: 'Fluxo de campanha de vídeo COSA', pageTitle: 'Da ideia à campanha publicada', pageIntro: 'COSA propõe, você aprova, o renderizador cria o MP4 e os vídeos publicados retornam com dados de desempenho.',
  leftPanelTitle: 'Fila de campanhas', centerPanelTitle: 'Prévia + ações', rightPanelTitle: 'Metadados da campanha', bottomPanelTitle: 'Publicação + análises', approvalQueue: 'Fila de aprovação', renderingStage: 'Etapa de renderização', publishingStage: 'Etapa de publicação', monitoringDashboard: 'Painel de monitoramento', ideaGeneration: 'Geração de ideias', draftPreview: 'Prévia do rascunho', statusNeedApproval: 'Precisa de aprovação', statusApprovedRender: 'Aprovado para renderizar', statusRejected: 'Rejeitado', statusOnHold: 'Em espera', statusInProgress: 'Em progresso', statusFinalReview: 'Revisão final', statusPublished: 'Publicado', preview: 'Prévia', approve: 'Aprovar', reject: 'Rejeitar', hold: 'Pausar', approveRendering: 'Aprovar para renderizar', finalApprove: 'Aprovar MP4 final', publishReady: 'Pronto para pacote de publicação', metadata: 'Metadados', hook: 'Gancho', niche: 'Nicho', hero: 'Herói', format: 'Formato', quality: 'Qualidade', platforms: 'Plataformas', monetization: 'Monetização', analytics: 'Análises', views: 'Visualizações', clicks: 'Cliques', comments: 'Comentários', engagement: 'Engajamento', revenue: 'Receita', noRenderedVideo: 'O MP4 renderizado aparecerá aqui quando o worker terminar.' }

const pl: VideoWorkflowCopy = { ...en,
  pageEyebrow: 'Przepływ kampanii wideo COSA', pageTitle: 'Od pomysłu do opublikowanej kampanii', pageIntro: 'COSA proponuje, Ty zatwierdzasz, renderer tworzy MP4, a opublikowane wideo wraca z danymi wyników.',
  leftPanelTitle: 'Kolejka kampanii', centerPanelTitle: 'Podgląd + działania', rightPanelTitle: 'Metadane kampanii', bottomPanelTitle: 'Publikacja + analityka', approvalQueue: 'Kolejka akceptacji', renderingStage: 'Etap renderowania', publishingStage: 'Etap publikacji', monitoringDashboard: 'Panel monitoringu', ideaGeneration: 'Generowanie pomysłów', draftPreview: 'Podgląd szkicu', statusNeedApproval: 'Wymaga akceptacji', statusApprovedRender: 'Zatwierdzone do renderu', statusRejected: 'Odrzucone', statusOnHold: 'Wstrzymane', statusInProgress: 'W toku', statusFinalReview: 'Końcowa akceptacja', statusPublished: 'Opublikowane', preview: 'Podgląd', approve: 'Zatwierdź', reject: 'Odrzuć', hold: 'Wstrzymaj', approveRendering: 'Zatwierdź render', finalApprove: 'Zatwierdź finalny MP4', publishReady: 'Gotowe do pakietu publikacji', metadata: 'Metadane', hook: 'Hak', niche: 'Nisza', hero: 'Bohater', format: 'Format', quality: 'Jakość', platforms: 'Platformy', monetization: 'Monetyzacja', analytics: 'Analityka', views: 'Wyświetlenia', clicks: 'Kliknięcia', comments: 'Komentarze', engagement: 'Zaangażowanie', revenue: 'Przychód', noRenderedVideo: 'Wyrenderowany MP4 pojawi się tutaj po zakończeniu pracy workera.' }

const ru: VideoWorkflowCopy = { ...en,
  pageEyebrow: 'Процесс видеокампании COSA', pageTitle: 'От идеи до опубликованной кампании', pageIntro: 'COSA предлагает, вы утверждаете, рендерер создает MP4, а опубликованные видео возвращаются с данными эффективности.',
  leftPanelTitle: 'Очередь кампаний', centerPanelTitle: 'Предпросмотр + действия', rightPanelTitle: 'Метаданные кампании', bottomPanelTitle: 'Публикация + аналитика', approvalQueue: 'Очередь утверждения', renderingStage: 'Этап рендера', publishingStage: 'Этап публикации', monitoringDashboard: 'Панель мониторинга', ideaGeneration: 'Генерация идеи', draftPreview: 'Черновой предпросмотр', statusNeedApproval: 'Нужно утвердить', statusApprovedRender: 'Утверждено для рендера', statusRejected: 'Отклонено', statusOnHold: 'На паузе', statusInProgress: 'В работе', statusFinalReview: 'Финальная проверка', statusPublished: 'Опубликовано', preview: 'Предпросмотр', approve: 'Утвердить', reject: 'Отклонить', hold: 'Пауза', approveRendering: 'Утвердить рендер', finalApprove: 'Утвердить финальный MP4', publishReady: 'Готово для пакета публикации', metadata: 'Метаданные', hook: 'Хук', niche: 'Ниша', hero: 'Герой', format: 'Формат', quality: 'Качество', platforms: 'Платформы', monetization: 'Монетизация', analytics: 'Аналитика', views: 'Просмотры', clicks: 'Клики', comments: 'Комментарии', engagement: 'Вовлеченность', revenue: 'Доход', noRenderedVideo: 'Готовый MP4 появится здесь после завершения workera.' }

export function getVideoWorkflowCopy(lang?: string): VideoWorkflowCopy {
  if (lang?.startsWith('es')) return es
  if (lang?.startsWith('pt')) return pt
  if (lang?.startsWith('pl')) return pl
  if (lang?.startsWith('ru')) return ru
  return en
}
