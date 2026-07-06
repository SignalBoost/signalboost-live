export type AgencyPlan = {
  name: string
  price: string
  fee: string
  features: string[]
}

export type OrganicFinancialChannel = 'youtubeOrganic' | 'linkedinOrganic' | 'pressReleaseEmail'
export type EnterpriseFinancialChannel = 'tv' | 'radio' | 'printNewspapers' | 'printMagazines' | 'paidDigital'

export type AgencyChannelCopy = {
  label: string
  description: string
}

export type PressOutreachCopy = {
  ariaLabel: string
  eyebrow: string
  title: string
  subtitle: string
  pendingBadge: string
  pendingTitle: string
  emptyPending: string
  historyBadge: string
  historyTitle: string
  loading: string
  target: string
  contact: string
  role: string
  updated: string
  pendingMetric: string
  publishedMetric: string
  modeMetric: string
  freeOrganic: string
  statuses: Record<'draft' | 'pending_owner_review' | 'approved' | 'published' | 'rejected', string>
  roles: Record<'owner' | 'staff', string>
  targets: Record<'newspaper_print' | 'magazine_print' | 'digital_press', string>
}

export type AgencyCopy = {
  hero: {
    eyebrow: string
    title: string
    body: string
    primaryCta: string
    secondaryCta: string
  }
  client: {
    title: string
    body: string
    freeModeBadge: string
    organicModeTitle: string
    organicModeBody: string
    organicChannelsTitle: string
    organicChannels: Record<OrganicFinancialChannel, AgencyChannelCopy>
    hmiApprovalTitle: string
    hmiApprovalBody: string
    marketingAlertsTitle: string
    marketingAlertsBody: string
    organicSubmit: string
    organicReady: string
    enterpriseReadyBadge: string
    enterpriseLockedTitle: string
    enterpriseLockedBody: string
    enterpriseModeTitle: string
    enterpriseModeBody: string
    enterpriseChannelsTitle: string
    enterpriseChannels: Record<EnterpriseFinancialChannel, AgencyChannelCopy>
    budgetLabel: string
    modeLabel: string
    downloadMode: string
    publishMode: string
    consentLabel: string
    submit: string
    paymentSubmit: string
    ready: string
    paymentReady: string
    stripeUnavailable: string
    noBrokerDispatch: string
    error: string
    summaryTitle: string
    selectedBudget: string
    processingFee: string
    totalCharged: string
  }
  pricing: {
    eyebrow: string
    title: string
    plans: AgencyPlan[]
  }
  notes: {
    complianceTitle: string
    complianceBody: string
    enterpriseTitle: string
    enterpriseBody: string
  }
  pressOutreach?: PressOutreachCopy
}

