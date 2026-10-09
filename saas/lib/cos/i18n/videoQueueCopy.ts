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

const de: VideoQueueCopy = { ...en,
  eyebrow: 'COSA-Video-Prüfwarteschlange', headline: 'COSA bereitet vor. Sie geben frei.', intro: 'Klicken Sie auf Vorschau und verwenden Sie dann Vorschau abspielen im rechten Bereich. Dies ist ein im Browser gerenderter Entwurf; das finale MP4-Rendering ist die nächste Worker-Stufe.', metricNeeds: 'Freigabe nötig', metricProgress: 'In Bearbeitung', metricPublished: 'Veröffentlicht', bucketNeeds: 'Benötigt Ihre Freigabe', bucketProgress: 'In Bearbeitung — keine Aktion nötig', bucketPublished: 'Veröffentlicht', empty: 'Derzeit ist hier nichts.', preview: 'Vorschau', reject: 'Ablehnen', approve: 'Freigeben', approveRender: 'Zum Rendern freigeben', playablePreview: 'Abspielbare Vorschau', hookLabel: 'Hook', nicheLabel: 'Nische', formatLabel: 'Format', heroLabel: 'Hauptfigur', qualityLabel: 'Qualität', statusNeeds: 'Wartet auf Freigabe', statusProgress: 'In Bearbeitung', statusPublished: 'Veröffentlicht', statusRejected: 'Abgelehnt', playPreview: 'Vorschau abspielen', pausePreview: 'Vorschau pausieren', nextScene: 'Nächste Szene', sceneLabel: 'Szene',
  items: [
    { id: 'site-trust-short', title: '3 Vertrauens-Verbesserungen für die Website eines Kleinunternehmens', aspect: '9:16', duration: '0:48', niche: 'KMU-Vertrauen', format: 'Kurzvideo', hero: 'Tour ohne Gesicht', quality: 84, status: 'needs_approval', hook: 'Ich habe auf dieser Website in 60 Sekunden 3 einfache Vertrauens-Verbesserungen gefunden.', funnel: 'Führt zum kostenlosen Website-Check.', scenes: ['Mit einer Scan-Animation beginnen.', 'Drei Verbesserungskarten zeigen.', 'Den Scan in eine Checkliste verwandeln.', 'Mit dem CTA zum kostenlosen Check abschließen.'] },
    { id: 'platform-tour', title: 'Lernen Sie Boost kennen — geführte Tour durch SignalBoost', aspect: '16:9', duration: '2:10', niche: 'Plattform-Promo', format: 'Tour', hero: 'Maskottchen', quality: 71, status: 'needs_approval', hook: 'Eine Plattform: Websites, Bewertungen, Audio, Video und Freigaben.', funnel: 'Kanal-Trailer für die Plattform.', scenes: ['Boost stellt die Plattform vor.', 'Tour durch Websites und Bewertungen.', 'Freigaben zeigen.', 'Mit der Plattform-URL abschließen.'] },
    { id: 'reviews-short', title: 'Bewertungs-Schwungrad für lokale Kliniken', aspect: '9:16', duration: '0:32', niche: 'lokale Kliniken', format: 'Kurzvideo', hero: 'sprechender Guide', quality: 79, status: 'in_progress', progress: 'wird gerendert', hook: 'Ihre Bewertungen können zu den Inhalten Ihrer nächsten Woche werden.', funnel: 'Bewirbt den Workflow von Bewertungen zu Inhalten.', scenes: ['Die Bewertung gelangt in SignalBoost.', 'COSA erstellt Inhalte.', 'Die Klinik erhält Markenbeiträge.'] },
    { id: 'customer-loss', title: 'Warum Kleinunternehmen Kunden verlieren', aspect: '9:16', duration: '0:56', niche: 'Unternehmenswachstum', format: 'Lern-Kurzvideo', hero: 'Dashboard-Tour', quality: 82, status: 'published', hook: 'Die meisten Kunden gehen, bevor sie sich beschweren.', funnel: 'Aufmerksamkeits-Content für Bewertungstools.', scenes: ['Reibungspunkte der Kunden zeigen.', 'Bewertungen und Vertrauen verbinden.', 'Mit einem Check-CTA abschließen.'] },
  ],
}

