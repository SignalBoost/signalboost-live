export type OutreachLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type OutreachChannelKey =
  | 'email'
  | 'social'
  | 'video'
  | 'onlinePress'
  | 'printPress'
  | 'tradePress'
  | 'manual'

type OutreachChannelCopy = {
  label: string
  description: string
}

export type OutreachHubCopy = {
  navLabel: string
  eyebrow: string
  title: string
  subtitle: string
  definition: string
  approvalNotice: string
  aiModeTitle: string
  aiModeBody: string
  aiModePromptLabel: string
  aiModePrompt: string
  aiModeCta: string
  manualModeTitle: string
  manualModeBody: string
  manualModeCta: string
  workflowTitle: string
  workflowSteps: string[]
  toolsTitle: string
  tools: {
    discovery: { title: string; description: string }
    approvals: { title: string; description: string }
    pipeline: { title: string; description: string }
    engine: { title: string; description: string }
    monitor: { title: string; description: string }
  }
  channelsTitle: string
  channels: Record<OutreachChannelKey, OutreachChannelCopy>
  totalLeads: string
  pending: string
  approved: string
  rejected: string
  sendsLeft: string
  recentLeads: string
  selectedChannel: string
  viewAll: string
  noLeads: string
  startDiscovery: string
  loading: string
  loadError: string
  genericLoadError: string
  unnamedBusiness: string
  statuses: Record<string, string>
}