const en: AgencyCopy = {
  hero: {
    eyebrow: 'SignalBoost Omnichannel Agency Engine',
    title: 'Deploy global campaigns with a free organic default and an enterprise paid-media rail.',
    body: 'Prepare zero-cost organic media, press-release email dispatch, HMI context approval, and Marketing email alerts by default. Programmatic paid media remains built but locked for sponsored enterprise tenants only.',
    primaryCta: 'Prepare free organic campaign',
    secondaryCta: 'Review enterprise rail',
  },
  client: {
    title: 'Campaign execution engine',
    body: 'SignalBoost now separates financial channels into Free Organic Mode and Programmatic Enterprise Mode. Free organic execution is the platform default; paid media selectors appear only for sponsored corporate tenants.',
    freeModeBadge: 'FREE_ORGANIC_MODE active',
    organicModeTitle: 'Free Organic Mode',
    organicModeBody: 'The agent focuses strictly on cost-zero channels: organic YouTube/LinkedIn publishing and automated Press Release emails to newspaper and magazine contacts.',
    organicChannelsTitle: 'Zero-cost channels',
    organicChannels: {
      youtubeOrganic: { label: 'Organic YouTube publication', description: 'Prepare video/community copy and publishing instructions without paid promotion or ad spend.' },
      linkedinOrganic: { label: 'Organic LinkedIn publication', description: 'Prepare company-page and founder-post copy for unpaid LinkedIn distribution.' },
      pressReleaseEmail: { label: 'Press Release email dispatch', description: 'Prepare automated PR email outreach for newspaper and magazine contacts inside the Marketing workspace.' },
    },
    hmiApprovalTitle: 'HMI context approval stays on',
    hmiApprovalBody: 'Context review, operator approval, and release confirmation remain active before any Marketing action is queued.',
    marketingAlertsTitle: 'Marketing email alerts stay on',
    marketingAlertsBody: 'The free workflow still sends the normal Marketing-space email alerts and status messages for approvals, queued PR emails, and campaign follow-up.',
    organicSubmit: 'Prepare free organic workflow',
    organicReady: 'Free organic workflow prepared. Paid budget selectors, checkout, TV, radio, print ads, and paid digital rails remain hidden.',
    enterpriseReadyBadge: 'ENTERPRISE_READY architecture',
    enterpriseLockedTitle: 'Programmatic Enterprise Mode locked',
    enterpriseLockedBody: 'Checkout, TV, radio, paid newspaper/magazine placements, and paid digital ads are typed and built in the code, but hidden until the tenant profile is marked as a sponsored corporate account.',
    enterpriseModeTitle: 'Programmatic Enterprise Mode',
    enterpriseModeBody: 'Sponsored enterprise tenants can unlock pre-funded checkout and paid media planning for TV, radio, print, magazine, and digital inventory.',
    enterpriseChannelsTitle: 'Enterprise paid-media channels',
    enterpriseChannels: {
      tv: { label: 'TV media', description: 'Enterprise-only paid television placement planning and budget handoff.' },
      radio: { label: 'Radio media', description: 'Enterprise-only paid radio placement planning and budget handoff.' },
      printNewspapers: { label: 'Printed newspaper ads', description: 'Enterprise-only paid newspaper placement planning.' },
      printMagazines: { label: 'Printed magazine ads', description: 'Enterprise-only paid magazine placement planning.' },
      paidDigital: { label: 'Paid digital ads', description: 'Enterprise-only paid digital inventory and programmatic campaign preparation.' },
    },
    budgetLabel: 'Selected enterprise budget in USD',
    modeLabel: 'Enterprise execution mode',
    downloadMode: 'Download Creative Assets',
    publishMode: 'Publish on My Behalf',
    consentLabel: 'I understand that external publishing stays locked until payment is confirmed server-side and no broker/media dispatch happens from this preview.',
    submit: 'Prepare enterprise checkout preview',
    paymentSubmit: 'Open secure enterprise payment',
    ready: 'Enterprise checkout preview ready. No payment provider has been called.',
    paymentReady: 'Secure enterprise payment handoff prepared. Paid media remains locked until webhook confirmation.',
    stripeUnavailable: 'Stripe is not configured yet, so this remains a checkout-ready preview only.',
    noBrokerDispatch: 'No LinkedIn, YouTube, press, radio, TV, or ad exchange APIs are called from this flow.',
    error: 'Enter a budget greater than zero, confirm enterprise eligibility, and accept the publishing consent when required.',
    summaryTitle: 'Server-calculated summary',
    selectedBudget: 'Selected budget',
    processingFee: 'Processing fee',
    totalCharged: 'Total charged',
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Transparent pay-as-you-go campaign setup.',
    plans: [
      { name: 'Creator Launch', price: '$0/month', fee: 'Free organic mode', features: ['Organic YouTube/LinkedIn workflow', 'Press Release email preparation', 'HMI approval gate', 'Marketing email alerts'] },
      { name: 'Managed Publishing', price: 'Sponsored enterprise only', fee: 'Pre-funded before release', features: ['Publish-on-my-behalf workflow', 'Consent gate before payment', 'Payment handoff before activation', 'Broker dispatch remains locked until confirmed'] },
      { name: 'Enterprise Studio', price: 'Custom scope', fee: 'Volume-scaled markup', features: ['Human fallback review', 'SRE cockpit escalation', 'Procurement-friendly reporting', 'Press/radio/TV subject to approval'] },
    ],
  },
  notes: {
    complianceTitle: 'Compliance and safety boundary',
    complianceBody: 'Free Organic Mode prepares unpaid media and PR email workflows only. SignalBoost does not dispatch paid media or call external ad, broker, press, radio, TV, LinkedIn, or YouTube APIs until server-side payment confirmation and operator approval gates exist.',
    enterpriseTitle: 'Human fallback for enterprise teams',
    enterpriseBody: 'Large campaigns can move through a SignalBoost operator for procurement review, approval gates, channel validation, and launch coordination before live activation.',
  },
}