const fr: VideoQueueCopy = { ...en,
  eyebrow: 'File de validation vidéo COSA', headline: 'COSA prépare. Vous approuvez.', intro: 'Cliquez sur Aperçu, puis utilisez Lire l’aperçu dans le panneau de droite. Il s’agit d’un brouillon rendu dans le navigateur ; le rendu MP4 final est la prochaine étape du worker.', metricNeeds: 'À approuver', metricProgress: 'En cours', metricPublished: 'Publiées', bucketNeeds: 'En attente de votre approbation', bucketProgress: 'En cours — aucune action requise', bucketPublished: 'Publiées', empty: 'Rien ici pour le moment.', preview: 'Aperçu', reject: 'Rejeter', approve: 'Approuver', approveRender: 'Approuver pour le rendu', playablePreview: 'Aperçu lisible', hookLabel: 'Accroche', nicheLabel: 'niche', formatLabel: 'format', heroLabel: 'héros', qualityLabel: 'qualité', statusNeeds: 'En attente d’approbation', statusProgress: 'En cours', statusPublished: 'Publiée', statusRejected: 'Rejetée', playPreview: 'Lire l’aperçu', pausePreview: 'Mettre l’aperçu en pause', nextScene: 'Scène suivante', sceneLabel: 'Scène',
  items: [
    { id: 'site-trust-short', title: '3 améliorations de confiance pour le site d’une petite entreprise', aspect: '9:16', duration: '0:48', niche: 'confiance PME', format: 'court', hero: 'visite sans visage', quality: 84, status: 'needs_approval', hook: 'J’ai trouvé 3 améliorations de confiance simples sur ce site en 60 secondes.', funnel: 'Mène vers l’audit gratuit du site web.', scenes: ['Ouvrir sur une animation de scan.', 'Montrer trois cartes d’amélioration.', 'Transformer le scan en liste d’actions.', 'Conclure avec le CTA de l’audit gratuit.'] },
    { id: 'platform-tour', title: 'Découvrez Boost — visite guidée de SignalBoost', aspect: '16:9', duration: '2:10', niche: 'promotion de la plateforme', format: 'visite', hero: 'mascotte', quality: 71, status: 'needs_approval', hook: 'Une seule plateforme : sites web, avis, audio, vidéo et approbations.', funnel: 'Bande-annonce de chaîne pour la plateforme.', scenes: ['Boost présente la plateforme.', 'Visite des sites web et des avis.', 'Montrer les approbations.', 'Conclure avec l’URL de la plateforme.'] },
    { id: 'reviews-short', title: 'Le cercle vertueux des avis pour les cliniques locales', aspect: '9:16', duration: '0:32', niche: 'cliniques locales', format: 'court', hero: 'guide parlant', quality: 79, status: 'in_progress', progress: 'rendu en cours', hook: 'Vos avis peuvent devenir le contenu de votre semaine prochaine.', funnel: 'Promeut le flux des avis vers le contenu.', scenes: ['L’avis arrive dans SignalBoost.', 'COSA crée du contenu.', 'La clinique reçoit des publications à son image.'] },
    { id: 'customer-loss', title: 'Pourquoi les petites entreprises perdent des clients', aspect: '9:16', duration: '0:56', niche: 'croissance d’entreprise', format: 'court éducatif', hero: 'visite du tableau de bord', quality: 82, status: 'published', hook: 'La plupart des clients partent avant de se plaindre.', funnel: 'Contenu de notoriété pour les outils d’avis.', scenes: ['Montrer les frictions client.', 'Relier avis et confiance.', 'Conclure avec un CTA d’audit.'] },
  ],
}