export const OUTREACH_COPY: Record<OutreachLanguage, OutreachHubCopy> = {
  en: {
    navLabel: 'Outreach',
    eyebrow: 'Unified Outreach Center',
    title: 'Start conversations, share useful help, and find new clients.',
    subtitle: 'Run AI-assisted or human-led outreach from prospect discovery through approval, sending, manual contact, and results monitoring.',
    definition: 'Outreach means actively contacting people or businesses to begin a conversation. Email is one channel alongside social media, video, online press, print press, trade publications, direct messages, and human follow-up.',
    approvalNotice: 'Research and drafting may run automatically. Nothing is emailed, posted, published, or otherwise sent until the required human approval is recorded.',
    aiModeTitle: 'AI / Chief of Staff',
    aiModeBody: 'Ask COS for a campaign and a target number of companies. COS researches real public businesses, looks for published contact emails, drafts personalized messages, and places valid drafts in the approval queue.',
    aiModePromptLabel: 'Example instruction',
    aiModePrompt: 'Create an outreach campaign. Find 20 potential companies, locate their published business email addresses, draft personalized messages, and place every valid draft in my approval queue. Do not send anything until I approve it.',
    aiModeCta: 'Open Chief of Staff',
    manualModeTitle: 'Manual / Human',
    manualModeBody: 'Enter a company and website yourself, run the analyzer, review the suggested message, approve or reject it, then email it or record contact completed through another channel.',
    manualModeCta: 'Open human console',
    workflowTitle: 'Restored workflow',
    workflowSteps: [
      'Define the campaign, audience, region, channel, and number of prospects.',
      'Research real companies and use only verifiable public websites and contact details.',
      'Draft a useful, personalized message for each qualified prospect.',
      'Place every draft in Pending for human review; approve or reject it.',
      'Send through an enabled provider or record manual outreach, then monitor results and follow-ups.',
    ],
    toolsTitle: 'Campaign workspaces',
    tools: {
      discovery: { title: 'Prospect Discovery', description: 'Analyze a business or start building a qualified prospect list.' },
      approvals: { title: 'Approval Inbox', description: 'Review prospects, contact addresses, and drafts before anything is sent.' },
      pipeline: { title: 'Outreach Pipeline', description: 'Track discovered, approved, contacted, replied, scheduled, and closed prospects.' },
      engine: { title: 'Campaign Engine', description: 'Move from a public company website to analysis, approval, and follow-up.' },
      monitor: { title: 'Admin Monitor', description: 'See pending, approved, sent, recent activity, limits, manual work, and operational controls.' },
    },
    channelsTitle: 'Outreach channels',
    channels: {
      email: { label: 'Email', description: 'Personalized business email with approval, send limits, and audit history.' },
      social: { label: 'Social and direct messages', description: 'LinkedIn and other connected social channels, always behind approval.' },
      video: { label: 'Video outreach', description: 'Campaign videos and personalized visual material prepared for review.' },
      onlinePress: { label: 'Online press', description: 'Digital newspapers, business sites, newsletters, and online editors.' },
      printPress: { label: 'Print press', description: 'Local and regional newspapers, print advertising desks, and features.' },
      tradePress: { label: 'Trade press', description: 'Industry magazines, technical publications, and specialist editors.' },
      manual: { label: 'Human / other channel', description: 'Phone, event, referral, form, or another approved human interaction recorded manually.' },
    },
    totalLeads: 'Total prospects',
    pending: 'Pending approval',
    approved: 'Approved',
    rejected: 'Rejected',
    sendsLeft: 'sends remaining today',
    recentLeads: 'Recent outreach',
    selectedChannel: 'Selected channel',
    viewAll: 'View all →',
    noLeads: 'No outreach prospects are queued yet.',
    startDiscovery: 'Start prospect discovery',
    loading: 'Loading outreach…',
    loadError: 'The outreach queue could not be loaded.',
    genericLoadError: 'Something went wrong while loading outreach.',
    unnamedBusiness: 'Unnamed business',
    statuses: { pending: 'pending', approved: 'approved', rejected: 'rejected', sent: 'sent' },
  },
  es: {
    navLabel: 'Alcance',
    eyebrow: 'Centro unificado de alcance',
    title: 'Inicia conversaciones, comparte ayuda útil y encuentra nuevos clientes.',
    subtitle: 'Gestiona alcance asistido por IA o realizado por personas, desde el descubrimiento hasta la aprobación, el envío, el contacto manual y el seguimiento.',
    definition: 'Alcance significa contactar activamente a personas o empresas para iniciar una conversación. El correo es un canal junto con redes sociales, video, prensa digital, prensa impresa, publicaciones especializadas, mensajes directos y seguimiento humano.',
    approvalNotice: 'La investigación y los borradores pueden ejecutarse automáticamente. Nada se envía, publica o distribuye hasta registrar la aprobación humana requerida.',
    aiModeTitle: 'IA / Chief of Staff',
    aiModeBody: 'Pide a COS una campaña y una cantidad de empresas. COS investiga negocios públicos reales, busca correos publicados, redacta mensajes personalizados y coloca los borradores válidos en la cola de aprobación.',
    aiModePromptLabel: 'Instrucción de ejemplo',
    aiModePrompt: 'Crea una campaña de alcance. Encuentra 20 empresas potenciales, localiza sus correos comerciales publicados, redacta mensajes personalizados y coloca cada borrador válido en mi cola de aprobación. No envíes nada hasta que yo lo apruebe.',
    aiModeCta: 'Abrir Chief of Staff',
    manualModeTitle: 'Manual / Humano',
    manualModeBody: 'Introduce una empresa y su sitio, ejecuta el análisis, revisa el mensaje sugerido, aprueba o rechaza y luego envía por correo o registra el contacto hecho por otro canal.',
    manualModeCta: 'Abrir consola humana',
    workflowTitle: 'Flujo restaurado',
    workflowSteps: [
      'Define campaña, audiencia, región, canal y cantidad de prospectos.',
      'Investiga empresas reales y usa únicamente sitios y contactos públicos verificables.',
      'Redacta un mensaje útil y personalizado para cada prospecto calificado.',
      'Coloca cada borrador en Pendiente para revisión humana; aprueba o rechaza.',
      'Envía mediante un proveedor habilitado o registra el contacto manual y luego monitorea resultados y seguimientos.',
    ],
    toolsTitle: 'Espacios de campaña',
    tools: {
      discovery: { title: 'Descubrimiento de prospectos', description: 'Analiza una empresa o comienza una lista de prospectos calificados.' },
      approvals: { title: 'Bandeja de aprobación', description: 'Revisa prospectos, direcciones y borradores antes de cualquier envío.' },
      pipeline: { title: 'Pipeline de alcance', description: 'Sigue prospectos descubiertos, aprobados, contactados, respondidos, agendados y cerrados.' },
      engine: { title: 'Motor de campañas', description: 'Pasa de un sitio público al análisis, aprobación y seguimiento.' },
      monitor: { title: 'Monitor administrativo', description: 'Consulta pendientes, aprobados, enviados, actividad, límites, trabajo manual y controles.' },
    },
    channelsTitle: 'Canales de alcance',
    channels: {
      email: { label: 'Correo', description: 'Correo empresarial personalizado con aprobación, límites y auditoría.' },
      social: { label: 'Redes y mensajes directos', description: 'LinkedIn y otros canales conectados, siempre sujetos a aprobación.' },
      video: { label: 'Alcance por video', description: 'Videos y material visual personalizado preparado para revisión.' },
      onlinePress: { label: 'Prensa digital', description: 'Periódicos digitales, sitios empresariales, boletines y editores.' },
      printPress: { label: 'Prensa impresa', description: 'Periódicos locales y regionales, publicidad impresa y reportajes.' },
      tradePress: { label: 'Prensa especializada', description: 'Revistas sectoriales, publicaciones técnicas y editores especializados.' },
      manual: { label: 'Humano / otro canal', description: 'Teléfono, evento, referencia, formulario u otra interacción aprobada registrada manualmente.' },
    },
    totalLeads: 'Prospectos totales',
    pending: 'Pendientes de aprobación',
    approved: 'Aprobados',
    rejected: 'Rechazados',
    sendsLeft: 'envíos restantes hoy',
    recentLeads: 'Alcance reciente',
    selectedChannel: 'Canal seleccionado',
    viewAll: 'Ver todos →',
    noLeads: 'Todavía no hay prospectos en la cola.',
    startDiscovery: 'Iniciar descubrimiento',
    loading: 'Cargando alcance…',
    loadError: 'No se pudo cargar la cola de alcance.',
    genericLoadError: 'Ocurrió un error al cargar el alcance.',
    unnamedBusiness: 'Empresa sin nombre',
    statuses: { pending: 'pendiente', approved: 'aprobado', rejected: 'rechazado', sent: 'enviado' },
  },
  pt: {
    navLabel: 'Prospecção',
    eyebrow: 'Central unificada de prospecção',
    title: 'Inicie conversas, compartilhe ajuda útil e encontre novos clientes.',
    subtitle: 'Execute prospecção assistida por IA ou conduzida por pessoas, da descoberta à aprovação, envio, contato manual e monitoramento.',
    definition: 'Prospecção significa contatar ativamente pessoas ou empresas para iniciar uma conversa. E-mail é um canal, junto com redes sociais, vídeo, imprensa online, imprensa escrita, publicações especializadas, mensagens diretas e acompanhamento humano.',
    approvalNotice: 'Pesquisa e rascunhos podem ser executados automaticamente. Nada é enviado ou publicado antes do registro da aprovação humana exigida.',
    aiModeTitle: 'IA / Chief of Staff',
    aiModeBody: 'Peça ao COS uma campanha e uma quantidade de empresas. O COS pesquisa negócios públicos reais, procura e-mails publicados, cria mensagens personalizadas e coloca os rascunhos válidos na fila de aprovação.',
    aiModePromptLabel: 'Exemplo de instrução',
    aiModePrompt: 'Crie uma campanha de prospecção. Encontre 20 empresas potenciais, localize os e-mails comerciais publicados, redija mensagens personalizadas e coloque cada rascunho válido na minha fila de aprovação. Não envie nada até eu aprovar.',
    aiModeCta: 'Abrir Chief of Staff',
    manualModeTitle: 'Manual / Humano',
    manualModeBody: 'Informe uma empresa e seu site, execute a análise, revise a mensagem sugerida, aprove ou rejeite e depois envie por e-mail ou registre o contato realizado por outro canal.',
    manualModeCta: 'Abrir console humano',
    workflowTitle: 'Fluxo restaurado',
    workflowSteps: [
      'Defina campanha, público, região, canal e quantidade de prospects.',
      'Pesquise empresas reais e use somente sites e contatos públicos verificáveis.',
      'Crie uma mensagem útil e personalizada para cada prospect qualificado.',
      'Coloque cada rascunho como Pendente para revisão humana; aprove ou rejeite.',
      'Envie por um provedor habilitado ou registre o contato manual e monitore resultados e acompanhamentos.',
    ],
    toolsTitle: 'Áreas da campanha',
    tools: {
      discovery: { title: 'Descoberta de prospects', description: 'Analise uma empresa ou comece uma lista qualificada.' },
      approvals: { title: 'Caixa de aprovação', description: 'Revise prospects, endereços e rascunhos antes de qualquer envio.' },
      pipeline: { title: 'Pipeline de prospecção', description: 'Acompanhe descobertos, aprovados, contatados, respostas, reuniões e fechamentos.' },
      engine: { title: 'Motor de campanhas', description: 'Passe de um site público à análise, aprovação e acompanhamento.' },
      monitor: { title: 'Monitor administrativo', description: 'Veja pendentes, aprovados, enviados, atividade, limites, trabalho manual e controles.' },
    },
    channelsTitle: 'Canais de prospecção',
    channels: {
      email: { label: 'E-mail', description: 'E-mail empresarial personalizado com aprovação, limites e auditoria.' },
      social: { label: 'Redes e mensagens diretas', description: 'LinkedIn e outros canais conectados, sempre com aprovação.' },
      video: { label: 'Prospecção por vídeo', description: 'Vídeos e material visual personalizado preparados para revisão.' },
      onlinePress: { label: 'Imprensa online', description: 'Jornais digitais, sites empresariais, newsletters e editores.' },
      printPress: { label: 'Imprensa escrita', description: 'Jornais locais e regionais, publicidade impressa e reportagens.' },
      tradePress: { label: 'Imprensa especializada', description: 'Revistas setoriais, publicações técnicas e editores especializados.' },
      manual: { label: 'Humano / outro canal', description: 'Telefone, evento, indicação, formulário ou outra interação aprovada registrada manualmente.' },
    },
    totalLeads: 'Total de prospects',
    pending: 'Aguardando aprovação',
    approved: 'Aprovados',
    rejected: 'Rejeitados',
    sendsLeft: 'envios restantes hoje',
    recentLeads: 'Prospecção recente',
    selectedChannel: 'Canal selecionado',
    viewAll: 'Ver todos →',
    noLeads: 'Ainda não há prospects na fila.',
    startDiscovery: 'Iniciar descoberta',
    loading: 'Carregando prospecção…',
    loadError: 'Não foi possível carregar a fila de prospecção.',
    genericLoadError: 'Algo deu errado ao carregar a prospecção.',
    unnamedBusiness: 'Empresa sem nome',
    statuses: { pending: 'pendente', approved: 'aprovado', rejected: 'rejeitado', sent: 'enviado' },
  },
  pl: {
    navLabel: 'Outreach',
    eyebrow: 'Zintegrowane centrum outreach',
    title: 'Rozpoczynaj rozmowy, oferuj pomoc i zdobywaj nowych klientów.',
    subtitle: 'Prowadź outreach wspierany przez AI lub wykonywany ręcznie: od wyszukania firm przez zatwierdzenie, wysyłkę, kontakt ręczny i monitoring.',
    definition: 'Outreach oznacza aktywny kontakt z osobami lub firmami w celu rozpoczęcia rozmowy. E-mail jest jednym z kanałów obok mediów społecznościowych, wideo, prasy internetowej, drukowanej, branżowej, wiadomości bezpośrednich i kontaktu osobistego.',
    approvalNotice: 'Badanie i przygotowanie szkiców może działać automatycznie. Nic nie jest wysyłane ani publikowane bez wymaganej zgody człowieka.',
    aiModeTitle: 'AI / Chief of Staff',
    aiModeBody: 'Poproś COS o kampanię i liczbę firm. COS wyszukuje prawdziwe firmy publiczne, szuka opublikowanych adresów e-mail, tworzy spersonalizowane wiadomości i umieszcza poprawne szkice w kolejce zatwierdzeń.',
    aiModePromptLabel: 'Przykładowe polecenie',
    aiModePrompt: 'Utwórz kampanię outreach. Znajdź 20 potencjalnych firm, odszukaj opublikowane firmowe adresy e-mail, przygotuj spersonalizowane wiadomości i umieść każdy poprawny szkic w mojej kolejce zatwierdzeń. Nie wysyłaj niczego bez mojej zgody.',
    aiModeCta: 'Otwórz Chief of Staff',
    manualModeTitle: 'Ręcznie / Człowiek',
    manualModeBody: 'Wprowadź firmę i stronę, uruchom analizę, sprawdź proponowaną wiadomość, zatwierdź lub odrzuć, a następnie wyślij e-mail albo zapisz kontakt wykonany innym kanałem.',
    manualModeCta: 'Otwórz konsolę ręczną',
    workflowTitle: 'Przywrócony proces',
    workflowSteps: [
      'Określ kampanię, odbiorców, region, kanał i liczbę prospektów.',
      'Badaj prawdziwe firmy i używaj wyłącznie weryfikowalnych publicznych stron oraz kontaktów.',
      'Przygotuj użyteczną, spersonalizowaną wiadomość dla każdego kwalifikowanego prospektu.',
      'Umieść każdy szkic jako Oczekujący do oceny człowieka; zatwierdź lub odrzuć.',
      'Wyślij przez aktywnego dostawcę albo zapisz kontakt ręczny, a potem monitoruj wyniki i dalsze działania.',
    ],
    toolsTitle: 'Obszary kampanii',
    tools: {
      discovery: { title: 'Wyszukiwanie prospektów', description: 'Przeanalizuj firmę lub zacznij budować kwalifikowaną listę.' },
      approvals: { title: 'Skrzynka zatwierdzeń', description: 'Sprawdź prospekty, adresy i szkice przed jakąkolwiek wysyłką.' },
      pipeline: { title: 'Pipeline outreach', description: 'Śledź znalezione, zatwierdzone i skontaktowane firmy, odpowiedzi, spotkania i zamknięcia.' },
      engine: { title: 'Silnik kampanii', description: 'Przejdź od publicznej strony firmy do analizy, zatwierdzenia i dalszych działań.' },
      monitor: { title: 'Monitor administracyjny', description: 'Zobacz oczekujące, zatwierdzone, wysłane, aktywność, limity, pracę ręczną i sterowanie.' },
    },
    channelsTitle: 'Kanały outreach',
    channels: {
      email: { label: 'E-mail', description: 'Spersonalizowany e-mail firmowy z zatwierdzeniem, limitami i historią audytu.' },
      social: { label: 'Social media i wiadomości', description: 'LinkedIn i inne połączone kanały, zawsze za bramką zatwierdzenia.' },
      video: { label: 'Outreach wideo', description: 'Filmy kampanii i spersonalizowane materiały wizualne przygotowane do oceny.' },
      onlinePress: { label: 'Prasa internetowa', description: 'Portale informacyjne, serwisy biznesowe, newslettery i redakcje.' },
      printPress: { label: 'Prasa drukowana', description: 'Gazety lokalne i regionalne, reklama drukowana i działy tematyczne.' },
      tradePress: { label: 'Prasa branżowa', description: 'Magazyny branżowe, publikacje techniczne i wyspecjalizowane redakcje.' },
      manual: { label: 'Człowiek / inny kanał', description: 'Telefon, wydarzenie, polecenie, formularz lub inna zatwierdzona interakcja zapisana ręcznie.' },
    },
    totalLeads: 'Łącznie prospektów',
    pending: 'Oczekuje na zgodę',
    approved: 'Zatwierdzone',
    rejected: 'Odrzucone',
    sendsLeft: 'pozostałych wysyłek dzisiaj',
    recentLeads: 'Ostatni outreach',
    selectedChannel: 'Wybrany kanał',
    viewAll: 'Zobacz wszystkie →',
    noLeads: 'Brak prospektów w kolejce.',
    startDiscovery: 'Rozpocznij wyszukiwanie',
    loading: 'Ładowanie outreach…',
    loadError: 'Nie udało się wczytać kolejki outreach.',
    genericLoadError: 'Wystąpił błąd podczas ładowania outreach.',
    unnamedBusiness: 'Firma bez nazwy',
    statuses: { pending: 'oczekuje', approved: 'zatwierdzony', rejected: 'odrzucony', sent: 'wysłany' },
  },
  ru: {
    navLabel: 'Аутрич',
    eyebrow: 'Единый центр аутрича',
    title: 'Начинайте диалоги, предлагайте полезную помощь и находите новых клиентов.',
    subtitle: 'Ведите аутрич с помощью ИИ или вручную: от поиска компаний до одобрения, отправки, ручного контакта и мониторинга.',
    definition: 'Аутрич — это активное обращение к людям или компаниям для начала разговора. Электронная почта является одним из каналов наряду с социальными сетями, видео, онлайн-прессой, печатной и отраслевой прессой, прямыми сообщениями и личным контактом.',
    approvalNotice: 'Исследование и подготовка черновиков могут выполняться автоматически. Ничего не отправляется и не публикуется без обязательного одобрения человеком.',
    aiModeTitle: 'ИИ / Chief of Staff',
    aiModeBody: 'Попросите COS создать кампанию и укажите число компаний. COS исследует реальные публичные компании, ищет опубликованные адреса, готовит персональные сообщения и помещает подходящие черновики в очередь одобрения.',
    aiModePromptLabel: 'Пример команды',
    aiModePrompt: 'Создай кампанию аутрича. Найди 20 потенциальных компаний, найди их опубликованные рабочие адреса электронной почты, подготовь персональные сообщения и помести каждый подходящий черновик в мою очередь одобрения. Ничего не отправляй без моего одобрения.',
    aiModeCta: 'Открыть Chief of Staff',
    manualModeTitle: 'Вручную / Человек',
    manualModeBody: 'Введите компанию и сайт, запустите анализ, проверьте предложенное сообщение, одобрите или отклоните, затем отправьте письмо либо запишите контакт через другой канал.',
    manualModeCta: 'Открыть ручную консоль',
    workflowTitle: 'Восстановленный процесс',
    workflowSteps: [
      'Определите кампанию, аудиторию, регион, канал и число потенциальных клиентов.',
      'Исследуйте реальные компании и используйте только проверяемые публичные сайты и контакты.',
      'Подготовьте полезное персональное сообщение для каждого подходящего потенциального клиента.',
      'Поместите каждый черновик в статус Ожидает для проверки человеком; одобрите или отклоните.',
      'Отправьте через подключённого провайдера либо запишите ручной контакт, затем отслеживайте результаты и последующие действия.',
    ],
    toolsTitle: 'Рабочие области кампании',
    tools: {
      discovery: { title: 'Поиск потенциальных клиентов', description: 'Проанализируйте компанию или начните формировать квалифицированный список.' },
      approvals: { title: 'Очередь одобрения', description: 'Проверьте компании, адреса и черновики до любой отправки.' },
      pipeline: { title: 'Воронка аутрича', description: 'Отслеживайте найденных, одобренных и контактированных клиентов, ответы, встречи и закрытия.' },
      engine: { title: 'Движок кампаний', description: 'Перейдите от публичного сайта компании к анализу, одобрению и дальнейшим действиям.' },
      monitor: { title: 'Монитор администратора', description: 'Просматривайте ожидающие, одобренные и отправленные записи, активность, лимиты, ручную работу и элементы управления.' },
    },
    channelsTitle: 'Каналы аутрича',
    channels: {
      email: { label: 'Электронная почта', description: 'Персонализированное деловое письмо с одобрением, лимитами и аудитом.' },
      social: { label: 'Соцсети и прямые сообщения', description: 'LinkedIn и другие подключённые каналы, всегда после одобрения.' },
      video: { label: 'Видео-аутрич', description: 'Видео кампании и персональные визуальные материалы для проверки.' },
      onlinePress: { label: 'Онлайн-пресса', description: 'Цифровые газеты, деловые сайты, рассылки и редакторы.' },
      printPress: { label: 'Печатная пресса', description: 'Местные и региональные газеты, рекламные отделы и тематические редакции.' },
      tradePress: { label: 'Отраслевая пресса', description: 'Профильные журналы, технические издания и специализированные редакторы.' },
      manual: { label: 'Человек / другой канал', description: 'Телефон, мероприятие, рекомендация, форма или другое одобренное взаимодействие, записанное вручную.' },
    },
    totalLeads: 'Всего потенциальных клиентов',
    pending: 'Ожидают одобрения',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    sendsLeft: 'отправок осталось сегодня',
    recentLeads: 'Последний аутрич',
    selectedChannel: 'Выбранный канал',
    viewAll: 'Показать все →',
    noLeads: 'В очереди пока нет потенциальных клиентов.',
    startDiscovery: 'Начать поиск',
    loading: 'Загрузка аутрича…',
    loadError: 'Не удалось загрузить очередь аутрича.',
    genericLoadError: 'Произошла ошибка при загрузке аутрича.',
    unnamedBusiness: 'Компания без названия',
    statuses: { pending: 'ожидает', approved: 'одобрен', rejected: 'отклонён', sent: 'отправлен' },
  },
}

export function outreachCopyFor(language: string): OutreachHubCopy {
  return OUTREACH_COPY[language as OutreachLanguage] || OUTREACH_COPY.en
}

export function outreachNavLabel(language: string): string {
  return outreachCopyFor(language).navLabel
}
