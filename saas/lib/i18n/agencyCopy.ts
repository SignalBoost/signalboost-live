export type AgencyPlan = {
  name: string
  price: string
  fee: string
  features: string[]
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
}

const en: AgencyCopy = {
  hero: {
    eyebrow: 'SignalBoost Omnichannel Agency Engine',
    title: 'Deploy global campaigns with a pre-funded safety gate.',
    body: 'Plan localized creative, model a campaign budget, and prepare social, press, radio, and TV-ready packages before any paid media or broker action is released.',
    primaryCta: 'Estimate campaign budget',
    secondaryCta: 'Review pricing',
  },
  client: {
    title: 'Pre-flight campaign budget',
    body: 'Choose whether you want downloadable creative assets or a managed publishing package. SignalBoost recalculates every total server-side before any payment handoff.',
    budgetLabel: 'Selected budget in USD',
    modeLabel: 'Execution mode',
    downloadMode: 'Download Creative Assets',
    publishMode: 'Publish on My Behalf',
    consentLabel: 'I understand that external publishing stays locked until payment is confirmed server-side and no broker/media dispatch happens from this preview.',
    submit: 'Prepare checkout preview',
    paymentSubmit: 'Open secure payment',
    ready: 'Checkout preview ready. No payment provider has been called.',
    paymentReady: 'Secure payment handoff prepared. Paid media remains locked until webhook confirmation.',
    stripeUnavailable: 'Stripe is not configured yet, so this remains a checkout-ready preview only.',
    noBrokerDispatch: 'No LinkedIn, YouTube, press, radio, TV, or ad exchange APIs are called from this flow.',
    error: 'Enter a budget greater than zero and accept the publishing consent when required.',
    summaryTitle: 'Server-calculated summary',
    selectedBudget: 'Selected budget',
    processingFee: 'Processing fee',
    totalCharged: 'Total charged',
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Transparent pay-as-you-go campaign setup.',
    plans: [
      { name: 'Creator Launch', price: '$0/month', fee: '15% processing fee', features: ['Download campaign assets', 'Server-side budget recalculation', 'Checkout-ready preview', 'No retainer required'] },
      { name: 'Managed Publishing', price: 'Bring your budget', fee: 'Pre-funded before release', features: ['Publish-on-my-behalf workflow', 'Consent gate before payment', 'Payment handoff before activation', 'Broker dispatch remains locked until confirmed'] },
      { name: 'Enterprise Studio', price: 'Custom scope', fee: 'Volume-scaled markup', features: ['Human fallback review', 'SRE cockpit escalation', 'Procurement-friendly reporting', 'Press/radio/TV subject to approval'] },
    ],
  },
  notes: {
    complianceTitle: 'Compliance and safety boundary',
    complianceBody: 'This flow prepares budgets and payment handoff only. SignalBoost does not dispatch paid media or call external ad, broker, press, radio, TV, LinkedIn, or YouTube APIs until server-side payment confirmation and operator approval gates exist.',
    enterpriseTitle: 'Human fallback for enterprise teams',
    enterpriseBody: 'Large campaigns can move through a SignalBoost operator for procurement review, approval gates, channel validation, and launch coordination before live activation.',
  },
}

