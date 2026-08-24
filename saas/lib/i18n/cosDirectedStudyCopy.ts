// saas/lib/i18n/cosDirectedStudyCopy.ts
export type CosDirectedStudyLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type CosDirectedStudyCopy = {
  title: string
  subtitle: string
  topic: string
  topicHint: string
  studyIntent: string
  studyIntentHint: string
  materialKind: string
  kindBook: string
  kindArticle: string
  kindVideo: string
  kindDocumentation: string
  kindOwnNotes: string
  license: string
  licenseHint: string
  sourceUri: string
  sourceUriHint: string
  sourceTitle: string
  pastedText: string
  pastedTextHint: string
  preview: string
  previewing: string
  feed: string
  feeding: string
  refresh: string
  resolvedFrom: string
  resolvedYoutube: string
  resolvedDocument: string
  resolvedPasted: string
  chunksTitle: string
  chunkAdmitted: string
  chunkRejected: string
  chunkTooShort: string
  confidence: string
  matchedTerms: string
  storedResult: string
  duplicatesResult: string
  dryRunNote: string
  historyTitle: string
  historyEmpty: string
  gateNote: string
  requestFailed: string
  ownerSessionRequired: string
  canonicalHostRequired: string
  openCanonical: string
  validationHint: string
  uploadFile: string
  uploadHint: string
  fileAttached: string
  removeFile: string
  unsupportedFile: string
}