const pt: AgencyCopy = {
  hero: { eyebrow: 'Motor de Agência Omnichannel SignalBoost', title: 'Execute campanhas globais com padrão orgânico gratuito e trilho de mídia paga Enterprise.', body: 'Prepare mídia orgânica de custo zero, despacho de Press Releases por e-mail, aprovação de contexto HMI e alertas por e-mail no Marketing por padrão. Mídia paga programática continua construída, mas bloqueada apenas para tenants corporativos patrocinados.', primaryCta: 'Preparar campanha orgânica gratuita', secondaryCta: 'Revisar trilho Enterprise' },
  client: { title: 'Motor de execução de campanhas', body: 'O SignalBoost agora separa canais financeiros em Modo Orgânico Free e Modo Programático Enterprise. A execução orgânica gratuita é o padrão da plataforma; seletores de mídia paga aparecem somente para tenants corporativos patrocinados.', freeModeBadge: 'FREE_ORGANIC_MODE ativo', organicModeTitle: 'Modo Orgânico Free', organicModeBody: 'O agente foca estritamente em canais de custo zero: publicações orgânicas no YouTube/LinkedIn e e-mails automatizados de Press Release para contatos de jornais e revistas.', organicChannelsTitle: 'Canais de custo zero', organicChannels: { youtubeOrganic: { label: 'Publicação orgânica no YouTube', description: 'Preparar copy de vídeo/comunidade e instruções de publicação sem promoção paga ou gasto de anúncios.' }, linkedinOrganic: { label: 'Publicação orgânica no LinkedIn', description: 'Preparar copy para página da empresa e post do fundador com distribuição gratuita no LinkedIn.' }, pressReleaseEmail: { label: 'Despacho de Press Release por e-mail', description: 'Preparar outreach automatizado de PR para contatos de jornais e revistas dentro do espaço de Marketing.' } }, hmiApprovalTitle: 'Aprovação de contexto HMI continua ativa', hmiApprovalBody: 'Revisão de contexto, aprovação operacional e confirmação de liberação continuam ativas antes de qualquer ação de Marketing ser colocada na fila.', marketingAlertsTitle: 'Alertas por e-mail do Marketing continuam ativos', marketingAlertsBody: 'O fluxo gratuito ainda envia os alertas e status normais do espaço de Marketing para aprovações, e-mails de PR enfileirados e follow-up da campanha.', organicSubmit: 'Preparar fluxo orgânico gratuito', organicReady: 'Fluxo orgânico gratuito preparado. Seletores de orçamento pago, checkout, TV, rádio, anúncios impressos e trilhos digitais pagos permanecem ocultos.', enterpriseReadyBadge: 'Arquitetura ENTERPRISE_READY', enterpriseLockedTitle: 'Modo Programático Enterprise bloqueado', enterpriseLockedBody: 'Checkout, TV, rádio, anúncios pagos em jornais/revistas e anúncios digitais pagos estão tipados e construídos no código, mas ocultos até o perfil do tenant ser marcado como conta corporativa patrocinada.', enterpriseModeTitle: 'Modo Programático Enterprise', enterpriseModeBody: 'Tenants corporativos patrocinados podem liberar checkout pré-financiado e planejamento de mídia paga para TV, rádio, jornais, revistas e inventário digital.', enterpriseChannelsTitle: 'Canais de mídia paga Enterprise', enterpriseChannels: { tv: { label: 'Mídia TV', description: 'Planejamento e handoff de orçamento para veiculação paga em TV somente para Enterprise.' }, radio: { label: 'Mídia rádio', description: 'Planejamento e handoff de orçamento para veiculação paga em rádio somente para Enterprise.' }, printNewspapers: { label: 'Anúncios impressos em jornais', description: 'Planejamento de inserção paga em jornais somente para Enterprise.' }, printMagazines: { label: 'Anúncios impressos em revistas', description: 'Planejamento de inserção paga em revistas somente para Enterprise.' }, paidDigital: { label: 'Anúncios digitais pagos', description: 'Inventário digital pago e preparação programática somente para Enterprise.' } }, budgetLabel: 'Orçamento Enterprise selecionado em USD', modeLabel: 'Modo de execução Enterprise', downloadMode: 'Baixar ativos criativos', publishMode: 'Publicar em meu nome', consentLabel: 'Entendo que a publicação externa fica bloqueada até o pagamento ser confirmado no servidor e que nenhum envio para mídia/brokers ocorre nesta prévia.', submit: 'Preparar prévia de checkout Enterprise', paymentSubmit: 'Abrir pagamento Enterprise seguro', ready: 'Prévia de checkout Enterprise pronta. Nenhum provedor de pagamento foi chamado.', paymentReady: 'Handoff de pagamento Enterprise seguro preparado. Mídia paga continua bloqueada até confirmação por webhook.', stripeUnavailable: 'O Stripe ainda não está configurado, então isto continua apenas como uma prévia pronta para checkout.', noBrokerDispatch: 'Nenhuma API do LinkedIn, YouTube, imprensa, rádio, TV ou ad exchange é chamada por este fluxo.', error: 'Insira um orçamento maior que zero, confirme elegibilidade Enterprise e aceite o consentimento de publicação quando necessário.', summaryTitle: 'Resumo calculado pelo servidor', selectedBudget: 'Orçamento selecionado', processingFee: 'Taxa de processamento', totalCharged: 'Total cobrado' },
  pricing: { eyebrow: 'Preços', title: 'Configuração de campanha pay-as-you-go transparente.', plans: [ { name: 'Creator Launch', price: '$0/mês', fee: 'Modo orgânico gratuito', features: ['Fluxo orgânico YouTube/LinkedIn', 'Preparação de Press Release por e-mail', 'Gate de aprovação HMI', 'Alertas por e-mail do Marketing'] }, { name: 'Publicação Gerenciada', price: 'Somente Enterprise patrocinado', fee: 'Pré-financiado antes da liberação', features: ['Fluxo publicar em meu nome', 'Consentimento antes do pagamento', 'Handoff de pagamento antes da ativação', 'Broker dispatch bloqueado até confirmação'] }, { name: 'Enterprise Studio', price: 'Escopo personalizado', fee: 'Markup escalonado por volume', features: ['Revisão humana fallback', 'Escalação no cockpit SRE', 'Relatórios amigáveis para procurement', 'Imprensa/rádio/TV sujeitos à aprovação'] } ] },
  notes: { complianceTitle: 'Limite de segurança e conformidade', complianceBody: 'O Modo Orgânico Free prepara apenas mídia não paga e fluxos de e-mail de PR. O SignalBoost não dispara mídia paga nem chama APIs externas de anúncios, brokers, imprensa, rádio, TV, LinkedIn ou YouTube até existir confirmação de pagamento no servidor e aprovação operacional.', enterpriseTitle: 'Fallback humano para equipes enterprise', enterpriseBody: 'Campanhas grandes podem passar por um operador SignalBoost para revisão de procurement, etapas de aprovação, validação de canais e coordenação de lançamento antes da ativação ao vivo.' },
}