const pt: AgencyCopy = {
  hero: { eyebrow: 'Motor de Agência Omnichannel SignalBoost', title: 'Lance campanhas globais com uma trava de segurança pré-financiada.', body: 'Planeje criativos localizados, modele o orçamento da campanha e prepare pacotes para social, imprensa, rádio e TV antes de qualquer mídia paga ou ação de broker ser liberada.', primaryCta: 'Estimar orçamento', secondaryCta: 'Ver preços' },
  client: { title: 'Orçamento prévio da campanha', body: 'Escolha se deseja baixar ativos criativos ou preparar um pacote de publicação gerenciada. O SignalBoost recalcula todos os totais no servidor antes de qualquer pagamento.', budgetLabel: 'Orçamento selecionado em USD', modeLabel: 'Modo de execução', downloadMode: 'Baixar ativos criativos', publishMode: 'Publicar em meu nome', consentLabel: 'Entendo que a publicação externa fica bloqueada até o pagamento ser confirmado no servidor e que nenhum envio para mídia/brokers ocorre nesta prévia.', submit: 'Preparar prévia de checkout', paymentSubmit: 'Abrir pagamento seguro', ready: 'Prévia de checkout pronta. Nenhum provedor de pagamento foi chamado.', paymentReady: 'Handoff de pagamento seguro preparado. Mídia paga continua bloqueada até confirmação por webhook.', stripeUnavailable: 'O Stripe ainda não está configurado, então isto continua apenas como uma prévia pronta para checkout.', noBrokerDispatch: 'Nenhuma API do LinkedIn, YouTube, imprensa, rádio, TV ou ad exchange é chamada por este fluxo.', error: 'Insira um orçamento maior que zero e aceite o consentimento de publicação quando necessário.', summaryTitle: 'Resumo calculado pelo servidor', selectedBudget: 'Orçamento selecionado', processingFee: 'Taxa de processamento', totalCharged: 'Total cobrado' },
  pricing: { eyebrow: 'Preços', title: 'Configuração de campanha pay-as-you-go transparente.', plans: [ { name: 'Creator Launch', price: '$0/mês', fee: '15% de taxa de processamento', features: ['Baixar ativos da campanha', 'Recálculo de orçamento no servidor', 'Prévia pronta para checkout', 'Sem retainer mensal'] }, { name: 'Publicação Gerenciada', price: 'Traga seu orçamento', fee: 'Pré-financiado antes da liberação', features: ['Fluxo publicar em meu nome', 'Consentimento antes do pagamento', 'Handoff de pagamento antes da ativação', 'Broker dispatch bloqueado até confirmação'] }, { name: 'Enterprise Studio', price: 'Escopo personalizado', fee: 'Markup escalonado por volume', features: ['Revisão humana fallback', 'Escalação no cockpit SRE', 'Relatórios amigáveis para procurement', 'Imprensa/rádio/TV sujeitos à aprovação'] } ] },
  notes: { complianceTitle: 'Limite de segurança e conformidade', complianceBody: 'Este fluxo prepara orçamentos e handoff de pagamento apenas. O SignalBoost não dispara mídia paga nem chama APIs externas de anúncios, brokers, imprensa, rádio, TV, LinkedIn ou YouTube até existir confirmação de pagamento no servidor e aprovação operacional.', enterpriseTitle: 'Fallback humano para equipes enterprise', enterpriseBody: 'Campanhas grandes podem passar por um operador SignalBoost para revisão de procurement, etapas de aprovação, validação de canais e coordenação de lançamento antes da ativação ao vivo.' },
}

const es: AgencyCopy = {
  hero: { eyebrow: 'Motor de Agencia Omnicanal SignalBoost', title: 'Lanza campañas globales con una compuerta de seguridad prefinanciada.', body: 'Planifica creativos localizados, modela el presupuesto y prepara paquetes para social, prensa, radio y TV antes de liberar cualquier medio pagado o acción de broker.', primaryCta: 'Estimar presupuesto', secondaryCta: 'Ver precios' },
  client: { title: 'Presupuesto previo de campaña', body: 'Elige si quieres descargar activos creativos o preparar un paquete de publicación gestionada. SignalBoost recalcula todos los totales en el servidor antes de cualquier pago.', budgetLabel: 'Presupuesto seleccionado en USD', modeLabel: 'Modo de ejecución', downloadMode: 'Descargar activos creativos', publishMode: 'Publicar en mi nombre', consentLabel: 'Entiendo que la publicación externa queda bloqueada hasta que el pago se confirme en el servidor y que no hay envío a medios/brokers desde esta vista previa.', submit: 'Preparar vista de checkout', paymentSubmit: 'Abrir pago seguro', ready: 'Vista de checkout lista. No se ha llamado a ningún proveedor de pago.', paymentReady: 'Handoff de pago seguro preparado. Los medios pagados siguen bloqueados hasta confirmación por webhook.', stripeUnavailable: 'Stripe aún no está configurado, así que esto sigue siendo solo una vista lista para checkout.', noBrokerDispatch: 'Este flujo no llama APIs de LinkedIn, YouTube, prensa, radio, TV ni ad exchanges.', error: 'Ingresa un presupuesto mayor que cero y acepta el consentimiento de publicación cuando sea necesario.', summaryTitle: 'Resumen calculado por el servidor', selectedBudget: 'Presupuesto seleccionado', processingFee: 'Tarifa de procesamiento', totalCharged: 'Total cobrado' },
  pricing: { eyebrow: 'Precios', title: 'Configuración pay-as-you-go transparente para campañas.', plans: [ { name: 'Creator Launch', price: '$0/mes', fee: '15% de procesamiento', features: ['Descarga de activos de campaña', 'Recálculo de presupuesto en servidor', 'Vista lista para checkout', 'Sin retainer mensual'] }, { name: 'Publicación Gestionada', price: 'Trae tu presupuesto', fee: 'Prefinanciado antes de liberar', features: ['Flujo publicar en mi nombre', 'Consentimiento antes del pago', 'Handoff de pago antes de activación', 'Broker dispatch bloqueado hasta confirmación'] }, { name: 'Enterprise Studio', price: 'Alcance personalizado', fee: 'Markup escalado por volumen', features: ['Revisión humana fallback', 'Escalación en cockpit SRE', 'Reportes aptos para procurement', 'Prensa/radio/TV sujetos a aprobación'] } ] },
  notes: { complianceTitle: 'Límite de seguridad y cumplimiento', complianceBody: 'Este flujo solo prepara presupuestos y handoff de pago. SignalBoost no dispara medios pagados ni llama APIs externas de anuncios, brokers, prensa, radio, TV, LinkedIn o YouTube hasta que existan confirmación de pago en servidor y aprobación operativa.', enterpriseTitle: 'Fallback humano para equipos enterprise', enterpriseBody: 'Las campañas grandes pueden pasar por un operador de SignalBoost para revisión de procurement, compuertas de aprobación, validación de canales y coordinación antes de activación en vivo.' },
}

