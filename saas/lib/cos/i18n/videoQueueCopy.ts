export type VideoQueueStatus = 'needs_approval' | 'in_progress' | 'published' | 'rejected'

export type VideoQueueItemCopy = {
  id: string
  title: string
  aspect: string
  duration: string
  niche: string
  format: string
  hero: string
  quality: number
  status: VideoQueueStatus
  progress?: string
  hook: string
  funnel: string
  scenes: string[]
}

export type VideoQueueCopy = {
  eyebrow: string
  headline: string
  intro: string
  metricNeeds: string
  metricProgress: string
  metricPublished: string
  bucketNeeds: string
  bucketProgress: string
  bucketPublished: string
  empty: string
  preview: string
  reject: string
  approve: string
  approveRender: string
  playablePreview: string
  hookLabel: string
  nicheLabel: string
  formatLabel: string
  heroLabel: string
  qualityLabel: string
  statusNeeds: string
  statusProgress: string
  statusPublished: string
  statusRejected: string
  playPreview: string
  pausePreview: string
  nextScene: string
  sceneLabel: string
  items: VideoQueueItemCopy[]
}

const en: VideoQueueCopy = {
  eyebrow: 'COSA Video Review Queue',
  headline: 'COSA prepares. You approve.',
  intro: 'Click Preview, then use Play preview in the right panel. This is a browser-rendered draft; final MP4 rendering is the next worker stage.',
  metricNeeds: 'Need approval', metricProgress: 'In progress', metricPublished: 'Published',
  bucketNeeds: 'Needs your approval', bucketProgress: 'In progress — no action needed', bucketPublished: 'Published',
  empty: 'Nothing here right now.', preview: 'Preview', reject: 'Reject', approve: 'Approve', approveRender: 'Approve for rendering', playablePreview: 'Playable preview',
  hookLabel: 'Hook', nicheLabel: 'niche', formatLabel: 'format', heroLabel: 'hero', qualityLabel: 'quality',
  statusNeeds: 'Waiting approval', statusProgress: 'In progress', statusPublished: 'Published', statusRejected: 'Rejected',
  playPreview: 'Play preview', pausePreview: 'Pause preview', nextScene: 'Next scene', sceneLabel: 'Scene',
  items: [
    { id: 'site-trust-short', title: '3 website trust fixes for a small business', aspect: '9:16', duration: '0:48', niche: 'SMB trust', format: 'short', hero: 'faceless tour', quality: 84, status: 'needs_approval', hook: 'I found 3 simple trust fixes in this site in 60 seconds.', funnel: 'Funnels to the free website check.', scenes: ['Open with a scan animation.', 'Show three improvement cards.', 'Turn the scan into a checklist.', 'Close with the free check CTA.'] },
    { id: 'platform-tour', title: 'Meet Boost — guided tour of SignalBoost', aspect: '16:9', duration: '2:10', niche: 'platform promo', format: 'tour', hero: 'mascot', quality: 71, status: 'needs_approval', hook: 'One platform: websites, reviews, audio, video, and approvals.', funnel: 'Channel trailer for the platform.', scenes: ['Boost introduces the platform.', 'Tour websites and reviews.', 'Show approvals.', 'Close with the platform URL.'] },
    { id: 'reviews-short', title: 'Reviews flywheel for local clinics', aspect: '9:16', duration: '0:32', niche: 'local clinics', format: 'short', hero: 'talking guide', quality: 79, status: 'in_progress', progress: 'rendering', hook: 'Your reviews can become your next week of content.', funnel: 'Promotes review-to-content workflow.', scenes: ['Review enters SignalBoost.', 'COSA creates content.', 'Clinic gets branded posts.'] },
    { id: 'customer-loss', title: 'Why small businesses lose customers', aspect: '9:16', duration: '0:56', niche: 'business growth', format: 'educational short', hero: 'dashboard tour', quality: 82, status: 'published', hook: 'Most customers leave before they complain.', funnel: 'Awareness content for review tools.', scenes: ['Show customer friction.', 'Connect reviews and trust.', 'Close with a check CTA.'] },
  ],
}