const it: VideoQueueCopy = { ...en,
  eyebrow: 'Coda di revisione video COSA', headline: 'COSA prepara. Tu approvi.', intro: 'Clicca su Anteprima, poi usa Riproduci anteprima nel pannello di destra. È una bozza renderizzata nel browser; il rendering MP4 finale è la prossima fase del worker.', metricNeeds: 'Da approvare', metricProgress: 'In corso', metricPublished: 'Pubblicati', bucketNeeds: 'In attesa della tua approvazione', bucketProgress: 'In corso — nessuna azione richiesta', bucketPublished: 'Pubblicati', empty: 'Al momento non c’è niente qui.', preview: 'Anteprima', reject: 'Rifiuta', approve: 'Approva', approveRender: 'Approva per il rendering', playablePreview: 'Anteprima riproducibile', hookLabel: 'Gancio', nicheLabel: 'nicchia', formatLabel: 'formato', heroLabel: 'protagonista', qualityLabel: 'qualità', statusNeeds: 'In attesa di approvazione', statusProgress: 'In corso', statusPublished: 'Pubblicato', statusRejected: 'Rifiutato', playPreview: 'Riproduci anteprima', pausePreview: 'Metti in pausa l’anteprima', nextScene: 'Scena successiva', sceneLabel: 'Scena',
  items: [
    { id: 'site-trust-short', title: '3 miglioramenti di fiducia per il sito di una piccola impresa', aspect: '9:16', duration: '0:48', niche: 'fiducia PMI', format: 'breve', hero: 'tour senza volto', quality: 84, status: 'needs_approval', hook: 'Ho trovato 3 semplici miglioramenti di fiducia in questo sito in 60 secondi.', funnel: 'Porta al controllo gratuito del sito web.', scenes: ['Aprire con un’animazione di scansione.', 'Mostrare tre schede di miglioramento.', 'Trasformare la scansione in una checklist.', 'Chiudere con la CTA del controllo gratuito.'] },
    { id: 'platform-tour', title: 'Ecco Boost — tour guidato di SignalBoost', aspect: '16:9', duration: '2:10', niche: 'promozione della piattaforma', format: 'tour', hero: 'mascotte', quality: 71, status: 'needs_approval', hook: 'Un’unica piattaforma: siti web, recensioni, audio, video e approvazioni.', funnel: 'Trailer del canale per la piattaforma.', scenes: ['Boost presenta la piattaforma.', 'Tour di siti web e recensioni.', 'Mostrare le approvazioni.', 'Chiudere con l’URL della piattaforma.'] },
    { id: 'reviews-short', title: 'Il volano delle recensioni per le cliniche locali', aspect: '9:16', duration: '0:32', niche: 'cliniche locali', format: 'breve', hero: 'guida parlante', quality: 79, status: 'in_progress', progress: 'rendering in corso', hook: 'Le tue recensioni possono diventare i contenuti della prossima settimana.', funnel: 'Promuove il flusso dalle recensioni ai contenuti.', scenes: ['La recensione entra in SignalBoost.', 'COSA crea i contenuti.', 'La clinica riceve post con il proprio brand.'] },
    { id: 'customer-loss', title: 'Perché le piccole imprese perdono clienti', aspect: '9:16', duration: '0:56', niche: 'crescita aziendale', format: 'breve educativo', hero: 'tour della dashboard', quality: 82, status: 'published', hook: 'La maggior parte dei clienti se ne va prima di lamentarsi.', funnel: 'Contenuti di consapevolezza per gli strumenti di recensione.', scenes: ['Mostrare gli attriti del cliente.', 'Collegare recensioni e fiducia.', 'Chiudere con una CTA di controllo.'] },
  ],
}

const ja: VideoQueueCopy = { ...en,
  eyebrow: 'COSA 動画レビューキュー', headline: 'COSA が準備し、あなたが承認します。', intro: '「プレビュー」をクリックし、右側のパネルで「プレビューを再生」を使用してください。これはブラウザで描画された下書きです。最終的な MP4 レンダリングは次のワーカー段階で行われます。', metricNeeds: '承認待ち', metricProgress: '進行中', metricPublished: '公開済み', bucketNeeds: 'あなたの承認が必要です', bucketProgress: '進行中 — 操作は不要です', bucketPublished: '公開済み', empty: '現在ここには何もありません。', preview: 'プレビュー', reject: '却下', approve: '承認', approveRender: 'レンダリングを承認', playablePreview: '再生可能なプレビュー', hookLabel: 'フック', nicheLabel: 'ニッチ', formatLabel: '形式', heroLabel: '主役', qualityLabel: '品質', statusNeeds: '承認待ち', statusProgress: '進行中', statusPublished: '公開済み', statusRejected: '却下済み', playPreview: 'プレビューを再生', pausePreview: 'プレビューを一時停止', nextScene: '次のシーン', sceneLabel: 'シーン',
  items: [
    { id: 'site-trust-short', title: '小規模ビジネスのサイトの信頼性を高める3つの改善', aspect: '9:16', duration: '0:48', niche: '中小企業の信頼性', format: 'ショート', hero: '顔出しなしのツアー', quality: 84, status: 'needs_approval', hook: 'このサイトで、信頼性を高める簡単な改善を60秒で3つ見つけました。', funnel: '無料のウェブサイトチェックへ誘導します。', scenes: ['スキャンのアニメーションで始める。', '3枚の改善カードを見せる。', 'スキャン結果をチェックリストにする。', '無料チェックの CTA で締めくくる。'] },
    { id: 'platform-tour', title: 'Boost のご紹介 — SignalBoost のガイドツアー', aspect: '16:9', duration: '2:10', niche: 'プラットフォームのプロモーション', format: 'ツアー', hero: 'マスコット', quality: 71, status: 'needs_approval', hook: 'ウェブサイト、レビュー、音声、動画、承認をひとつのプラットフォームで。', funnel: 'プラットフォームのチャンネル予告編です。', scenes: ['Boost がプラットフォームを紹介する。', 'ウェブサイトとレビューを案内する。', '承認機能を見せる。', 'プラットフォームの URL で締めくくる。'] },
    { id: 'reviews-short', title: '地域クリニックのためのレビュー好循環', aspect: '9:16', duration: '0:32', niche: '地域のクリニック', format: 'ショート', hero: '話すガイド', quality: 79, status: 'in_progress', progress: 'レンダリング中', hook: 'あなたのレビューが、来週のコンテンツになります。', funnel: 'レビューからコンテンツを作るワークフローを紹介します。', scenes: ['レビューが SignalBoost に届く。', 'COSA がコンテンツを作成する。', 'クリニックにブランド投稿が届く。'] },
    { id: 'customer-loss', title: '小規模ビジネスが顧客を失う理由', aspect: '9:16', duration: '0:56', niche: 'ビジネスの成長', format: '教育系ショート', hero: 'ダッシュボードツアー', quality: 82, status: 'published', hook: 'ほとんどの顧客は、不満を言う前に去っていきます。', funnel: 'レビューツールの認知向上コンテンツです。', scenes: ['顧客が感じる不便を見せる。', 'レビューと信頼を結びつける。', 'チェックの CTA で締めくくる。'] },
  ],
}