const pl: AgencyCopy = {
  hero: { eyebrow: 'Silnik Agencji Omnichannel SignalBoost', title: 'Uruchamiaj globalne kampanie z przedpłaconą bramką bezpieczeństwa.', body: 'Planuj lokalizowane kreacje, modeluj budżet i przygotuj pakiety social, press, radio oraz TV-ready zanim jakiekolwiek płatne media lub brokerzy zostaną odblokowani.', primaryCta: 'Oszacuj budżet', secondaryCta: 'Zobacz ceny' },
  client: { title: 'Budżet kampanii przed startem', body: 'Wybierz pobranie materiałów kreatywnych albo przygotowanie pakietu publikacji zarządzanej. SignalBoost przelicza wszystkie kwoty po stronie serwera przed płatnością.', budgetLabel: 'Wybrany budżet w USD', modeLabel: 'Tryb realizacji', downloadMode: 'Pobierz materiały kreatywne', publishMode: 'Publikuj w moim imieniu', consentLabel: 'Rozumiem, że zewnętrzna publikacja jest zablokowana do potwierdzenia płatności po stronie serwera i że z tego podglądu nie następuje wysyłka do mediów/brokerów.', submit: 'Przygotuj podgląd checkout', paymentSubmit: 'Otwórz bezpieczną płatność', ready: 'Podgląd checkout gotowy. Żaden operator płatności nie został wywołany.', paymentReady: 'Przygotowano bezpieczny handoff płatności. Płatne media pozostają zablokowane do potwierdzenia webhook.', stripeUnavailable: 'Stripe nie jest jeszcze skonfigurowany, więc to pozostaje tylko podglądem gotowym do checkout.', noBrokerDispatch: 'Ten przepływ nie wywołuje API LinkedIn, YouTube, prasy, radia, TV ani ad exchange.', error: 'Wprowadź budżet większy niż zero i zaakceptuj zgodę publikacji, gdy jest wymagana.', summaryTitle: 'Podsumowanie obliczone przez serwer', selectedBudget: 'Wybrany budżet', processingFee: 'Opłata operacyjna', totalCharged: 'Suma do pobrania' },
  pricing: { eyebrow: 'Cennik', title: 'Przejrzysta konfiguracja kampanii pay-as-you-go.', plans: [ { name: 'Creator Launch', price: '$0/miesiąc', fee: '15% opłaty operacyjnej', features: ['Pobieranie materiałów kampanii', 'Przeliczenie budżetu po stronie serwera', 'Podgląd gotowy do checkout', 'Bez miesięcznego retainera'] }, { name: 'Publikacja zarządzana', price: 'Własny budżet', fee: 'Przedpłata przed odblokowaniem', features: ['Tryb publikuj w moim imieniu', 'Zgoda przed płatnością', 'Handoff płatności przed aktywacją', 'Broker dispatch zablokowany do potwierdzenia'] }, { name: 'Enterprise Studio', price: 'Zakres indywidualny', fee: 'Markup zależny od wolumenu', features: ['Ludzki fallback review', 'Eskalacja SRE cockpit', 'Raportowanie dla procurement', 'Prasa/radio/TV po akceptacji'] } ] },
  notes: { complianceTitle: 'Granica bezpieczeństwa i zgodności', complianceBody: 'Ten przepływ tylko przygotowuje budżety i handoff płatności. SignalBoost nie uruchamia płatnych mediów ani zewnętrznych API reklam, brokerów, prasy, radia, TV, LinkedIn czy YouTube bez serwerowego potwierdzenia płatności i zgód operacyjnych.', enterpriseTitle: 'Ludzki fallback dla zespołów enterprise', enterpriseBody: 'Duże kampanie mogą przejść przez operatora SignalBoost w celu przeglądu zakupowego, bramek akceptacji, walidacji kanałów i koordynacji przed aktywacją na żywo.' },
}