const es: AgencyCopy = {
  hero: { eyebrow: 'Motor de Agencia Omnicanal SignalBoost', title: 'Ejecuta campañas globales con un valor predeterminado orgánico gratis y un carril Enterprise de medios pagados.', body: 'Prepara medios orgánicos de costo cero, envío de Press Releases por email, aprobación de contexto HMI y alertas de Marketing por email de forma predeterminada. La media pagada programática queda construida pero bloqueada para tenants corporativos patrocinados.', primaryCta: 'Preparar campaña orgánica gratis', secondaryCta: 'Revisar carril Enterprise' },
  client: { title: 'Motor de ejecución de campañas', body: 'SignalBoost separa los canales financieros en Modo Orgánico Free y Modo Programático Enterprise. La ejecución orgánica gratuita es el valor predeterminado; los selectores de medios pagados solo aparecen para tenants corporativos patrocinados.', freeModeBadge: 'FREE_ORGANIC_MODE activo', organicModeTitle: 'Modo Orgánico Free', organicModeBody: 'El agente se enfoca estrictamente en canales de costo cero: publicaciones orgánicas en YouTube/LinkedIn y emails automatizados de Press Release a contactos de periódicos y revistas.', organicChannelsTitle: 'Canales de costo cero', organicChannels: { youtubeOrganic: { label: 'Publicación orgánica en YouTube', description: 'Prepara copy de video/comunidad e instrucciones de publicación sin promoción pagada ni gasto publicitario.' }, linkedinOrganic: { label: 'Publicación orgánica en LinkedIn', description: 'Prepara copy para página de empresa y post del fundador con distribución gratuita en LinkedIn.' }, pressReleaseEmail: { label: 'Envío de Press Release por email', description: 'Prepara outreach automatizado de PR para contactos de periódicos y revistas dentro del espacio de Marketing.' } }, hmiApprovalTitle: 'La aprobación de contexto HMI sigue activa', hmiApprovalBody: 'La revisión de contexto, aprobación operativa y confirmación de liberación siguen activas antes de poner en cola cualquier acción de Marketing.', marketingAlertsTitle: 'Las alertas por email de Marketing siguen activas', marketingAlertsBody: 'El flujo gratuito sigue enviando alertas y estados normales del espacio de Marketing para aprobaciones, emails PR en cola y seguimiento de campaña.', organicSubmit: 'Preparar flujo orgánico gratis', organicReady: 'Flujo orgánico gratis preparado. Selectores de presupuesto pagado, checkout, TV, radio, anuncios impresos y carriles digitales pagados permanecen ocultos.', enterpriseReadyBadge: 'Arquitectura ENTERPRISE_READY', enterpriseLockedTitle: 'Modo Programático Enterprise bloqueado', enterpriseLockedBody: 'Checkout, TV, radio, anuncios pagados en periódicos/revistas y anuncios digitales pagados están tipados y construidos en el código, pero ocultos hasta que el perfil del tenant sea una cuenta corporativa patrocinada.', enterpriseModeTitle: 'Modo Programático Enterprise', enterpriseModeBody: 'Los tenants corporativos patrocinados pueden desbloquear checkout prefinanciado y planificación de medios pagados para TV, radio, periódicos, revistas e inventario digital.', enterpriseChannelsTitle: 'Canales Enterprise de medios pagados', enterpriseChannels: { tv: { label: 'Medios TV', description: 'Planificación y handoff de presupuesto para TV pagada solo Enterprise.' }, radio: { label: 'Medios radio', description: 'Planificación y handoff de presupuesto para radio pagada solo Enterprise.' }, printNewspapers: { label: 'Anuncios impresos en periódicos', description: 'Planificación de inserciones pagadas en periódicos solo Enterprise.' }, printMagazines: { label: 'Anuncios impresos en revistas', description: 'Planificación de inserciones pagadas en revistas solo Enterprise.' }, paidDigital: { label: 'Anuncios digitales pagados', description: 'Inventario digital pagado y preparación programática solo Enterprise.' } }, budgetLabel: 'Presupuesto Enterprise seleccionado en USD', modeLabel: 'Modo de ejecución Enterprise', downloadMode: 'Descargar activos creativos', publishMode: 'Publicar en mi nombre', consentLabel: 'Entiendo que la publicación externa queda bloqueada hasta que el pago se confirme en el servidor y que no hay envío a medios/brokers desde esta vista previa.', submit: 'Preparar vista de checkout Enterprise', paymentSubmit: 'Abrir pago Enterprise seguro', ready: 'Vista de checkout Enterprise lista. No se ha llamado a ningún proveedor de pago.', paymentReady: 'Handoff de pago Enterprise seguro preparado. Los medios pagados siguen bloqueados hasta confirmación por webhook.', stripeUnavailable: 'Stripe aún no está configurado, así que esto sigue siendo solo una vista lista para checkout.', noBrokerDispatch: 'Este flujo no llama APIs de LinkedIn, YouTube, prensa, radio, TV ni ad exchanges.', error: 'Ingresa un presupuesto mayor que cero, confirma elegibilidad Enterprise y acepta el consentimiento de publicación cuando sea necesario.', summaryTitle: 'Resumen calculado por el servidor', selectedBudget: 'Presupuesto seleccionado', processingFee: 'Tarifa de procesamiento', totalCharged: 'Total cobrado' },
  pricing: { eyebrow: 'Precios', title: 'Configuración pay-as-you-go transparente para campañas.', plans: [ { name: 'Creator Launch', price: '$0/mes', fee: 'Modo orgánico gratis', features: ['Flujo orgánico YouTube/LinkedIn', 'Preparación de Press Release por email', 'Gate de aprobación HMI', 'Alertas de Marketing por email'] }, { name: 'Publicación Gestionada', price: 'Solo Enterprise patrocinado', fee: 'Prefinanciado antes de liberar', features: ['Flujo publicar en mi nombre', 'Consentimiento antes del pago', 'Handoff de pago antes de activación', 'Broker dispatch bloqueado hasta confirmación'] }, { name: 'Enterprise Studio', price: 'Alcance personalizado', fee: 'Markup escalado por volumen', features: ['Revisión humana fallback', 'Escalación en cockpit SRE', 'Reportes aptos para procurement', 'Prensa/radio/TV sujetos a aprobación'] } ] },
  notes: { complianceTitle: 'Límite de seguridad y cumplimiento', complianceBody: 'El Modo Orgánico Free solo prepara medios no pagados y flujos de email PR. SignalBoost no dispara medios pagados ni llama APIs externas de anuncios, brokers, prensa, radio, TV, LinkedIn o YouTube hasta que existan confirmación de pago en servidor y aprobación operativa.', enterpriseTitle: 'Fallback humano para equipos enterprise', enterpriseBody: 'Las campañas grandes pueden pasar por un operador de SignalBoost para revisión de procurement, compuertas de aprobación, validación de canales y coordinación antes de activación en vivo.' },
}