const es: VideoQueueCopy = { ...en,
  eyebrow: 'Cola de revisión de video COSA', headline: 'COSA prepara. Tú apruebas.', intro: 'Haz clic en Vista previa y luego usa Reproducir vista previa en el panel derecho. Es un borrador renderizado en el navegador; el MP4 final es la siguiente etapa.',
  metricNeeds: 'Necesitan aprobación', metricProgress: 'En progreso', metricPublished: 'Publicados', bucketNeeds: 'Necesitan tu aprobación', bucketProgress: 'En progreso — no requiere acción', bucketPublished: 'Publicados',
  empty: 'No hay nada aquí ahora.', preview: 'Vista previa', reject: 'Rechazar', approve: 'Aprobar', approveRender: 'Aprobar para renderizar', playablePreview: 'Vista previa reproducible',
  hookLabel: 'Gancho', nicheLabel: 'nicho', formatLabel: 'formato', heroLabel: 'héroe', qualityLabel: 'calidad', statusNeeds: 'Esperando aprobación', statusProgress: 'En progreso', statusPublished: 'Publicado', statusRejected: 'Rechazado', playPreview: 'Reproducir vista previa', pausePreview: 'Pausar vista previa', nextScene: 'Siguiente escena', sceneLabel: 'Escena',
  items: [
    { id: 'site-trust-short', title: '3 mejoras de confianza para un sitio de pequeño negocio', aspect: '9:16', duration: '0:48', niche: 'confianza SMB', format: 'corto', hero: 'tour sin rostro', quality: 84, status: 'needs_approval', hook: 'Encontré 3 mejoras simples de confianza en este sitio en 60 segundos.', funnel: 'Dirige al chequeo gratuito del sitio web.', scenes: ['Abrir con una animación de escaneo.', 'Mostrar tres tarjetas de mejora.', 'Convertir el escaneo en una lista de acciones.', 'Cerrar con el CTA del chequeo gratuito.'] },
    { id: 'platform-tour', title: 'Conoce a Boost — tour guiado de SignalBoost', aspect: '16:9', duration: '2:10', niche: 'promoción de plataforma', format: 'tour', hero: 'mascota', quality: 71, status: 'needs_approval', hook: 'Una plataforma: sitios web, reseñas, audio, video y aprobaciones.', funnel: 'Tráiler de canal para la plataforma.', scenes: ['Boost presenta la plataforma.', 'Tour de sitios web y reseñas.', 'Mostrar aprobaciones.', 'Cerrar con la URL de la plataforma.'] },
    { id: 'reviews-short', title: 'Rueda de reseñas para clínicas locales', aspect: '9:16', duration: '0:32', niche: 'clínicas locales', format: 'corto', hero: 'guía hablante', quality: 79, status: 'in_progress', progress: 'renderizando', hook: 'Tus reseñas pueden convertirse en el contenido de la próxima semana.', funnel: 'Promueve el flujo de reseñas a contenido.', scenes: ['La reseña entra a SignalBoost.', 'COSA crea contenido.', 'La clínica recibe publicaciones de marca.'] },
    { id: 'customer-loss', title: 'Por qué los pequeños negocios pierden clientes', aspect: '9:16', duration: '0:56', niche: 'crecimiento empresarial', format: 'corto educativo', hero: 'tour del panel', quality: 82, status: 'published', hook: 'La mayoría de los clientes se van antes de quejarse.', funnel: 'Contenido de conocimiento para herramientas de reseñas.', scenes: ['Mostrar fricción del cliente.', 'Conectar reseñas y confianza.', 'Cerrar con un CTA de chequeo.'] },
  ],
}