export const COS_DIRECTED_STUDY_COPY: Record<CosDirectedStudyLanguage, CosDirectedStudyCopy> = {
  en: {
    title: 'Feed COS — Directed Study',
    subtitle: 'Hand COS a specific video, article, book chapter, or other material with a stated study intent. Your explicit owner direction establishes relevance; keyword matching is diagnostic only.',
    topic: 'Topic',
    topicHint: 'Short subject the material is about, e.g. "Portuguese literature".',
    studyIntent: 'Study intent',
    studyIntentHint: 'One line: what should COS learn from this?',
    materialKind: 'Material type',
    kindBook: 'Book / chapter',
    kindArticle: 'Article',
    kindVideo: 'Video (YouTube URL)',
    kindDocumentation: 'Official documentation',
    kindOwnNotes: 'My own notes / content',
    license: 'License declaration',
    licenseHint: 'Required. Your stated basis for retaining this material, e.g. "purchased copy, internal use", "public domain", "own content".',
    sourceUri: 'Source URL or identifier',
    sourceUriHint: 'A YouTube/article URL to fetch, or any identifier for pasted material, e.g. "owner://books/title-ch3".',
    sourceTitle: 'Title (optional)',
    pastedText: 'Pasted text (optional)',
    pastedTextHint: 'Paste the chapter or article body here. If left empty, COS fetches the URL above (YouTube transcript or readable page text).',
    preview: 'Preview admission (dry run)',
    previewing: 'Assessing…',
    feed: 'Feed COS',
    feeding: 'Feeding…',
    refresh: 'Refresh history',
    resolvedFrom: 'Material resolved from',
    resolvedYoutube: 'YouTube transcript',
    resolvedDocument: 'Fetched page text',
    resolvedPasted: 'Pasted text',
    chunksTitle: 'Per-chunk admission verdicts',
    chunkAdmitted: 'Admitted by owner direction',
    chunkRejected: 'Rejected — failed content validation',
    chunkTooShort: 'Rejected — too short',
    confidence: 'Grounding confidence',
    matchedTerms: 'Matched terms (diagnostic)',
    storedResult: 'Chunks stored',
    duplicatesResult: 'Already known (duplicates)',
    dryRunNote: 'Dry run: nothing was stored. Review the chunks, then press "Feed COS" to store the eligible material.',
    historyTitle: 'Previously fed material',
    historyEmpty: 'Nothing has been fed by hand yet.',
    gateNote: 'Owner-directed relevance policy: when you explicitly tell COS to study material, your instruction establishes relevance. COS still enforces provenance, license declaration, minimum substance, duplicate protection, and storage/safety guards. Keyword matches are diagnostic only; retrieval later decides whether the retained material is useful for a particular question.',
    requestFailed: 'Request failed.',
    ownerSessionRequired: 'Owner session is not available on this host. Sign in on the canonical SaaS site, then reopen this page.',
    canonicalHostRequired: 'Owner-only COS controls use host-scoped session cookies and must run on the canonical SaaS site.',
    openCanonical: 'Open canonical page',
    validationHint: 'Topic, study intent, material type, license, and a source URL/identifier are required. Provide pasted text or a fetchable URL.',
    uploadFile: 'Upload file (optional)',
    uploadHint: '.txt and .md load into the text box; .pdf is extracted on the server (digital PDFs only — scanned PDFs have no text layer, paste instead).',
    fileAttached: 'Attached',
    removeFile: 'Remove',
    unsupportedFile: 'Unsupported file type. Upload .txt, .md, or .pdf — or paste the text.',
  },
  es: {
    title: 'Alimentar COS — Estudio Dirigido',
    subtitle: 'Entregue a COS un video, artículo, capítulo de libro u otro material con una intención de estudio declarada. Su instrucción explícita como propietario establece la relevancia; la coincidencia de palabras clave es solo diagnóstica.',
    topic: 'Tema',
    topicHint: 'Asunto breve del material, p. ej. "literatura portuguesa".',
    studyIntent: 'Intención de estudio',
    studyIntentHint: 'Una línea: ¿qué debe aprender COS de esto?',
    materialKind: 'Tipo de material',
    kindBook: 'Libro / capítulo',
    kindArticle: 'Artículo',
    kindVideo: 'Video (URL de YouTube)',
    kindDocumentation: 'Documentación oficial',
    kindOwnNotes: 'Mis propias notas / contenido',
    license: 'Declaración de licencia',
    licenseHint: 'Obligatoria. Su base declarada para retener este material, p. ej. "copia comprada, uso interno", "dominio público", "contenido propio".',
    sourceUri: 'URL o identificador de la fuente',
    sourceUriHint: 'Una URL de YouTube/artículo para obtener, o cualquier identificador para material pegado, p. ej. "owner://books/titulo-cap3".',
    sourceTitle: 'Título (opcional)',
    pastedText: 'Texto pegado (opcional)',
    pastedTextHint: 'Pegue aquí el capítulo o el cuerpo del artículo. Si se deja vacío, COS obtiene la URL anterior (transcripción de YouTube o texto legible de la página).',
    preview: 'Previsualizar admisión (simulacro)',
    previewing: 'Evaluando…',
    feed: 'Alimentar COS',
    feeding: 'Alimentando…',
    refresh: 'Actualizar historial',
    resolvedFrom: 'Material resuelto desde',
    resolvedYoutube: 'Transcripción de YouTube',
    resolvedDocument: 'Texto de página obtenido',
    resolvedPasted: 'Texto pegado',
    chunksTitle: 'Veredictos de admisión por fragmento',
    chunkAdmitted: 'Admitido por instrucción del propietario',
    chunkRejected: 'Rechazado — falló la validación del contenido',
    chunkTooShort: 'Rechazado — demasiado corto',
    confidence: 'Confianza de fundamentación',
    matchedTerms: 'Términos coincidentes (diagnóstico)',
    storedResult: 'Fragmentos almacenados',
    duplicatesResult: 'Ya conocidos (duplicados)',
    dryRunNote: 'Simulacro: no se almacenó nada. Revise los fragmentos y luego presione "Alimentar COS" para guardar el material elegible.',
    historyTitle: 'Material alimentado previamente',
    historyEmpty: 'Todavía no se ha alimentado nada manualmente.',
    gateNote: 'Política de relevancia del estudio dirigido: cuando usted indica explícitamente a COS que estudie un material, su instrucción establece la relevancia. COS sigue aplicando procedencia, declaración de licencia, sustancia mínima, protección contra duplicados y controles de almacenamiento/seguridad. Las coincidencias de palabras clave son solo diagnósticas; la recuperación decidirá después si el material retenido sirve para una pregunta concreta.',
    requestFailed: 'La solicitud falló.',
    ownerSessionRequired: 'La sesión del propietario no está disponible en este host. Inicie sesión en el sitio SaaS canónico y vuelva a abrir esta página.',
    canonicalHostRequired: 'Los controles de COS exclusivos del propietario usan cookies de sesión limitadas al host y deben ejecutarse en el sitio SaaS canónico.',
    openCanonical: 'Abrir página canónica',
    validationHint: 'Se requieren tema, intención de estudio, tipo de material, licencia y una URL/identificador de fuente. Proporcione texto pegado o una URL accesible.',
    uploadFile: 'Subir archivo (opcional)',
    uploadHint: '.txt y .md se cargan en el cuadro de texto; .pdf se extrae en el servidor (solo PDF digitales — los escaneados no tienen capa de texto, péguelo en su lugar).',
    fileAttached: 'Adjunto',
    removeFile: 'Quitar',
    unsupportedFile: 'Tipo de archivo no compatible. Suba .txt, .md o .pdf — o pegue el texto.',
  },
  pt: {
    title: 'Alimentar o COS — Estudo Dirigido',
    subtitle: 'Entregue ao COS um vídeo, artigo, capítulo de livro ou outro material com uma intenção de estudo declarada. Sua instrução explícita como proprietário estabelece a relevância; a correspondência de palavras-chave é apenas diagnóstica.',
    topic: 'Tema',
    topicHint: 'Assunto curto do material, p. ex. "literatura portuguesa".',
    studyIntent: 'Intenção de estudo',
    studyIntentHint: 'Uma linha: o que o COS deve aprender com isto?',
    materialKind: 'Tipo de material',
    kindBook: 'Livro / capítulo',
    kindArticle: 'Artigo',
    kindVideo: 'Vídeo (URL do YouTube)',
    kindDocumentation: 'Documentação oficial',
    kindOwnNotes: 'Minhas próprias notas / conteúdo',
    license: 'Declaração de licença',
    licenseHint: 'Obrigatória. Sua base declarada para reter este material, p. ex. "cópia comprada, uso interno", "domínio público", "conteúdo próprio".',
    sourceUri: 'URL ou identificador da fonte',
    sourceUriHint: 'Uma URL de YouTube/artigo para buscar, ou qualquer identificador para material colado, p. ex. "owner://books/titulo-cap3".',
    sourceTitle: 'Título (opcional)',
    pastedText: 'Texto colado (opcional)',
    pastedTextHint: 'Cole aqui o capítulo ou o corpo do artigo. Se ficar vazio, o COS busca a URL acima (transcrição do YouTube ou texto legível da página).',
    preview: 'Prever admissão (simulação)',
    previewing: 'Avaliando…',
    feed: 'Alimentar o COS',
    feeding: 'Alimentando…',
    refresh: 'Atualizar histórico',
    resolvedFrom: 'Material resolvido de',
    resolvedYoutube: 'Transcrição do YouTube',
    resolvedDocument: 'Texto da página obtido',
    resolvedPasted: 'Texto colado',
    chunksTitle: 'Veredictos de admissão por trecho',
    chunkAdmitted: 'Admitido por instrução do proprietário',
    chunkRejected: 'Rejeitado — falhou na validação do conteúdo',
    chunkTooShort: 'Rejeitado — muito curto',
    confidence: 'Confiança de fundamentação',
    matchedTerms: 'Termos correspondentes (diagnóstico)',
    storedResult: 'Trechos armazenados',
    duplicatesResult: 'Já conhecidos (duplicados)',
    dryRunNote: 'Simulação: nada foi armazenado. Revise os trechos e pressione "Alimentar o COS" para armazenar o material elegível.',
    historyTitle: 'Material alimentado anteriormente',
    historyEmpty: 'Nada foi alimentado manualmente ainda.',
    gateNote: 'Política de relevância do estudo dirigido: quando você instrui explicitamente o COS a estudar um material, sua instrução estabelece a relevância. O COS continua aplicando proveniência, declaração de licença, conteúdo mínimo, proteção contra duplicados e controles de armazenamento/segurança. As correspondências de palavras-chave são apenas diagnósticas; a recuperação decide depois se o material retido é útil para uma pergunta específica.',
    requestFailed: 'A solicitação falhou.',
    ownerSessionRequired: 'A sessão do proprietário não está disponível neste host. Entre no site SaaS canônico e reabra esta página.',
    canonicalHostRequired: 'Os controles do COS exclusivos do proprietário usam cookies de sessão limitados ao host e devem ser executados no site SaaS canônico.',
    openCanonical: 'Abrir página canônica',
    validationHint: 'Tema, intenção de estudo, tipo de material, licença e uma URL/identificador de fonte são obrigatórios. Forneça texto colado ou uma URL acessível.',
    uploadFile: 'Enviar arquivo (opcional)',
    uploadHint: '.txt e .md carregam na caixa de texto; .pdf é extraído no servidor (apenas PDFs digitais — PDFs escaneados não têm camada de texto, cole o texto).',
    fileAttached: 'Anexado',
    removeFile: 'Remover',
    unsupportedFile: 'Tipo de arquivo não suportado. Envie .txt, .md ou .pdf — ou cole o texto.',
  },
  pl: {
    title: 'Zasil COS — Nauka Kierowana',
    subtitle: 'Przekaż COS konkretny film, artykuł, rozdział książki lub inny materiał z określonym celem nauki. Twoje wyraźne polecenie jako właściciela ustala trafność; dopasowanie słów kluczowych ma wyłącznie charakter diagnostyczny.',
    topic: 'Temat',
    topicHint: 'Krótki temat materiału, np. "literatura portugalska".',
    studyIntent: 'Cel nauki',
    studyIntentHint: 'Jedna linia: czego COS ma się z tego nauczyć?',
    materialKind: 'Rodzaj materiału',
    kindBook: 'Książka / rozdział',
    kindArticle: 'Artykuł',
    kindVideo: 'Wideo (URL YouTube)',
    kindDocumentation: 'Oficjalna dokumentacja',
    kindOwnNotes: 'Moje własne notatki / treści',
    license: 'Deklaracja licencji',
    licenseHint: 'Wymagana. Twoja zadeklarowana podstawa zachowania tego materiału, np. "zakupiona kopia, użytek wewnętrzny", "domena publiczna", "własna treść".',
    sourceUri: 'URL lub identyfikator źródła',
    sourceUriHint: 'URL YouTube/artykułu do pobrania lub dowolny identyfikator wklejonego materiału, np. "owner://books/tytul-roz3".',
    sourceTitle: 'Tytuł (opcjonalnie)',
    pastedText: 'Wklejony tekst (opcjonalnie)',
    pastedTextHint: 'Wklej tutaj rozdział lub treść artykułu. Jeśli pole pozostanie puste, COS pobierze powyższy URL (transkrypcję YouTube lub czytelny tekst strony).',
    preview: 'Podgląd przyjęcia (na sucho)',
    previewing: 'Ocenianie…',
    feed: 'Zasil COS',
    feeding: 'Zasilanie…',
    refresh: 'Odśwież historię',
    resolvedFrom: 'Materiał pozyskany z',
    resolvedYoutube: 'Transkrypcja YouTube',
    resolvedDocument: 'Pobrany tekst strony',
    resolvedPasted: 'Wklejony tekst',
    chunksTitle: 'Werdykty przyjęcia dla fragmentów',
    chunkAdmitted: 'Przyjęty na polecenie właściciela',
    chunkRejected: 'Odrzucony — nie przeszedł walidacji treści',
    chunkTooShort: 'Odrzucony — zbyt krótki',
    confidence: 'Pewność ugruntowania',
    matchedTerms: 'Dopasowane terminy (diagnostyka)',
    storedResult: 'Zapisane fragmenty',
    duplicatesResult: 'Już znane (duplikaty)',
    dryRunNote: 'Próba na sucho: nic nie zostało zapisane. Przejrzyj fragmenty, a następnie naciśnij "Zasil COS", aby zapisać kwalifikujący się materiał.',
    historyTitle: 'Wcześniej przekazany materiał',
    historyEmpty: 'Nic nie zostało jeszcze przekazane ręcznie.',
    gateNote: 'Polityka trafności nauki kierowanej: gdy wyraźnie polecasz COS przestudiowanie materiału, Twoje polecenie ustala jego trafność. COS nadal egzekwuje pochodzenie, deklarację licencji, minimalną zawartość, ochronę przed duplikatami oraz zabezpieczenia przechowywania/bezpieczeństwa. Dopasowania słów kluczowych są wyłącznie diagnostyczne; późniejsze wyszukiwanie decyduje, czy zachowany materiał jest użyteczny dla konkretnego pytania.',
    requestFailed: 'Żądanie nie powiodło się.',
    ownerSessionRequired: 'Sesja właściciela nie jest dostępna na tym hoście. Zaloguj się w kanonicznej witrynie SaaS i otwórz tę stronę ponownie.',
    canonicalHostRequired: 'Kontrolki COS dostępne tylko dla właściciela używają ciasteczek sesyjnych przypisanych do hosta i muszą działać w kanonicznej witrynie SaaS.',
    openCanonical: 'Otwórz stronę kanoniczną',
    validationHint: 'Wymagane są: temat, cel nauki, rodzaj materiału, licencja oraz URL/identyfikator źródła. Podaj wklejony tekst lub osiągalny URL.',
    uploadFile: 'Prześlij plik (opcjonalnie)',
    uploadHint: '.txt i .md ładują się do pola tekstowego; .pdf jest ekstrahowany na serwerze (tylko cyfrowe PDF-y — skany nie mają warstwy tekstu, wklej tekst).',
    fileAttached: 'Załączono',
    removeFile: 'Usuń',
    unsupportedFile: 'Nieobsługiwany typ pliku. Prześlij .txt, .md lub .pdf — albo wklej tekst.',
  },
  ru: {
    title: 'Обучить COS — Направленное изучение',
    subtitle: 'Передайте COS конкретное видео, статью, главу книги или другой материал с указанной целью изучения. Ваше явное указание как владельца устанавливает релевантность; совпадение ключевых слов используется только для диагностики.',
    topic: 'Тема',
    topicHint: 'Краткая тема материала, например «португальская литература».',
    studyIntent: 'Цель изучения',
    studyIntentHint: 'Одной строкой: чему COS должен научиться из этого?',
    materialKind: 'Тип материала',
    kindBook: 'Книга / глава',
    kindArticle: 'Статья',
    kindVideo: 'Видео (URL YouTube)',
    kindDocumentation: 'Официальная документация',
    kindOwnNotes: 'Мои собственные заметки / материалы',
    license: 'Декларация лицензии',
    licenseHint: 'Обязательно. Укажите основание для хранения материала, например «купленная копия, внутреннее использование», «общественное достояние», «собственный материал».',
    sourceUri: 'URL или идентификатор источника',
    sourceUriHint: 'URL YouTube/статьи для загрузки или любой идентификатор вставленного материала, например «owner://books/title-ch3».',
    sourceTitle: 'Название (необязательно)',
    pastedText: 'Вставленный текст (необязательно)',
    pastedTextHint: 'Вставьте сюда главу или текст статьи. Если поле пустое, COS загрузит URL выше (транскрипт YouTube или читаемый текст страницы).',
    preview: 'Предварительный просмотр (без сохранения)',
    previewing: 'Проверка…',
    feed: 'Обучить COS',
    feeding: 'Загрузка…',
    refresh: 'Обновить историю',
    resolvedFrom: 'Источник материала',
    resolvedYoutube: 'Транскрипт YouTube',
    resolvedDocument: 'Загруженный текст страницы',
    resolvedPasted: 'Вставленный текст',
    chunksTitle: 'Результаты по фрагментам',
    chunkAdmitted: 'Принят по указанию владельца',
    chunkRejected: 'Отклонён — не прошёл проверку содержимого',
    chunkTooShort: 'Отклонён — слишком короткий',
    confidence: 'Уверенность в обоснованности',
    matchedTerms: 'Совпавшие термины (диагностика)',
    storedResult: 'Сохранено фрагментов',
    duplicatesResult: 'Уже известно (дубликаты)',
    dryRunNote: 'Пробный запуск: ничего не сохранено. Просмотрите фрагменты, затем нажмите «Обучить COS», чтобы сохранить подходящий материал.',
    historyTitle: 'Ранее добавленные материалы',
    historyEmpty: 'Материалы вручную ещё не добавлялись.',
    gateNote: 'Политика релевантности направленного изучения: когда вы явно поручаете COS изучить материал, ваше указание устанавливает его релевантность. COS по-прежнему проверяет происхождение, декларацию лицензии, минимальный объём, дубликаты и правила хранения/безопасности. Совпадения ключевых слов используются только для диагностики; при последующем поиске определяется, полезен ли сохранённый материал для конкретного вопроса.',
    requestFailed: 'Запрос не выполнен.',
    ownerSessionRequired: 'Сеанс владельца недоступен на этом хосте. Войдите на каноническом SaaS-сайте и снова откройте эту страницу.',
    canonicalHostRequired: 'Элементы управления COS только для владельца используют привязанные к хосту cookie сеанса и должны работать на каноническом SaaS-сайте.',
    openCanonical: 'Открыть каноническую страницу',
    validationHint: 'Требуются тема, цель изучения, тип материала, лицензия и URL/идентификатор источника. Вставьте текст или укажите доступный URL.',
    uploadFile: 'Загрузить файл (необязательно)',
    uploadHint: '.txt и .md загружаются в текстовое поле; .pdf извлекается на сервере (только цифровые PDF — у сканов нет текстового слоя, вставьте текст вручную).',
    fileAttached: 'Прикреплён',
    removeFile: 'Удалить',
    unsupportedFile: 'Неподдерживаемый тип файла. Загрузите .txt, .md или .pdf — либо вставьте текст.',
  },
}