const pl: AgencyCopy = {
  hero: { eyebrow: 'Silnik Agencji Omnichannel SignalBoost', title: 'Uruchamiaj globalne kampanie z darmowym domyślnym trybem organicznym i płatnym torem Enterprise.', body: 'Domyślnie przygotuj zero-kosztowe media organiczne, wysyłkę Press Release e-mail, akceptację kontekstu HMI i alerty e-mail w Marketingu. Programmatic paid media pozostaje zbudowane, ale zablokowane dla sponsorowanych tenantów korporacyjnych.', primaryCta: 'Przygotuj darmową kampanię organiczną', secondaryCta: 'Sprawdź tor Enterprise' },
  client: { title: 'Silnik realizacji kampanii', body: 'SignalBoost rozdziela kanały finansowe na Free Organic Mode i Programmatic Enterprise Mode. Darmowa realizacja organiczna jest domyślna; selektory płatnych mediów pojawiają się tylko dla sponsorowanych tenantów korporacyjnych.', freeModeBadge: 'FREE_ORGANIC_MODE aktywny', organicModeTitle: 'Free Organic Mode', organicModeBody: 'Agent skupia się wyłącznie na kanałach zero-kosztowych: organicznych publikacjach YouTube/LinkedIn oraz automatycznych e-mailach Press Release do kontaktów gazet i magazynów.', organicChannelsTitle: 'Kanały zero-kosztowe', organicChannels: { youtubeOrganic: { label: 'Organiczna publikacja YouTube', description: 'Przygotowanie copy wideo/społeczności i instrukcji publikacji bez płatnej promocji i ad spend.' }, linkedinOrganic: { label: 'Organiczna publikacja LinkedIn', description: 'Przygotowanie copy dla strony firmy i posta założyciela do darmowej dystrybucji LinkedIn.' }, pressReleaseEmail: { label: 'Wysyłka Press Release e-mail', description: 'Przygotowanie automatycznego PR outreach do kontaktów gazet i magazynów w przestrzeni Marketing.' } }, hmiApprovalTitle: 'Akceptacja kontekstu HMI pozostaje aktywna', hmiApprovalBody: 'Przegląd kontekstu, akceptacja operatora i potwierdzenie release pozostają aktywne przed zakolejkowaniem jakiejkolwiek akcji Marketing.', marketingAlertsTitle: 'Alerty e-mail Marketing pozostają aktywne', marketingAlertsBody: 'Darmowy workflow nadal wysyła standardowe alerty i statusy przestrzeni Marketing dla akceptacji, zakolejkowanych e-maili PR i follow-up kampanii.', organicSubmit: 'Przygotuj darmowy workflow organiczny', organicReady: 'Darmowy workflow organiczny przygotowany. Selektory płatnego budżetu, checkout, TV, radio, print ads i płatne tory digital pozostają ukryte.', enterpriseReadyBadge: 'Architektura ENTERPRISE_READY', enterpriseLockedTitle: 'Programmatic Enterprise Mode zablokowany', enterpriseLockedBody: 'Checkout, TV, radio, płatne reklamy w gazetach/magazynach i płatne reklamy digital są typowane i zbudowane w kodzie, ale ukryte do czasu oznaczenia tenant profile jako sponsorowane konto korporacyjne.', enterpriseModeTitle: 'Programmatic Enterprise Mode', enterpriseModeBody: 'Sponsorowane tenanty korporacyjne mogą odblokować pre-funded checkout i planowanie płatnych mediów dla TV, radia, gazet, magazynów i inventory digital.', enterpriseChannelsTitle: 'Kanały płatnych mediów Enterprise', enterpriseChannels: { tv: { label: 'Media TV', description: 'Enterprise-only planowanie i handoff budżetu dla płatnej emisji TV.' }, radio: { label: 'Media radio', description: 'Enterprise-only planowanie i handoff budżetu dla płatnej emisji radiowej.' }, printNewspapers: { label: 'Reklamy drukowane w gazetach', description: 'Enterprise-only planowanie płatnych placementów gazetowych.' }, printMagazines: { label: 'Reklamy drukowane w magazynach', description: 'Enterprise-only planowanie płatnych placementów magazynowych.' }, paidDigital: { label: 'Płatne reklamy digital', description: 'Enterprise-only płatne inventory digital i przygotowanie programmatic.' } }, budgetLabel: 'Wybrany budżet Enterprise w USD', modeLabel: 'Tryb realizacji Enterprise', downloadMode: 'Pobierz materiały kreatywne', publishMode: 'Publikuj w moim imieniu', consentLabel: 'Rozumiem, że zewnętrzna publikacja jest zablokowana do potwierdzenia płatności po stronie serwera i że z tego podglądu nie następuje wysyłka do mediów/brokerów.', submit: 'Przygotuj podgląd checkout Enterprise', paymentSubmit: 'Otwórz bezpieczną płatność Enterprise', ready: 'Podgląd checkout Enterprise gotowy. Żaden operator płatności nie został wywołany.', paymentReady: 'Przygotowano bezpieczny handoff płatności Enterprise. Płatne media pozostają zablokowane do potwierdzenia webhook.', stripeUnavailable: 'Stripe nie jest jeszcze skonfigurowany, więc to pozostaje tylko podglądem gotowym do checkout.', noBrokerDispatch: 'Ten przepływ nie wywołuje API LinkedIn, YouTube, prasy, radia, TV ani ad exchange.', error: 'Wprowadź budżet większy niż zero, potwierdź kwalifikację Enterprise i zaakceptuj zgodę publikacji, gdy jest wymagana.', summaryTitle: 'Podsumowanie obliczone przez serwer', selectedBudget: 'Wybrany budżet', processingFee: 'Opłata operacyjna', totalCharged: 'Suma do pobrania' },
  pricing: { eyebrow: 'Cennik', title: 'Przejrzysta konfiguracja kampanii pay-as-you-go.', plans: [ { name: 'Creator Launch', price: '$0/miesiąc', fee: 'Darmowy tryb organiczny', features: ['Organiczny workflow YouTube/LinkedIn', 'Przygotowanie Press Release e-mail', 'Brama akceptacji HMI', 'Alerty e-mail Marketing'] }, { name: 'Publikacja zarządzana', price: 'Tylko sponsorowany Enterprise', fee: 'Przedpłata przed odblokowaniem', features: ['Tryb publikuj w moim imieniu', 'Zgoda przed płatnością', 'Handoff płatności przed aktywacją', 'Broker dispatch zablokowany do potwierdzenia'] }, { name: 'Enterprise Studio', price: 'Zakres indywidualny', fee: 'Markup zależny od wolumenu', features: ['Ludzki fallback review', 'Eskalacja SRE cockpit', 'Raportowanie dla procurement', 'Prasa/radio/TV po akceptacji'] } ] },
  notes: { complianceTitle: 'Granica bezpieczeństwa i zgodności', complianceBody: 'Free Organic Mode przygotowuje wyłącznie niepłatne media i przepływy PR e-mail. SignalBoost nie uruchamia płatnych mediów ani zewnętrznych API reklam, brokerów, prasy, radia, TV, LinkedIn czy YouTube bez serwerowego potwierdzenia płatności i zgód operacyjnych.', enterpriseTitle: 'Ludzki fallback dla zespołów enterprise', enterpriseBody: 'Duże kampanie mogą przejść przez operatora SignalBoost w celu przeglądu zakupowego, bramek akceptacji, walidacji kanałów i koordynacji przed aktywacją na żywo.' },
}