const pt: VideoQueueCopy = { ...en,
  eyebrow: 'Fila de revisão de vídeo COSA', headline: 'COSA prepara. Você aprova.', intro: 'Clique em Prévia e depois use Reproduzir prévia no painel direito. Este é um rascunho renderizado no navegador; o MP4 final é a próxima etapa.',
  metricNeeds: 'Precisam de aprovação', metricProgress: 'Em progresso', metricPublished: 'Publicados', bucketNeeds: 'Precisam da sua aprovação', bucketProgress: 'Em progresso — sem ação necessária', bucketPublished: 'Publicados',
  empty: 'Nada aqui no momento.', preview: 'Prévia', reject: 'Rejeitar', approve: 'Aprovar', approveRender: 'Aprovar para renderizar', playablePreview: 'Prévia reproduzível',
  hookLabel: 'Gancho', nicheLabel: 'nicho', formatLabel: 'formato', heroLabel: 'herói', qualityLabel: 'qualidade', statusNeeds: 'Aguardando aprovação', statusProgress: 'Em progresso', statusPublished: 'Publicado', statusRejected: 'Rejeitado', playPreview: 'Reproduzir prévia', pausePreview: 'Pausar prévia', nextScene: 'Próxima cena', sceneLabel: 'Cena',
  items: [
    { id: 'site-trust-short', title: '3 melhorias de confiança para um site de pequeno negócio', aspect: '9:16', duration: '0:48', niche: 'confiança SMB', format: 'curto', hero: 'tour sem rosto', quality: 84, status: 'needs_approval', hook: 'Encontrei 3 melhorias simples de confiança neste site em 60 segundos.', funnel: 'Leva para a verificação gratuita do site.', scenes: ['Abrir com uma animação de escaneamento.', 'Mostrar três cartões de melhoria.', 'Transformar o escaneamento em uma lista de ações.', 'Fechar com o CTA da verificação gratuita.'] },
    { id: 'platform-tour', title: 'Conheça o Boost — tour guiado do SignalBoost', aspect: '16:9', duration: '2:10', niche: 'promoção da plataforma', format: 'tour', hero: 'mascote', quality: 71, status: 'needs_approval', hook: 'Uma plataforma: sites, avaliações, áudio, vídeo e aprovações.', funnel: 'Trailer de canal para a plataforma.', scenes: ['Boost apresenta a plataforma.', 'Tour por sites e avaliações.', 'Mostrar aprovações.', 'Fechar com a URL da plataforma.'] },
    { id: 'reviews-short', title: 'Ciclo de avaliações para clínicas locais', aspect: '9:16', duration: '0:32', niche: 'clínicas locais', format: 'curto', hero: 'guia falante', quality: 79, status: 'in_progress', progress: 'renderizando', hook: 'Suas avaliações podem virar o conteúdo da próxima semana.', funnel: 'Promove o fluxo de avaliações para conteúdo.', scenes: ['A avaliação entra no SignalBoost.', 'COSA cria conteúdo.', 'A clínica recebe posts de marca.'] },
    { id: 'customer-loss', title: 'Por que pequenos negócios perdem clientes', aspect: '9:16', duration: '0:56', niche: 'crescimento empresarial', format: 'curto educativo', hero: 'tour do painel', quality: 82, status: 'published', hook: 'A maioria dos clientes vai embora antes de reclamar.', funnel: 'Conteúdo de conscientização para ferramentas de avaliação.', scenes: ['Mostrar atritos do cliente.', 'Conectar avaliações e confiança.', 'Fechar com um CTA de verificação.'] },
  ],
}

const pl: VideoQueueCopy = { ...en,
  eyebrow: 'Kolejka wideo COSA', headline: 'COSA przygotowuje. Ty zatwierdzasz.', intro: 'Kliknij Podgląd, potem użyj Odtwórz podgląd w prawym panelu. To szkic renderowany w przeglądarce; finalne MP4 to kolejny etap.', metricNeeds: 'Do zatwierdzenia', metricProgress: 'W toku', metricPublished: 'Opublikowane', bucketNeeds: 'Wymaga Twojej zgody', bucketProgress: 'W toku — bez działania', bucketPublished: 'Opublikowane', empty: 'Na razie nic tu nie ma.', preview: 'Podgląd', reject: 'Odrzuć', approve: 'Zatwierdź', approveRender: 'Zatwierdź render', playablePreview: 'Odtwarzalny podgląd', hookLabel: 'Hak', nicheLabel: 'nisza', formatLabel: 'format', heroLabel: 'bohater', qualityLabel: 'jakość', statusNeeds: 'Czeka na zatwierdzenie', statusProgress: 'W toku', statusPublished: 'Opublikowane', statusRejected: 'Odrzucone', playPreview: 'Odtwórz podgląd', pausePreview: 'Pauza podglądu', nextScene: 'Następna scena', sceneLabel: 'Scena',
  items: [
    { id: 'site-trust-short', title: '3 poprawki zaufania dla strony małej firmy', aspect: '9:16', duration: '0:48', niche: 'zaufanie SMB', format: 'krótkie wideo', hero: 'prezentacja bez twarzy', quality: 84, status: 'needs_approval', hook: 'Znalazłem 3 proste poprawki zaufania na tej stronie w 60 sekund.', funnel: 'Prowadzi do darmowego sprawdzenia strony.', scenes: ['Otwarcie animacją skanu.', 'Pokazanie trzech kart poprawy.', 'Zamiana skanu w listę działań.', 'Zakończenie CTA darmowego sprawdzenia.'] },
    { id: 'platform-tour', title: 'Poznaj Boost — przewodnik po SignalBoost', aspect: '16:9', duration: '2:10', niche: 'promocja platformy', format: 'prezentacja', hero: 'maskotka', quality: 71, status: 'needs_approval', hook: 'Jedna platforma: strony, opinie, audio, wideo i zatwierdzenia.', funnel: 'Zwiastun kanału dla platformy.', scenes: ['Boost przedstawia platformę.', 'Prezentacja stron i opinii.', 'Pokaz zatwierdzeń.', 'Zakończenie adresem platformy.'] },
    { id: 'reviews-short', title: 'Koło zamachowe opinii dla lokalnych klinik', aspect: '9:16', duration: '0:32', niche: 'lokalne kliniki', format: 'krótkie wideo', hero: 'mówiący przewodnik', quality: 79, status: 'in_progress', progress: 'renderowanie', hook: 'Twoje opinie mogą stać się treścią na kolejny tydzień.', funnel: 'Promuje przepływ od opinii do treści.', scenes: ['Opinia trafia do SignalBoost.', 'COSA tworzy treść.', 'Klinika otrzymuje posty marki.'] },
    { id: 'customer-loss', title: 'Dlaczego małe firmy tracą klientów', aspect: '9:16', duration: '0:56', niche: 'wzrost biznesu', format: 'krótkie edukacyjne', hero: 'prezentacja panelu', quality: 82, status: 'published', hook: 'Większość klientów odchodzi, zanim złoży skargę.', funnel: 'Treść edukacyjna dla narzędzi opinii.', scenes: ['Pokaz tarć klienta.', 'Połączenie opinii i zaufania.', 'Zakończenie CTA sprawdzenia.'] },
  ],
}