const ru: AgencyCopy = {
  hero: { eyebrow: 'Омниканальный агентский движок SignalBoost', title: 'Запускайте глобальные кампании через предоплаченную защитную точку.', body: 'Планируйте локализованные креативы, моделируйте бюджет и готовьте пакеты для social, press, radio и TV-ready до разблокировки платных медиа или брокеров.', primaryCta: 'Оценить бюджет', secondaryCta: 'Посмотреть цены' },
  client: { title: 'Предстартовый бюджет кампании', body: 'Выберите загрузку креативных материалов или подготовку управляемой публикации. SignalBoost пересчитывает все суммы на сервере перед любой платежной передачей.', budgetLabel: 'Выбранный бюджет в USD', modeLabel: 'Режим исполнения', downloadMode: 'Скачать креативные материалы', publishMode: 'Опубликовать от моего имени', consentLabel: 'Я понимаю, что внешняя публикация заблокирована до серверного подтверждения платежа и что из этого предпросмотра нет отправки в медиа/к брокерам.', submit: 'Подготовить checkout preview', paymentSubmit: 'Открыть безопасную оплату', ready: 'Checkout preview готов. Платежный провайдер не вызывался.', paymentReady: 'Безопасная передача платежа подготовлена. Платные медиа остаются заблокированы до webhook-подтверждения.', stripeUnavailable: 'Stripe еще не настроен, поэтому это остается только checkout-ready preview.', noBrokerDispatch: 'Этот поток не вызывает API LinkedIn, YouTube, press, radio, TV или ad exchange.', error: 'Введите бюджет больше нуля и примите согласие на публикацию, если оно требуется.', summaryTitle: 'Сводка, рассчитанная сервером', selectedBudget: 'Выбранный бюджет', processingFee: 'Комиссия обработки', totalCharged: 'Итого к оплате' },
  pricing: { eyebrow: 'Цены', title: 'Прозрачная настройка кампаний pay-as-you-go.', plans: [ { name: 'Creator Launch', price: '$0/месяц', fee: '15% комиссия обработки', features: ['Скачать материалы кампании', 'Серверный пересчет бюджета', 'Checkout-ready preview', 'Без ежемесячного ретейнера'] }, { name: 'Managed Publishing', price: 'Ваш бюджет', fee: 'Предоплата до разблокировки', features: ['Публикация от моего имени', 'Согласие перед оплатой', 'Платежный handoff перед активацией', 'Broker dispatch заблокирован до подтверждения'] }, { name: 'Enterprise Studio', price: 'Индивидуальный объем', fee: 'Markup по объему', features: ['Человеческий fallback review', 'Эскалация SRE cockpit', 'Отчетность для procurement', 'Press/radio/TV после одобрения'] } ] },
  notes: { complianceTitle: 'Граница безопасности и соответствия', complianceBody: 'Этот поток только готовит бюджеты и платежный handoff. SignalBoost не запускает платные медиа и не вызывает внешние API рекламы, брокеров, press, radio, TV, LinkedIn или YouTube без серверного подтверждения платежа и операционных approvals.', enterpriseTitle: 'Человеческий fallback для enterprise-команд', enterpriseBody: 'Крупные кампании могут проходить через оператора SignalBoost для procurement review, approval gates, проверки каналов и координации до live activation.' },
}

export const agencyCopy: Record<string, AgencyCopy> = { en, pt, es, pl, ru }

export function getAgencyCopy(lang?: string): AgencyCopy {
  const safe = lang && agencyCopy[lang] ? lang : 'en'
  return agencyCopy[safe]
}