const ru: AgencyCopy = {
  hero: { eyebrow: 'Омниканальный агентский движок SignalBoost', title: 'Запускайте глобальные кампании с бесплатным органическим режимом по умолчанию и платным Enterprise-контуром.', body: 'По умолчанию готовьте бесплатные organic media, e-mail рассылку Press Release, HMI approval контекста и Marketing e-mail alerts. Programmatic paid media остается построенным, но заблокированным только для sponsored corporate tenants.', primaryCta: 'Подготовить бесплатную organic campaign', secondaryCta: 'Посмотреть Enterprise-контур' },
  client: { title: 'Движок исполнения кампаний', body: 'SignalBoost разделяет финансовые каналы на Free Organic Mode и Programmatic Enterprise Mode. Бесплатное organic execution является режимом по умолчанию; selectors платных медиа появляются только для sponsored corporate tenants.', freeModeBadge: 'FREE_ORGANIC_MODE активен', organicModeTitle: 'Free Organic Mode', organicModeBody: 'Агент работает строго с каналами нулевой стоимости: organic публикации YouTube/LinkedIn и автоматические Press Release e-mail для контактов газет и журналов.', organicChannelsTitle: 'Каналы нулевой стоимости', organicChannels: { youtubeOrganic: { label: 'Organic публикация YouTube', description: 'Подготовка video/community copy и инструкций публикации без paid promotion или ad spend.' }, linkedinOrganic: { label: 'Organic публикация LinkedIn', description: 'Подготовка company-page и founder-post copy для бесплатного распространения в LinkedIn.' }, pressReleaseEmail: { label: 'Press Release e-mail dispatch', description: 'Подготовка automated PR outreach для контактов газет и журналов внутри Marketing workspace.' } }, hmiApprovalTitle: 'HMI approval контекста остается включенным', hmiApprovalBody: 'Context review, operator approval и release confirmation остаются активными до постановки любой Marketing action в очередь.', marketingAlertsTitle: 'Marketing e-mail alerts остаются включенными', marketingAlertsBody: 'Бесплатный workflow продолжает отправлять обычные alerts и status messages в Marketing workspace для approvals, queued PR e-mails и campaign follow-up.', organicSubmit: 'Подготовить бесплатный organic workflow', organicReady: 'Бесплатный organic workflow подготовлен. Paid budget selectors, checkout, TV, radio, print ads и paid digital rails остаются скрытыми.', enterpriseReadyBadge: 'Архитектура ENTERPRISE_READY', enterpriseLockedTitle: 'Programmatic Enterprise Mode заблокирован', enterpriseLockedBody: 'Checkout, TV, radio, paid newspaper/magazine placements и paid digital ads типизированы и построены в коде, но скрыты до момента, когда tenant profile отмечен как sponsored corporate account.', enterpriseModeTitle: 'Programmatic Enterprise Mode', enterpriseModeBody: 'Sponsored corporate tenants могут открыть pre-funded checkout и paid media planning для TV, radio, newspapers, magazines и digital inventory.', enterpriseChannelsTitle: 'Enterprise paid-media channels', enterpriseChannels: { tv: { label: 'TV media', description: 'Enterprise-only planning и budget handoff для платного TV размещения.' }, radio: { label: 'Radio media', description: 'Enterprise-only planning и budget handoff для платного radio размещения.' }, printNewspapers: { label: 'Printed newspaper ads', description: 'Enterprise-only planning для платных newspaper placements.' }, printMagazines: { label: 'Printed magazine ads', description: 'Enterprise-only planning для платных magazine placements.' }, paidDigital: { label: 'Paid digital ads', description: 'Enterprise-only paid digital inventory и programmatic campaign preparation.' } }, budgetLabel: 'Выбранный Enterprise бюджет в USD', modeLabel: 'Enterprise execution mode', downloadMode: 'Скачать креативные материалы', publishMode: 'Опубликовать от моего имени', consentLabel: 'Я понимаю, что внешняя публикация заблокирована до серверного подтверждения платежа и что из этого предпросмотра нет отправки в медиа/к брокерам.', submit: 'Подготовить Enterprise checkout preview', paymentSubmit: 'Открыть безопасную Enterprise оплату', ready: 'Enterprise checkout preview готов. Платежный провайдер не вызывался.', paymentReady: 'Безопасный Enterprise payment handoff подготовлен. Платные медиа остаются заблокированы до webhook-подтверждения.', stripeUnavailable: 'Stripe еще не настроен, поэтому это остается только checkout-ready preview.', noBrokerDispatch: 'Этот поток не вызывает API LinkedIn, YouTube, press, radio, TV или ad exchange.', error: 'Введите бюджет больше нуля, подтвердите Enterprise eligibility и примите согласие на публикацию, если оно требуется.', summaryTitle: 'Сводка, рассчитанная сервером', selectedBudget: 'Выбранный бюджет', processingFee: 'Комиссия обработки', totalCharged: 'Итого к оплате' },
  pricing: { eyebrow: 'Цены', title: 'Прозрачная настройка кампаний pay-as-you-go.', plans: [ { name: 'Creator Launch', price: '$0/месяц', fee: 'Бесплатный organic mode', features: ['Organic workflow YouTube/LinkedIn', 'Подготовка Press Release e-mail', 'HMI approval gate', 'Marketing e-mail alerts'] }, { name: 'Managed Publishing', price: 'Только sponsored Enterprise', fee: 'Предоплата до разблокировки', features: ['Публикация от моего имени', 'Согласие перед оплатой', 'Платежный handoff перед активацией', 'Broker dispatch заблокирован до подтверждения'] }, { name: 'Enterprise Studio', price: 'Индивидуальный объем', fee: 'Markup по объему', features: ['Человеческий fallback review', 'Эскалация SRE cockpit', 'Отчетность для procurement', 'Press/radio/TV после одобрения'] } ] },
  notes: { complianceTitle: 'Граница безопасности и соответствия', complianceBody: 'Free Organic Mode готовит только unpaid media и PR e-mail workflows. SignalBoost не запускает paid media и не вызывает внешние API рекламы, brokers, press, radio, TV, LinkedIn или YouTube без серверного подтверждения платежа и operational approvals.', enterpriseTitle: 'Человеческий fallback для enterprise-команд', enterpriseBody: 'Крупные кампании могут проходить через оператора SignalBoost для procurement review, approval gates, проверки каналов и координации до live activation.' },
}