const ru: VideoQueueCopy = { ...en,
  eyebrow: 'Очередь проверки видео COSA', headline: 'COSA готовит. Вы утверждаете.', intro: 'Нажмите Предпросмотр, затем Воспроизвести предпросмотр справа. Это черновик в браузере; финальный MP4 — следующий этап.', metricNeeds: 'Нужно утвердить', metricProgress: 'В работе', metricPublished: 'Опубликовано', bucketNeeds: 'Нужно ваше утверждение', bucketProgress: 'В работе — действий не нужно', bucketPublished: 'Опубликовано', empty: 'Сейчас здесь ничего нет.', preview: 'Предпросмотр', reject: 'Отклонить', approve: 'Утвердить', approveRender: 'Утвердить рендер', playablePreview: 'Воспроизводимый предпросмотр', hookLabel: 'Хук', nicheLabel: 'ниша', formatLabel: 'формат', heroLabel: 'герой', qualityLabel: 'качество', statusNeeds: 'Ожидает утверждения', statusProgress: 'В работе', statusPublished: 'Опубликовано', statusRejected: 'Отклонено', playPreview: 'Воспроизвести', pausePreview: 'Пауза', nextScene: 'Следующая сцена', sceneLabel: 'Сцена',
  items: [
    { id: 'site-trust-short', title: '3 улучшения доверия для сайта малого бизнеса', aspect: '9:16', duration: '0:48', niche: 'доверие SMB', format: 'короткое видео', hero: 'тур без ведущего', quality: 84, status: 'needs_approval', hook: 'Я нашел 3 простых улучшения доверия на этом сайте за 60 секунд.', funnel: 'Ведет к бесплатной проверке сайта.', scenes: ['Открыть анимацией сканирования.', 'Показать три карточки улучшений.', 'Превратить скан в список действий.', 'Закрыть CTA бесплатной проверки.'] },
    { id: 'platform-tour', title: 'Знакомьтесь, Boost — тур по SignalBoost', aspect: '16:9', duration: '2:10', niche: 'промо платформы', format: 'тур', hero: 'маскот', quality: 71, status: 'needs_approval', hook: 'Одна платформа: сайты, отзывы, аудио, видео и утверждения.', funnel: 'Трейлер канала для платформы.', scenes: ['Boost представляет платформу.', 'Тур по сайтам и отзывам.', 'Показать утверждения.', 'Закрыть URL платформы.'] },
    { id: 'reviews-short', title: 'Маховик отзывов для местных клиник', aspect: '9:16', duration: '0:32', niche: 'местные клиники', format: 'короткое видео', hero: 'говорящий гид', quality: 79, status: 'in_progress', progress: 'рендеринг', hook: 'Ваши отзывы могут стать контентом на следующую неделю.', funnel: 'Продвигает поток от отзывов к контенту.', scenes: ['Отзыв попадает в SignalBoost.', 'COSA создает контент.', 'Клиника получает брендированные посты.'] },
    { id: 'customer-loss', title: 'Почему малые компании теряют клиентов', aspect: '9:16', duration: '0:56', niche: 'рост бизнеса', format: 'обучающее короткое видео', hero: 'тур по панели', quality: 82, status: 'published', hook: 'Большинство клиентов уходят до того, как пожалуются.', funnel: 'Обучающий контент для инструментов отзывов.', scenes: ['Показать точки трения клиента.', 'Связать отзывы и доверие.', 'Закрыть CTA проверки.'] },
  ],
}

export function getVideoQueueCopy(lang?: string): VideoQueueCopy {
  if (lang?.startsWith('es')) return es
  if (lang?.startsWith('pt')) return pt
  if (lang?.startsWith('pl')) return pl
  if (lang?.startsWith('ru')) return ru
  return en
}