const ko: VideoQueueCopy = { ...en,
  eyebrow: 'COSA 동영상 검토 대기열', headline: 'COSA가 준비하고, 승인은 직접 합니다.', intro: '미리보기를 클릭한 다음 오른쪽 패널에서 미리보기 재생을 사용하세요. 브라우저에서 렌더링된 초안이며, 최종 MP4 렌더링은 다음 워커 단계에서 진행됩니다.', metricNeeds: '승인 필요', metricProgress: '진행 중', metricPublished: '게시됨', bucketNeeds: '승인이 필요합니다', bucketProgress: '진행 중 — 조치 필요 없음', bucketPublished: '게시됨', empty: '지금은 여기에 아무것도 없습니다.', preview: '미리보기', reject: '거절', approve: '승인', approveRender: '렌더링 승인', playablePreview: '재생 가능한 미리보기', hookLabel: '훅', nicheLabel: '니치', formatLabel: '형식', heroLabel: '주인공', qualityLabel: '품질', statusNeeds: '승인 대기 중', statusProgress: '진행 중', statusPublished: '게시됨', statusRejected: '거절됨', playPreview: '미리보기 재생', pausePreview: '미리보기 일시정지', nextScene: '다음 장면', sceneLabel: '장면',
  items: [
    { id: 'site-trust-short', title: '소규모 비즈니스 웹사이트의 신뢰를 높이는 3가지 개선', aspect: '9:16', duration: '0:48', niche: '중소기업 신뢰', format: '쇼츠', hero: '얼굴 없는 투어', quality: 84, status: 'needs_approval', hook: '이 사이트에서 60초 만에 신뢰를 높이는 간단한 개선 3가지를 찾았습니다.', funnel: '무료 웹사이트 점검으로 연결합니다.', scenes: ['스캔 애니메이션으로 시작합니다.', '개선 카드 세 장을 보여 줍니다.', '스캔 결과를 체크리스트로 바꿉니다.', '무료 점검 CTA로 마무리합니다.'] },
    { id: 'platform-tour', title: 'Boost를 소개합니다 — SignalBoost 가이드 투어', aspect: '16:9', duration: '2:10', niche: '플랫폼 홍보', format: '투어', hero: '마스코트', quality: 71, status: 'needs_approval', hook: '웹사이트, 리뷰, 오디오, 동영상, 승인을 하나의 플랫폼에서.', funnel: '플랫폼 채널 예고편입니다.', scenes: ['Boost가 플랫폼을 소개합니다.', '웹사이트와 리뷰를 둘러봅니다.', '승인 기능을 보여 줍니다.', '플랫폼 URL로 마무리합니다.'] },
    { id: 'reviews-short', title: '지역 클리닉을 위한 리뷰 선순환', aspect: '9:16', duration: '0:32', niche: '지역 클리닉', format: '쇼츠', hero: '말하는 가이드', quality: 79, status: 'in_progress', progress: '렌더링 중', hook: '리뷰가 다음 주 콘텐츠가 될 수 있습니다.', funnel: '리뷰를 콘텐츠로 만드는 워크플로를 홍보합니다.', scenes: ['리뷰가 SignalBoost에 들어옵니다.', 'COSA가 콘텐츠를 만듭니다.', '클리닉이 브랜드 게시물을 받습니다.'] },
    { id: 'customer-loss', title: '소규모 비즈니스가 고객을 잃는 이유', aspect: '9:16', duration: '0:56', niche: '비즈니스 성장', format: '교육용 쇼츠', hero: '대시보드 투어', quality: 82, status: 'published', hook: '대부분의 고객은 불만을 말하기 전에 떠납니다.', funnel: '리뷰 도구 인지도 콘텐츠입니다.', scenes: ['고객이 겪는 불편을 보여 줍니다.', '리뷰와 신뢰를 연결합니다.', '점검 CTA로 마무리합니다.'] },
  ],
}