const pressOutreachCopy: Record<string, PressOutreachCopy> = {
  en: { ariaLabel: 'Marketing Press & Print Outreach Studio', eyebrow: 'Marketing + Sales · Press Outreach', title: 'Press & Print Outreach Studio', subtitle: 'Review staff-submitted print, magazine, and digital press campaigns inside the Marketing workspace only.', pendingBadge: 'Owner review', pendingTitle: 'PendingApprovalsTable', emptyPending: 'No staff campaigns are waiting for owner review.', historyBadge: 'Timeline', historyTitle: 'CampaignHistoryTimeline', loading: 'Loading press outreach records…', target: 'Target', contact: 'Publication contact', role: 'Role', updated: 'Updated', pendingMetric: 'Pending approvals', publishedMetric: 'Published proofs', modeMetric: 'Processing mode', freeOrganic: 'Free organic', statuses: { draft: 'Draft', pending_owner_review: 'Pending owner review', approved: 'Approved', published: 'Published', rejected: 'Rejected' }, roles: { owner: 'Owner', staff: 'Staff' }, targets: { newspaper_print: 'Newspaper print', magazine_print: 'Magazine print', digital_press: 'Digital press' } },
  pt: { ariaLabel: 'Estúdio de Marketing Press & Print Outreach', eyebrow: 'Marketing + Vendas · Press Outreach', title: 'Estúdio Press & Print Outreach', subtitle: 'Revise campanhas de imprensa impressa, revistas e imprensa digital enviadas pela equipe apenas no espaço de Marketing.', pendingBadge: 'Revisão do proprietário', pendingTitle: 'PendingApprovalsTable', emptyPending: 'Nenhuma campanha da equipe aguarda revisão do proprietário.', historyBadge: 'Linha do tempo', historyTitle: 'CampaignHistoryTimeline', loading: 'Carregando registros de press outreach…', target: 'Alvo', contact: 'Contato da publicação', role: 'Função', updated: 'Atualizado', pendingMetric: 'Aprovações pendentes', publishedMetric: 'Provas publicadas', modeMetric: 'Modo de processamento', freeOrganic: 'Orgânico grátis', statuses: { draft: 'Rascunho', pending_owner_review: 'Aguardando proprietário', approved: 'Aprovado', published: 'Publicado', rejected: 'Rejeitado' }, roles: { owner: 'Proprietário', staff: 'Equipe' }, targets: { newspaper_print: 'Jornal impresso', magazine_print: 'Revista impressa', digital_press: 'Imprensa digital' } },
  es: { ariaLabel: 'Estudio de Marketing Press & Print Outreach', eyebrow: 'Marketing + Ventas · Press Outreach', title: 'Estudio Press & Print Outreach', subtitle: 'Revisa campañas de prensa impresa, revistas y prensa digital enviadas por el equipo solo dentro del espacio de Marketing.', pendingBadge: 'Revisión del propietario', pendingTitle: 'PendingApprovalsTable', emptyPending: 'No hay campañas del equipo esperando revisión del propietario.', historyBadge: 'Cronología', historyTitle: 'CampaignHistoryTimeline', loading: 'Cargando registros de press outreach…', target: 'Destino', contact: 'Contacto de publicación', role: 'Rol', updated: 'Actualizado', pendingMetric: 'Aprobaciones pendientes', publishedMetric: 'Pruebas publicadas', modeMetric: 'Modo de procesamiento', freeOrganic: 'Orgánico gratis', statuses: { draft: 'Borrador', pending_owner_review: 'Pendiente del propietario', approved: 'Aprobado', published: 'Publicado', rejected: 'Rechazado' }, roles: { owner: 'Propietario', staff: 'Equipo' }, targets: { newspaper_print: 'Periódico impreso', magazine_print: 'Revista impresa', digital_press: 'Prensa digital' } },
  pl: { ariaLabel: 'Studio Marketing Press & Print Outreach', eyebrow: 'Marketing + Sprzedaż · Press Outreach', title: 'Studio Press & Print Outreach', subtitle: 'Przeglądaj kampanie druku, magazynów i prasy cyfrowej zespołu wyłącznie w przestrzeni Marketing.', pendingBadge: 'Przegląd właściciela', pendingTitle: 'PendingApprovalsTable', emptyPending: 'Brak kampanii zespołu oczekujących na właściciela.', historyBadge: 'Oś czasu', historyTitle: 'CampaignHistoryTimeline', loading: 'Ładowanie rekordów press outreach…', target: 'Cel', contact: 'Kontakt publikacji', role: 'Rola', updated: 'Aktualizacja', pendingMetric: 'Oczekujące zgody', publishedMetric: 'Opublikowane proofy', modeMetric: 'Tryb przetwarzania', freeOrganic: 'Darmowy organiczny', statuses: { draft: 'Szkic', pending_owner_review: 'Oczekuje na właściciela', approved: 'Zatwierdzone', published: 'Opublikowane', rejected: 'Odrzucone' }, roles: { owner: 'Właściciel', staff: 'Zespół' }, targets: { newspaper_print: 'Gazeta drukowana', magazine_print: 'Magazyn drukowany', digital_press: 'Prasa cyfrowa' } },
  ru: { ariaLabel: 'Marketing Press & Print Outreach Studio', eyebrow: 'Marketing + Sales · Press Outreach', title: 'Press & Print Outreach Studio', subtitle: 'Проверяйте кампании печатной прессы, журналов и digital press от команды только в workspace Marketing.', pendingBadge: 'Проверка владельца', pendingTitle: 'PendingApprovalsTable', emptyPending: 'Нет кампаний команды на проверке владельца.', historyBadge: 'Лента', historyTitle: 'CampaignHistoryTimeline', loading: 'Загрузка записей press outreach…', target: 'Цель', contact: 'Контакт публикации', role: 'Роль', updated: 'Обновлено', pendingMetric: 'Ожидают approval', publishedMetric: 'Опубликованные proof', modeMetric: 'Режим обработки', freeOrganic: 'Free organic', statuses: { draft: 'Черновик', pending_owner_review: 'Ожидает владельца', approved: 'Одобрено', published: 'Опубликовано', rejected: 'Отклонено' }, roles: { owner: 'Владелец', staff: 'Команда' }, targets: { newspaper_print: 'Печатная газета', magazine_print: 'Печатный журнал', digital_press: 'Digital press' } },
}

export const agencyCopy: Record<string, AgencyCopy> = {
  en: { ...en, pressOutreach: pressOutreachCopy.en },
  pt: { ...pt, pressOutreach: pressOutreachCopy.pt },
  es: { ...es, pressOutreach: pressOutreachCopy.es },
  pl: { ...pl, pressOutreach: pressOutreachCopy.pl },
  ru: { ...ru, pressOutreach: pressOutreachCopy.ru },
}

export function getAgencyCopy(lang?: string): AgencyCopy & { pressOutreach: PressOutreachCopy } {
  const safe = lang && agencyCopy[lang] ? lang : 'en'
  return agencyCopy[safe] as AgencyCopy & { pressOutreach: PressOutreachCopy }
}