const ar: VideoQueueCopy = { ...en,
  eyebrow: 'قائمة مراجعة فيديوهات COSA', headline: 'COSA يُحضّر. وأنت توافق.', intro: 'انقر على معاينة، ثم استخدم تشغيل المعاينة في اللوحة اليمنى. هذه مسودة معروضة في المتصفح؛ أما عرض ملف MP4 النهائي فهو مرحلة العامل التالية.', metricNeeds: 'بحاجة إلى موافقة', metricProgress: 'قيد التنفيذ', metricPublished: 'منشورة', bucketNeeds: 'بحاجة إلى موافقتك', bucketProgress: 'قيد التنفيذ — لا يلزم أي إجراء', bucketPublished: 'منشورة', empty: 'لا يوجد شيء هنا حاليًا.', preview: 'معاينة', reject: 'رفض', approve: 'موافقة', approveRender: 'الموافقة على العرض', playablePreview: 'معاينة قابلة للتشغيل', hookLabel: 'الخطّاف', nicheLabel: 'المجال', formatLabel: 'الصيغة', heroLabel: 'البطل', qualityLabel: 'الجودة', statusNeeds: 'بانتظار الموافقة', statusProgress: 'قيد التنفيذ', statusPublished: 'منشور', statusRejected: 'مرفوض', playPreview: 'تشغيل المعاينة', pausePreview: 'إيقاف المعاينة مؤقتًا', nextScene: 'المشهد التالي', sceneLabel: 'المشهد',
  items: [
    { id: 'site-trust-short', title: '3 تحسينات للثقة في موقع شركة صغيرة', aspect: '9:16', duration: '0:48', niche: 'ثقة الشركات الصغيرة', format: 'قصير', hero: 'جولة بلا وجه', quality: 84, status: 'needs_approval', hook: 'وجدتُ 3 تحسينات بسيطة للثقة في هذا الموقع خلال 60 ثانية.', funnel: 'يوجّه إلى الفحص المجاني للموقع.', scenes: ['البدء برسوم متحركة للفحص.', 'عرض ثلاث بطاقات تحسين.', 'تحويل الفحص إلى قائمة مهام.', 'الختام بدعوة إلى الفحص المجاني.'] },
    { id: 'platform-tour', title: 'تعرّف على Boost — جولة إرشادية في SignalBoost', aspect: '16:9', duration: '2:10', niche: 'الترويج للمنصة', format: 'جولة', hero: 'التميمة', quality: 71, status: 'needs_approval', hook: 'منصة واحدة: المواقع والتقييمات والصوت والفيديو والموافقات.', funnel: 'إعلان تشويقي لقناة المنصة.', scenes: ['Boost يقدّم المنصة.', 'جولة في المواقع والتقييمات.', 'عرض الموافقات.', 'الختام برابط المنصة.'] },
    { id: 'reviews-short', title: 'دورة التقييمات للعيادات المحلية', aspect: '9:16', duration: '0:32', niche: 'العيادات المحلية', format: 'قصير', hero: 'مرشد متحدث', quality: 79, status: 'in_progress', progress: 'جارٍ العرض', hook: 'يمكن أن تصبح تقييماتك محتوى أسبوعك القادم.', funnel: 'يروّج لسير العمل من التقييمات إلى المحتوى.', scenes: ['يدخل التقييم إلى SignalBoost.', 'COSA ينشئ المحتوى.', 'تحصل العيادة على منشورات تحمل علامتها.'] },
    { id: 'customer-loss', title: 'لماذا تخسر الشركات الصغيرة عملاءها', aspect: '9:16', duration: '0:56', niche: 'نمو الأعمال', format: 'قصير تعليمي', hero: 'جولة في لوحة التحكم', quality: 82, status: 'published', hook: 'معظم العملاء يغادرون قبل أن يشتكوا.', funnel: 'محتوى توعوي لأدوات التقييمات.', scenes: ['عرض نقاط الاحتكاك لدى العميل.', 'الربط بين التقييمات والثقة.', 'الختام بدعوة إلى الفحص.'] },
  ],
}

export function getVideoQueueCopy(lang?: string): VideoQueueCopy {
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
