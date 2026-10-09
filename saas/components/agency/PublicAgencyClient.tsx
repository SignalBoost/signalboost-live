'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import CompanyIdentityPrompt from '@/components/company/CompanyIdentityPrompt'
import type { AgencyCopy } from '@/lib/i18n/agencyCopy'
import { uiText } from '@/lib/i18n/uiText'

export const FREE_ORGANIC_MODE = true
export const ENTERPRISE_READY = true

type CheckoutResponse = {
  selectedBudget: number
  processingFee: number
  totalCharged: number
  currency: 'USD'
  status: 'CHECKOUT_READY' | 'STRIPE_CHECKOUT_READY'
  stripeCheckoutUrl?: string
  stripeConfigured?: boolean
}

type OrganicAssets = {
  youtubeTitle: string
  youtubeDescription: string
  youtubeCommunityPost: string
  linkedinCompanyPost: string
  linkedinFounderPost: string
  pressReleaseSubject: string
  pressReleaseBody: string
}

type OrganicResponse = {
  ok: boolean
  error?: string
  assets?: OrganicAssets
}

type TenantCampaignProfile = {
  plan?: 'free' | 'starter' | 'pro' | 'enterprise'
  sponsoredEnterprise?: boolean
  corporateSponsored?: boolean
}

type PublicAgencyClientProps = {
  copy: AgencyCopy['client']
  tenantProfile?: TenantCampaignProfile
}

type Mode = 'download' | 'managed'
type ChannelMode = 'FREE_ORGANIC_MODE' | 'PROGRAMMATIC_ENTERPRISE'

const ORGANIC_COPY: Record<string, {
  formTitle: string
  companyLabel: string
  companyPlaceholder: string
  announcementLabel: string
  announcementPlaceholder: string
  audienceLabel: string
  audiencePlaceholder: string
  websiteLabel: string
  generate: string
  generating: string
  resultsTitle: string
  copyBtn: string
  copied: string
  regenerate: string
  genError: string
  requiredError: string
  dispatchTitle: string
  dispatchBody: string
  publicationLabel: string
  publicationPlaceholder: string
  editorEmailLabel: string
  dispatchBtn: string
  dispatching: string
  dispatchQueued: string
  dispatchError: string
  emailInvalid: string
  byokTitle: string
  byokBody: string
  byokProviderLabel: string
  byokKeyLabel: string
  byokKeyRequired: string
  byokKeyInvalid: string
  byokLiveLabel: string
  byokComingLabel: string
  byokConnected: string
  byokSaveKey: string
  byokDisconnect: string
  sections: { youtube: string; linkedin: string; press: string }
  labels: {
    youtubeTitle: string
    youtubeDescription: string
    youtubeCommunityPost: string
    linkedinCompanyPost: string
    linkedinFounderPost: string
    pressReleaseSubject: string
    pressReleaseBody: string
  }
}> = {
  en: {
    formTitle: uiText('generatedUi.u_4dc5c48933a9cea3'),
    companyLabel: uiText('generatedUi.u_f4ec6be1af66f9da'),
    companyPlaceholder: uiText('generatedUi.u_d6adad647ee2ba13'),
    announcementLabel: uiText('generatedUi.u_b9c8b8f3f9d54270'),
    announcementPlaceholder: uiText('generatedUi.u_dd29121bbaecf782'),
    audienceLabel: uiText('generatedUi.u_1161c6dae2ffb26c'),
    audiencePlaceholder: uiText('generatedUi.u_abeec4af74cc25d0'),
    websiteLabel: uiText('generatedUi.u_a1c8f67f62accec5'),
    generate: uiText('generatedUi.u_eb922c5869900d18'),
    generating: uiText('generatedUi.u_1015a71c930680e9'),
    resultsTitle: uiText('generatedUi.u_fd9e745546ea094e'),
    copyBtn: uiText('generatedUi.u_e21f935f11d7e966'),
    copied: uiText('generatedUi.u_8d525e5f158b9afe'),
    regenerate: uiText('generatedUi.u_1651031bf58d8eea'),
    genError: uiText('generatedUi.u_d1d007a52a5d557e'),
    requiredError: uiText('generatedUi.u_2ff59d0f8a6bbc10'),
    dispatchTitle: uiText('generatedUi.u_62186625402c2436'),
    dispatchBody: uiText('generatedUi.u_b1c9b3e510649d8e'),
    publicationLabel: uiText('generatedUi.u_eab011ad9ff060aa'),
    publicationPlaceholder: uiText('generatedUi.u_48df7099049b4bf1'),
    editorEmailLabel: uiText('generatedUi.u_66d92747c9801c50'),
    dispatchBtn: uiText('generatedUi.u_4c4767736de175c5'),
    dispatching: uiText('generatedUi.u_e043ca8743f13e14'),
    dispatchQueued: uiText('generatedUi.u_fff5b0bc57011f59'),
    dispatchError: uiText('generatedUi.u_cd30cf65853c01c3'),
    emailInvalid: uiText('generatedUi.u_7db048b948a929d9'),
    byokTitle: uiText('generatedUi.u_761278e2d1c93816'),
    byokBody: uiText('generatedUi.u_a128cfc58b3b17a3'),
    byokProviderLabel: uiText('generatedUi.u_8791254537f430ca'),
    byokKeyLabel: uiText('generatedUi.u_ae563693e9639134'),
    byokKeyRequired: uiText('generatedUi.u_1ef52a8443e3d618'),
    byokKeyInvalid: uiText('generatedUi.u_4a682edd82b691ea'),
    byokLiveLabel: uiText('generatedUi.u_2a4729fa7647b090'),
    byokComingLabel: uiText('generatedUi.u_4f7d64017689437e'),
    byokConnected: uiText('generatedUi.u_22965568d22a14ee'),
    byokSaveKey: uiText('generatedUi.u_2a54c26197a2644c'),
    byokDisconnect: uiText('generatedUi.u_acfc5be785a9bb3d'),
    sections: { youtube: uiText('generatedUi.u_bd8b194062a0cffb'), linkedin: uiText('generatedUi.u_c9ab28bdd9945720'), press: uiText('generatedUi.u_8ce3b2b64f4b2302') },
    labels: {
      youtubeTitle: uiText('generatedUi.u_ff9a9985951b07b6'),
      youtubeDescription: uiText('generatedUi.u_9d23a14b9a2ae811'),
      youtubeCommunityPost: uiText('generatedUi.u_ed1705c8817c8b49'),
      linkedinCompanyPost: uiText('generatedUi.u_8b841c7ff24acd03'),
      linkedinFounderPost: uiText('generatedUi.u_6eec798c9467f769'),
      pressReleaseSubject: uiText('generatedUi.u_848f0ca2c125e4dc'),
      pressReleaseBody: uiText('generatedUi.u_f69ea3f5d4240cb7'),
    },
  },
  es: {
    formTitle: 'Describe tu campaña en un solo prompt',
    companyLabel: 'Nombre de la empresa o marca',
    companyPlaceholder: 'ej. Acme Analytics',
    announcementLabel: '¿Qué estás anunciando o promocionando?',
    announcementPlaceholder: 'ej. Lanzamos nuestro nuevo dashboard de reportes con IA para agencias pequeñas',
    audienceLabel: 'Audiencia objetivo (opcional)',
    audiencePlaceholder: 'ej. Directores de marketing en agencias medianas',
    websiteLabel: 'Sitio web o enlace CTA (opcional)',
    generate: 'Generar activos de campaña orgánica',
    generating: 'Generando activos de campaña…',
    resultsTitle: 'Tus activos de campaña orgánica',
    copyBtn: 'Copiar',
    copied: 'Copiado',
    regenerate: 'Regenerar',
    genError: 'La generación falló. Inténtalo de nuevo en un momento.',
    requiredError: 'Ingresa el nombre de tu empresa y qué estás anunciando.',
    dispatchTitle: 'Enviar este press release',
    dispatchBody: 'Pon en cola el press release para envío real por email. Primero pasa por revisión del owner — nada se envía al periodista hasta que se apruebe en el espacio de Marketing.',
    publicationLabel: 'Nombre de la publicación',
    publicationPlaceholder: 'ej. TechCrunch, diario local de negocios',
    editorEmailLabel: 'Email del editor / periodista',
    dispatchBtn: 'Poner press release en cola de envío',
    dispatching: 'Poniendo en cola para aprobación…',
    dispatchQueued: 'En cola. El press release queda bloqueado para aprobación del owner y se enviará por email al periodista una vez aprobado.',
    dispatchError: 'No se pudo poner en cola el press release. Inténtalo de nuevo.',
    emailInvalid: 'Ingresa el nombre de la publicación y un email válido del editor.',
    byokTitle: 'Impúlsalo con tu propia cuenta de IA',
    byokBody: 'Pagas directamente a tu proveedor de IA — aprox. $0.03 por generación con Claude, menos con OpenAI. Tu clave se usa solo para esta solicitud, nunca se guarda ni se registra.',
    byokProviderLabel: 'Proveedor de IA',
    byokKeyLabel: 'Tu API key',
    byokKeyRequired: 'Pega la API key de tu proveedor de IA para generar. Pagas al proveedor directamente por generación.',
    byokKeyInvalid: 'El proveedor rechazó tu API key. Revísala e inténtalo de nuevo.',
    byokLiveLabel: 'Disponible ahora',
    byokComingLabel: 'Próximamente',
    byokConnected: 'Conectado',
    byokSaveKey: 'Guardar esta clave en mi cuenta para la próxima vez',
    byokDisconnect: 'Desconectar',
    sections: { youtube: 'YouTube orgánico', linkedin: 'LinkedIn orgánico', press: 'Email de press release' },
    labels: {
      youtubeTitle: 'Título del video',
      youtubeDescription: 'Descripción del video',
      youtubeCommunityPost: 'Post de comunidad',
      linkedinCompanyPost: 'Post de página de empresa',
      linkedinFounderPost: 'Post del fundador',
      pressReleaseSubject: 'Asunto del email',
      pressReleaseBody: 'Cuerpo del email',
    },
  },
  pt: {
    formTitle: 'Descreva sua campanha em um único prompt',
    companyLabel: 'Nome da empresa ou marca',
    companyPlaceholder: 'ex. Acme Analytics',
    announcementLabel: 'O que você está anunciando ou promovendo?',
    announcementPlaceholder: 'ex. Lançamento do nosso novo dashboard de relatórios com IA para agências pequenas',
    audienceLabel: 'Público-alvo (opcional)',
    audiencePlaceholder: 'ex. Diretores de marketing em agências de médio porte',
    websiteLabel: 'Site ou link de CTA (opcional)',
    generate: 'Gerar ativos de campanha orgânica',
    generating: 'Gerando ativos de campanha…',
    resultsTitle: 'Seus ativos de campanha orgânica',
    copyBtn: 'Copiar',
    copied: 'Copiado',
    regenerate: 'Gerar novamente',
    genError: 'A geração falhou. Tente novamente em instantes.',
    requiredError: 'Informe o nome da empresa e o que você está anunciando.',
    dispatchTitle: 'Despachar este press release',
    dispatchBody: 'Coloque o press release na fila para envio real por e-mail. Ele passa primeiro pela revisão do owner — nada é enviado ao jornalista até ser aprovado no espaço de Marketing.',
    publicationLabel: 'Nome da publicação',
    publicationPlaceholder: 'ex. TechCrunch, jornal local de negócios',
    editorEmailLabel: 'E-mail do editor / jornalista',
    dispatchBtn: 'Colocar press release na fila de envio',
    dispatching: 'Colocando na fila para aprovação…',
    dispatchQueued: 'Na fila. O press release fica bloqueado para aprovação do owner e será enviado por e-mail ao jornalista após aprovação.',
    dispatchError: 'Não foi possível colocar o press release na fila. Tente novamente.',
    emailInvalid: 'Informe o nome da publicação e um e-mail válido do editor.',
    byokTitle: 'Use sua própria conta de IA',
    byokBody: 'Você paga diretamente ao seu provedor de IA — cerca de US$ 0,03 por geração com Claude, menos com OpenAI. Sua chave é usada apenas nesta solicitação, nunca é armazenada nem registrada.',
    byokProviderLabel: 'Provedor de IA',
    byokKeyLabel: 'Sua API key',
    byokKeyRequired: 'Cole a API key do seu provedor de IA para gerar. Você paga o provedor diretamente por geração.',
    byokKeyInvalid: 'O provedor rejeitou sua API key. Verifique e tente novamente.',
    byokLiveLabel: 'Disponível agora',
    byokComingLabel: 'Em breve',
    byokConnected: 'Conectado',
    byokSaveKey: 'Salvar esta chave na minha conta para a próxima vez',
    byokDisconnect: 'Desconectar',
    sections: { youtube: 'YouTube orgânico', linkedin: 'LinkedIn orgânico', press: 'E-mail de press release' },
    labels: {
      youtubeTitle: 'Título do vídeo',
      youtubeDescription: 'Descrição do vídeo',
      youtubeCommunityPost: 'Post de comunidade',
      linkedinCompanyPost: 'Post da página da empresa',
      linkedinFounderPost: 'Post do fundador',
      pressReleaseSubject: 'Assunto do e-mail',
      pressReleaseBody: 'Corpo do e-mail',
    },
  },
  pl: {
    formTitle: 'Opisz swoją kampanię jednym promptem',
    companyLabel: 'Nazwa firmy lub marki',
    companyPlaceholder: 'np. Acme Analytics',
    announcementLabel: 'Co ogłaszasz lub promujesz?',
    announcementPlaceholder: 'np. Premiera naszego nowego dashboardu raportów AI dla małych agencji',
    audienceLabel: 'Grupa docelowa (opcjonalnie)',
    audiencePlaceholder: 'np. Dyrektorzy marketingu w średnich agencjach',
    websiteLabel: 'Strona lub link CTA (opcjonalnie)',
    generate: 'Wygeneruj materiały kampanii organicznej',
    generating: 'Generowanie materiałów kampanii…',
    resultsTitle: 'Twoje materiały kampanii organicznej',
    copyBtn: 'Kopiuj',
    copied: 'Skopiowano',
    regenerate: 'Wygeneruj ponownie',
    genError: 'Generowanie nie powiodło się. Spróbuj ponownie za chwilę.',
    requiredError: 'Podaj nazwę firmy i co ogłaszasz.',
    dispatchTitle: 'Wyślij ten press release',
    dispatchBody: 'Dodaj press release do kolejki prawdziwej wysyłki e-mail. Najpierw trafia do przeglądu ownera — nic nie jest wysyłane do dziennikarza do czasu akceptacji w przestrzeni Marketing.',
    publicationLabel: 'Nazwa publikacji',
    publicationPlaceholder: 'np. TechCrunch, lokalny dziennik biznesowy',
    editorEmailLabel: 'E-mail redaktora / dziennikarza',
    dispatchBtn: 'Dodaj press release do kolejki wysyłki',
    dispatching: 'Dodawanie do kolejki akceptacji…',
    dispatchQueued: 'W kolejce. Press release jest zablokowany do akceptacji ownera i zostanie wysłany e-mailem do dziennikarza po zatwierdzeniu.',
    dispatchError: 'Nie udało się dodać press release do kolejki. Spróbuj ponownie.',
    emailInvalid: 'Podaj nazwę publikacji i prawidłowy e-mail redaktora.',
    byokTitle: 'Zasil to własnym kontem AI',
    byokBody: 'Płacisz bezpośrednio swojemu dostawcy AI — ok. 0,03 USD za generację z Claude, mniej z OpenAI. Twój klucz jest używany tylko dla tego żądania, nigdy nie jest zapisywany ani logowany.',
    byokProviderLabel: 'Dostawca AI',
    byokKeyLabel: 'Twój klucz API',
    byokKeyRequired: 'Wklej klucz API swojego dostawcy AI, aby generować. Płacisz dostawcy bezpośrednio za generację.',
    byokKeyInvalid: 'Dostawca odrzucił Twój klucz API. Sprawdź go i spróbuj ponownie.',
    byokLiveLabel: 'Dostępne teraz',
    byokComingLabel: 'Wkrótce',
    byokConnected: 'Połączono',
    byokSaveKey: 'Zapisz ten klucz na moim koncie na przyszłość',
    byokDisconnect: 'Odłącz',
    sections: { youtube: 'YouTube organicznie', linkedin: 'LinkedIn organicznie', press: 'E-mail press release' },
    labels: {
      youtubeTitle: 'Tytuł wideo',
      youtubeDescription: 'Opis wideo',
      youtubeCommunityPost: 'Post społeczności',
      linkedinCompanyPost: 'Post strony firmowej',
      linkedinFounderPost: 'Post założyciela',
      pressReleaseSubject: 'Temat e-maila',
      pressReleaseBody: 'Treść e-maila',
    },
  },
  ru: {
    formTitle: 'Опишите вашу кампанию одним промптом',
    companyLabel: 'Название компании или бренда',
    companyPlaceholder: 'напр. Acme Analytics',
    announcementLabel: 'Что вы анонсируете или продвигаете?',
    announcementPlaceholder: 'напр. Запуск нового AI-дашборда отчетов для небольших агентств',
    audienceLabel: 'Целевая аудитория (необязательно)',
    audiencePlaceholder: 'напр. Директора по маркетингу в средних агентствах',
    websiteLabel: 'Сайт или CTA-ссылка (необязательно)',
    generate: 'Сгенерировать материалы organic-кампании',
    generating: 'Генерация материалов кампании…',
    resultsTitle: 'Ваши материалы organic-кампании',
    copyBtn: 'Копировать',
    copied: 'Скопировано',
    regenerate: 'Сгенерировать заново',
    genError: 'Генерация не удалась. Попробуйте снова через минуту.',
    requiredError: 'Укажите название компании и что вы анонсируете.',
    dispatchTitle: 'Отправить этот press release',
    dispatchBody: 'Поставьте press release в очередь на реальную e-mail-отправку. Сначала он проходит проверку owner — журналисту ничего не отправляется до одобрения в Marketing workspace.',
    publicationLabel: 'Название издания',
    publicationPlaceholder: 'напр. TechCrunch, местный деловой журнал',
    editorEmailLabel: 'E-mail редактора / журналиста',
    dispatchBtn: 'Поставить press release в очередь отправки',
    dispatching: 'Постановка в очередь на одобрение…',
    dispatchQueued: 'В очереди. Press release заблокирован до одобрения owner и будет отправлен журналисту по e-mail после утверждения.',
    dispatchError: 'Не удалось поставить press release в очередь. Попробуйте снова.',
    emailInvalid: 'Укажите название издания и корректный e-mail редактора.',
    byokTitle: 'Работает с вашим собственным AI-аккаунтом',
    byokBody: 'Вы платите AI-провайдеру напрямую — около $0.03 за генерацию с Claude, меньше с OpenAI. Ключ используется только для этого запроса, никогда не сохраняется и не логируется.',
    byokProviderLabel: 'AI-провайдер',
    byokKeyLabel: 'Ваш API-ключ',
    byokKeyRequired: 'Вставьте API-ключ вашего AI-провайдера для генерации. Вы платите провайдеру напрямую за каждую генерацию.',
    byokKeyInvalid: 'Провайдер отклонил ваш API-ключ. Проверьте его и попробуйте снова.',
    byokLiveLabel: 'Доступно сейчас',
    byokComingLabel: 'Скоро',
    byokConnected: 'Подключено',
    byokSaveKey: 'Сохранить этот ключ в моем аккаунте на будущее',
    byokDisconnect: 'Отключить',
    sections: { youtube: 'YouTube organic', linkedin: 'LinkedIn organic', press: 'Press release e-mail' },
    labels: {
      youtubeTitle: 'Название видео',
      youtubeDescription: 'Описание видео',
      youtubeCommunityPost: 'Пост сообщества',
      linkedinCompanyPost: 'Пост страницы компании',
      linkedinFounderPost: 'Пост основателя',
      pressReleaseSubject: 'Тема письма',
      pressReleaseBody: 'Текст письма',
    },
  },
  de: {
    formTitle: 'Beschreiben Sie Ihre Kampagne in einem Prompt',
    companyLabel: 'Unternehmens- oder Markenname',
    companyPlaceholder: 'z. B. Acme Analytics',
    announcementLabel: 'Was kündigen Sie an oder bewerben Sie?',
    announcementPlaceholder: 'z. B. Einführung unseres neuen KI-Reporting-Dashboards für kleine Agenturen',
    audienceLabel: 'Zielgruppe (optional)',
    audiencePlaceholder: 'z. B. Marketingleiter bei mittelgroßen Agenturen',
    websiteLabel: 'Website- oder CTA-Link (optional)',
    generate: 'Organische Kampagnen-Assets generieren',
    generating: 'Kampagnen-Assets werden generiert…',
    resultsTitle: 'Ihre Assets für organische Kampagnen',
    copyBtn: 'Kopieren',
    copied: 'Kopiert',
    regenerate: 'Neu generieren',
    genError: 'Generierung fehlgeschlagen. Bitte versuchen Sie es gleich noch einmal.',
    requiredError: 'Geben Sie Ihren Firmennamen und Ihre Ankündigung ein.',
    dispatchTitle: 'Diese Pressemitteilung versenden',
    dispatchBody: 'Stellen Sie die Pressemitteilung für den tatsächlichen E-Mail-Versand in die Warteschlange. Sie geht zuerst zur Prüfung an den Inhaber – an den Journalisten wird nichts gesendet, bis sie im Marketing-Arbeitsbereich freigegeben wurde.',
    publicationLabel: 'Name der Publikation',
    publicationPlaceholder: 'z. B. TechCrunch, Local Business Journal',
    editorEmailLabel: 'E-Mail des Redakteurs / Journalisten',
    dispatchBtn: 'Pressemitteilung zum Versand einreihen',
    dispatching: 'Wird zur Genehmigung eingereiht…',
    dispatchQueued: 'In der Warteschlange. Die Pressemitteilung ist bis zur Genehmigung durch den Inhaber gesperrt und wird nach der Genehmigung per E-Mail an den Journalisten gesendet.',
    dispatchError: 'Die Pressemitteilung konnte nicht in die Warteschlange gestellt werden. Bitte versuchen Sie es erneut.',
    emailInvalid: 'Geben Sie den Namen der Publikation und eine gültige E-Mail-Adresse der Redaktion ein.',
    byokTitle: 'Betreiben Sie es mit Ihrem eigenen KI-Konto',
    byokBody: 'Sie bezahlen Ihren KI-Anbieter direkt – etwa 0,03 $ pro Generierung mit Claude, weniger mit OpenAI. Ihr Schlüssel wird nur für diese Anfrage verwendet, niemals gespeichert und niemals protokolliert.',
    byokProviderLabel: 'KI-Anbieter',
    byokKeyLabel: 'Ihr API-Schlüssel',
    byokKeyRequired: 'Fügen Sie den API-Schlüssel Ihres KI-Anbieters ein, um zu generieren. Sie bezahlen den Anbieter direkt pro Generierung.',
    byokKeyInvalid: 'Ihr API-Schlüssel wurde vom Anbieter abgelehnt. Prüfen Sie ihn und versuchen Sie es erneut.',
    byokLiveLabel: 'Jetzt verfügbar',
    byokComingLabel: 'Demnächst verfügbar',
    byokConnected: 'Verbunden',
    byokSaveKey: 'Diesen Schlüssel für das nächste Mal in meinem Konto speichern',
    byokDisconnect: 'Trennen',
    sections: { youtube: 'YouTube organisch', linkedin: 'LinkedIn organisch', press: 'Pressemitteilungs-E-Mail' },
    labels: {
      youtubeTitle: 'Videotitel',
      youtubeDescription: 'Videobeschreibung',
      youtubeCommunityPost: 'Community-Beitrag',
      linkedinCompanyPost: 'Beitrag auf der Unternehmensseite',
      linkedinFounderPost: 'Gründer-Beitrag',
      pressReleaseSubject: 'E-Mail-Betreff',
      pressReleaseBody: 'E-Mail-Text',
    },
  },
  fr: {
    formTitle: 'Décrivez votre campagne en un seul prompt',
    companyLabel: 'Nom de l\'entreprise ou de la marque',
    companyPlaceholder: 'p. ex. Acme Analytics',
    announcementLabel: 'Qu\'annoncez-vous ou que promouvez-vous ?',
    announcementPlaceholder: 'p. ex. Lancement de notre nouveau tableau de bord de reporting IA pour les petites agences',
    audienceLabel: 'Public cible (facultatif)',
    audiencePlaceholder: 'ex. : directeurs marketing d’agences de taille moyenne',
    websiteLabel: 'Lien du site web ou du CTA (facultatif)',
    generate: 'Générer des ressources de campagne organique',
    generating: 'Génération des éléments de campagne…',
    resultsTitle: 'Vos ressources de campagne organique',
    copyBtn: 'Copier',
    copied: 'Copié',
    regenerate: 'Régénérer',
    genError: 'Échec de la génération. Veuillez réessayer dans un instant.',
    requiredError: 'Saisissez le nom de votre entreprise et ce que vous annoncez.',
    dispatchTitle: 'Diffuser ce communiqué de presse',
    dispatchBody: 'Mettez le communiqué de presse en file d\'attente pour un envoi réel par e-mail. Il passe d\'abord par la révision du propriétaire : rien n\'est envoyé au journaliste tant qu\'il n\'est pas approuvé dans l\'espace de travail Marketing.',
    publicationLabel: 'Nom de la publication',
    publicationPlaceholder: 'ex. TechCrunch, Local Business Journal',
    editorEmailLabel: 'E-mail du rédacteur / journaliste',
    dispatchBtn: 'Mettre le communiqué de presse en file d’envoi',
    dispatching: 'Mise en file d’attente pour approbation…',
    dispatchQueued: 'En file d’attente. Le communiqué de presse est verrouillé dans l’attente de l’approbation du propriétaire et sera envoyé par e-mail au journaliste une fois approuvé.',
    dispatchError: 'Impossible de mettre le communiqué de presse en file d’attente. Veuillez réessayer.',
    emailInvalid: 'Saisissez le nom de la publication et une adresse e-mail valide du rédacteur.',
    byokTitle: 'Alimentez-le avec votre propre compte IA',
    byokBody: 'Vous payez directement votre fournisseur d’IA — environ 0,03 $ par génération avec Claude, moins avec OpenAI. Votre clé n’est utilisée que pour cette requête, jamais stockée, jamais journalisée.',
    byokProviderLabel: 'Fournisseur d’IA',
    byokKeyLabel: 'Votre clé API',
    byokKeyRequired: 'Collez la clé API de votre fournisseur d’IA pour générer. Vous payez directement le fournisseur à chaque génération.',
    byokKeyInvalid: 'Votre clé API a été refusée par le fournisseur. Vérifiez-la et réessayez.',
    byokLiveLabel: 'Disponible maintenant',
    byokComingLabel: 'Bientôt disponible',
    byokConnected: 'Connecté',
    byokSaveKey: 'Enregistrer cette clé dans mon compte pour la prochaine fois',
    byokDisconnect: 'Déconnecter',
    sections: { youtube: 'YouTube organique', linkedin: 'LinkedIn organique', press: 'E-mail de communiqué de presse' },
    labels: {
      youtubeTitle: 'Titre de la vidéo',
      youtubeDescription: 'Description de la vidéo',
      youtubeCommunityPost: 'Publication de la communauté',
      linkedinCompanyPost: 'Publication sur la page entreprise',
      linkedinFounderPost: 'Publication du fondateur',
      pressReleaseSubject: 'Objet de l’e-mail',
      pressReleaseBody: 'Corps de l\'e-mail',
    },
  },
  it: {
    formTitle: 'Descrivi la tua campagna in un unico prompt',
    companyLabel: 'Nome dell\'azienda o del brand',
    companyPlaceholder: 'es. Acme Analytics',
    announcementLabel: 'Cosa stai annunciando o promuovendo?',
    announcementPlaceholder: 'es. Lancio della nostra nuova dashboard di reportistica AI per piccole agenzie',
    audienceLabel: 'Pubblico di destinazione (facoltativo)',
    audiencePlaceholder: 'es. Direttori marketing di agenzie di medie dimensioni',
    websiteLabel: 'Link al sito web o CTA (facoltativo)',
    generate: 'Genera asset per campagne organiche',
    generating: 'Generazione degli asset della campagna…',
    resultsTitle: 'Le risorse della tua campagna organica',
    copyBtn: 'Copia',
    copied: 'Copiato',
    regenerate: 'Rigenera',
    genError: 'Generazione non riuscita. Riprova tra un momento.',
    requiredError: 'Inserisci il nome della tua azienda e cosa stai annunciando.',
    dispatchTitle: 'Invia questo comunicato stampa',
    dispatchBody: 'Metti in coda il comunicato stampa per l\'invio reale via email. Passa prima alla revisione del proprietario: nulla viene inviato al giornalista finché non viene approvato nello spazio di lavoro Marketing.',
    publicationLabel: 'Nome della pubblicazione',
    publicationPlaceholder: 'es. TechCrunch, Local Business Journal',
    editorEmailLabel: 'Email del redattore / giornalista',
    dispatchBtn: 'Metti in coda il comunicato stampa per l’invio',
    dispatching: 'Messa in coda per l’approvazione…',
    dispatchQueued: 'In coda. Il comunicato stampa è bloccato in attesa dell’approvazione del proprietario e verrà inviato via email al giornalista una volta approvato.',
    dispatchError: 'Impossibile mettere in coda il comunicato stampa. Riprova.',
    emailInvalid: 'Inserisci il nome della pubblicazione e un’email valida del redattore.',
    byokTitle: 'Alimentalo con il tuo account AI',
    byokBody: 'Paghi direttamente il tuo provider di AI: circa 0,03 $ per generazione con Claude, meno con OpenAI. La tua chiave viene usata solo per questa richiesta, mai archiviata, mai registrata.',
    byokProviderLabel: 'Provider AI',
    byokKeyLabel: 'La tua chiave API',
    byokKeyRequired: 'Incolla la chiave API del tuo provider AI per generare. Paghi il provider direttamente per ogni generazione.',
    byokKeyInvalid: 'La tua chiave API è stata rifiutata dal provider. Controllala e riprova.',
    byokLiveLabel: 'Disponibile ora',
    byokComingLabel: 'Prossimamente',
    byokConnected: 'Connesso',
    byokSaveKey: 'Salva questa chiave nel mio account per la prossima volta',
    byokDisconnect: 'Disconnetti',
    sections: { youtube: 'YouTube organico', linkedin: 'LinkedIn organico', press: 'Email del comunicato stampa' },
    labels: {
      youtubeTitle: 'Titolo del video',
      youtubeDescription: 'Descrizione del video',
      youtubeCommunityPost: 'Post della community',
      linkedinCompanyPost: 'Post sulla pagina aziendale',
      linkedinFounderPost: 'Post del fondatore',
      pressReleaseSubject: 'Oggetto dell’email',
      pressReleaseBody: 'Corpo dell\'email',
    },
  },
  ja: {
    formTitle: 'キャンペーンを 1 つのプロンプトで説明',
    companyLabel: '会社名またはブランド名',
    companyPlaceholder: '例：Acme Analytics',
    announcementLabel: '何を発表または宣伝しますか？',
    announcementPlaceholder: '例：小規模エージェンシー向けの新しい AI レポートダッシュボードをリリース',
    audienceLabel: 'ターゲットオーディエンス（任意）',
    audiencePlaceholder: '例：中規模代理店のマーケティングディレクター',
    websiteLabel: 'ウェブサイトまたは CTA リンク（任意）',
    generate: 'オーガニックキャンペーンのアセットを生成',
    generating: 'キャンペーン素材を生成中…',
    resultsTitle: 'オーガニックキャンペーンのアセット',
    copyBtn: 'コピー',
    copied: 'コピーしました',
    regenerate: '再生成',
    genError: '生成に失敗しました。しばらくしてからもう一度お試しください。',
    requiredError: '会社名と発表内容を入力してください。',
    dispatchTitle: 'このプレスリリースを配信',
    dispatchBody: 'プレスリリースを実際のメール送信キューに追加します。まずオーナーのレビューに回され、マーケティングワークスペースで承認されるまで記者には何も送信されません。',
    publicationLabel: '媒体名',
    publicationPlaceholder: '例：TechCrunch、Local Business Journal',
    editorEmailLabel: '編集者 / 記者のメールアドレス',
    dispatchBtn: 'プレスリリースを配信キューに追加',
    dispatching: '承認キューに追加中…',
    dispatchQueued: 'キューに追加されました。プレスリリースはオーナーの承認待ちでロックされており、承認後にジャーナリストへメールで送信されます。',
    dispatchError: 'プレスリリースをキューに追加できませんでした。もう一度お試しください。',
    emailInvalid: '媒体名と有効な編集者のメールアドレスを入力してください。',
    byokTitle: 'ご自身の AI アカウントで動かしましょう',
    byokBody: 'AI プロバイダーには直接お支払いいただきます。Claude では 1 回の生成あたり約 0.03 ドル、OpenAI ではそれ以下です。キーはこのリクエストにのみ使用され、保存もログ記録も一切されません。',
    byokProviderLabel: 'AI プロバイダー',
    byokKeyLabel: 'お客様のAPIキー',
    byokKeyRequired: '生成するには AI プロバイダーの API キーを貼り付けてください。料金は生成ごとにプロバイダーへ直接お支払いいただきます。',
    byokKeyInvalid: 'API キーがプロバイダーに拒否されました。確認して再試行してください。',
    byokLiveLabel: '今すぐ利用可能',
    byokComingLabel: '近日公開',
    byokConnected: '接続済み',
    byokSaveKey: '次回のためにこのキーをアカウントに保存',
    byokDisconnect: '接続解除',
    sections: { youtube: 'YouTube オーガニック', linkedin: 'LinkedIn オーガニック', press: 'プレスリリースメール' },
    labels: {
      youtubeTitle: '動画タイトル',
      youtubeDescription: '動画の説明',
      youtubeCommunityPost: 'コミュニティ投稿',
      linkedinCompanyPost: '企業ページの投稿',
      linkedinFounderPost: '創業者の投稿',
      pressReleaseSubject: 'メールの件名',
      pressReleaseBody: 'メール本文',
    },
  },
  ko: {
    formTitle: '하나의 프롬프트로 캠페인을 설명하세요',
    companyLabel: '회사 또는 브랜드 이름',
    companyPlaceholder: '예: Acme Analytics',
    announcementLabel: '무엇을 발표하거나 홍보하시나요?',
    announcementPlaceholder: '예: 소규모 에이전시를 위한 새로운 AI 보고 대시보드 출시',
    audienceLabel: '대상 고객(선택 사항)',
    audiencePlaceholder: '예: 중견 에이전시의 마케팅 디렉터',
    websiteLabel: '웹사이트 또는 CTA 링크(선택 사항)',
    generate: '오가닉 캠페인 자산 생성',
    generating: '캠페인 에셋 생성 중…',
    resultsTitle: '오가닉 캠페인 자산',
    copyBtn: '복사',
    copied: '복사됨',
    regenerate: '다시 생성',
    genError: '생성에 실패했습니다. 잠시 후 다시 시도하세요.',
    requiredError: '회사 이름과 발표 내용을 입력하세요.',
    dispatchTitle: '이 보도자료 발송',
    dispatchBody: '보도 자료를 실제 이메일 발송 대기열에 추가합니다. 먼저 소유자 검토를 거치며, 마케팅 작업 공간에서 승인될 때까지 기자에게는 아무것도 발송되지 않습니다.',
    publicationLabel: '매체 이름',
    publicationPlaceholder: '예: TechCrunch, Local Business Journal',
    editorEmailLabel: '편집자 / 기자 이메일',
    dispatchBtn: '보도자료를 발송 대기열에 추가',
    dispatching: '승인 대기열에 추가 중…',
    dispatchQueued: '대기열에 추가되었습니다. 보도 자료는 소유자 승인을 위해 잠겨 있으며 승인되면 기자에게 이메일로 발송됩니다.',
    dispatchError: '보도 자료를 대기열에 추가할 수 없습니다. 다시 시도하세요.',
    emailInvalid: '매체 이름과 유효한 편집자 이메일을 입력하세요.',
    byokTitle: '본인의 AI 계정으로 구동하세요',
    byokBody: 'AI 공급자에게 직접 비용을 지불합니다. Claude는 생성 1회당 약 0.03달러이며 OpenAI는 더 저렴합니다. 키는 이 요청에만 사용되며 저장되거나 기록되지 않습니다.',
    byokProviderLabel: 'AI 공급자',
    byokKeyLabel: 'API 키',
    byokKeyRequired: '생성하려면 AI 공급자의 API 키를 붙여 넣으세요. 생성할 때마다 공급자에게 직접 비용을 지불합니다.',
    byokKeyInvalid: '제공업체에서 API 키를 거부했습니다. 확인 후 다시 시도하세요.',
    byokLiveLabel: '지금 이용 가능',
    byokComingLabel: '출시 예정',
    byokConnected: '연결됨',
    byokSaveKey: '다음을 위해 이 키를 내 계정에 저장',
    byokDisconnect: '연결 해제',
    sections: { youtube: 'YouTube 오가닉', linkedin: 'LinkedIn 오가닉', press: '보도 자료 이메일' },
    labels: {
      youtubeTitle: '동영상 제목',
      youtubeDescription: '동영상 설명',
      youtubeCommunityPost: '커뮤니티 게시물',
      linkedinCompanyPost: '회사 페이지 게시물',
      linkedinFounderPost: '창업자 게시물',
      pressReleaseSubject: '이메일 제목',
      pressReleaseBody: '이메일 본문',
    },
  },
  ar: {
    formTitle: 'صف حملتك في موجّه واحد',
    companyLabel: 'اسم الشركة أو العلامة التجارية',
    companyPlaceholder: 'مثال: Acme Analytics',
    announcementLabel: 'ما الذي تعلن عنه أو تروّج له؟',
    announcementPlaceholder: 'مثال: إطلاق لوحة تقارير الذكاء الاصطناعي الجديدة للوكالات الصغيرة',
    audienceLabel: 'الجمهور المستهدف (اختياري)',
    audiencePlaceholder: 'مثال: مديرو التسويق في الوكالات متوسطة الحجم',
    websiteLabel: 'رابط الموقع أو دعوة الإجراء (اختياري)',
    generate: 'إنشاء أصول الحملة العضوية',
    generating: 'جارٍ إنشاء أصول الحملة…',
    resultsTitle: 'أصول حملتك العضوية',
    copyBtn: 'نسخ',
    copied: 'تم النسخ',
    regenerate: 'إعادة الإنشاء',
    genError: 'فشل الإنشاء. يُرجى المحاولة مرة أخرى بعد قليل.',
    requiredError: 'أدخل اسم شركتك وما تعلن عنه.',
    dispatchTitle: 'إرسال هذا البيان الصحفي',
    dispatchBody: 'ضع البيان الصحفي في قائمة الانتظار للإرسال الفعلي عبر البريد الإلكتروني. يذهب أولًا إلى مراجعة المالك، ولا يُرسَل أي شيء إلى الصحفي حتى تتم الموافقة عليه في مساحة عمل التسويق.',
    publicationLabel: 'اسم المنشور',
    publicationPlaceholder: 'مثل TechCrunch، Local Business Journal',
    editorEmailLabel: 'البريد الإلكتروني للمحرر / الصحفي',
    dispatchBtn: 'إضافة البيان الصحفي إلى قائمة الإرسال',
    dispatching: 'جارٍ الإضافة إلى قائمة الموافقة…',
    dispatchQueued: 'في قائمة الانتظار. البيان الصحفي مقفل بانتظار موافقة المالك، وسيُرسَل إلى الصحفي عبر البريد الإلكتروني فور الموافقة عليه.',
    dispatchError: 'تعذّر إضافة البيان الصحفي إلى قائمة الانتظار. يُرجى المحاولة مرة أخرى.',
    emailInvalid: 'أدخل اسم المطبوعة وبريدًا إلكترونيًا صالحًا للمحرر.',
    byokTitle: 'شغّله باستخدام حساب الذكاء الاصطناعي الخاص بك',
    byokBody: 'تدفع لمزوّد الذكاء الاصطناعي مباشرةً — نحو 0.03 دولار لكل عملية توليد مع Claude، وأقل مع OpenAI. يُستخدم مفتاحك لهذا الطلب فقط، ولا يُخزَّن ولا يُسجَّل أبدًا.',
    byokProviderLabel: 'مزوّد AI',
    byokKeyLabel: 'مفتاح API الخاص بك',
    byokKeyRequired: 'الصق مفتاح API الخاص بمزوّد الذكاء الاصطناعي لديك لبدء الإنشاء. تدفع للمزوّد مباشرةً عن كل عملية إنشاء.',
    byokKeyInvalid: 'رفض المزوّد مفتاح API الخاص بك. تحقق منه وحاول مرة أخرى.',
    byokLiveLabel: 'متاح الآن',
    byokComingLabel: 'قريبًا',
    byokConnected: 'متصل',
    byokSaveKey: 'حفظ هذا المفتاح في حسابي للمرة القادمة',
    byokDisconnect: 'قطع الاتصال',
    sections: { youtube: 'YouTube العضوي', linkedin: 'LinkedIn العضوي', press: 'بريد البيان الصحفي' },
    labels: {
      youtubeTitle: 'عنوان الفيديو',
      youtubeDescription: 'وصف الفيديو',
      youtubeCommunityPost: 'منشور المجتمع',
      linkedinCompanyPost: 'منشور على صفحة الشركة',
      linkedinFounderPost: 'منشور المؤسس',
      pressReleaseSubject: 'موضوع البريد الإلكتروني',
      pressReleaseBody: 'نص البريد الإلكتروني',
    },
  },
}

const LIVE_PROVIDERS = ['Claude (Anthropic)', 'OpenAI']

const chipStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.16)',
  borderRadius: 999,
  padding: '5px 12px',
  fontSize: 12,
  color: 'rgba(255,255,255,.85)',
  background: 'rgba(255,255,255,.06)',
}

const formatUsd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const fieldStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(255,255,255,.08)',
  color: '#fff',
  padding: '12px 14px',
  fontFamily: 'inherit',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
}

function hasEnterpriseAccess(tenantProfile?: TenantCampaignProfile) {
  return Boolean(tenantProfile?.sponsoredEnterprise || tenantProfile?.corporateSponsored || tenantProfile?.plan === 'enterprise')
}

function AssetBlock({ label, value, copyBtn, copied }: { label: string; value: string; copyBtn: string; copied: string }) {
  const [done, setDone] = useState(false)

  async function copyText() {
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <h4 className="sb-h3" style={{ margin: 0, fontSize: 15 }}>{label}</h4>
        <button
          type="button"
          className="sb-button-secondary"
          onClick={copyText}
          style={{ padding: '6px 14px', fontSize: 12, color: done ? '#86efac' : undefined }}
        >
          {done ? copied : copyBtn}
        </button>
      </div>
      <p className="sb-body" style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{value}</p>
    </article>
  )
}

export default function PublicAgencyClient({ copy, tenantProfile }: PublicAgencyClientProps) {
  const { lang } = useI18n()
  const oc = ORGANIC_COPY[lang] || ORGANIC_COPY.en

  const [selectedBudget, setSelectedBudget] = useState('5000')
  const [mode, setMode] = useState<Mode>('download')
  const [consent, setConsent] = useState(false)
  const [summary, setSummary] = useState<CheckoutResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [apiProvider, setApiProvider] = useState<'anthropic' | 'openai'>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [saveKey, setSaveKey] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [connectedProviders, setConnectedProviders] = useState<string[]>([])

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/agency/provider-keys', { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!live || !json) return
        setSignedIn(Boolean(json.signedIn))
        const list = Array.isArray(json.connected) ? json.connected.map((c: any) => String(c.provider)) : []
        setConnectedProviders(list)
      } catch {
        // vault unavailable — pasted-key flow still works
      }
    })()
    return () => { live = false }
  }, [])

  const providerConnected = connectedProviders.includes(apiProvider)

  const [company, setCompany] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [audience, setAudience] = useState('')
  const [website, setWebsite] = useState('')
  const [organicLoading, setOrganicLoading] = useState(false)
  const [organicError, setOrganicError] = useState('')
  const [assets, setAssets] = useState<OrganicAssets | null>(null)

  const [publication, setPublication] = useState('')
  const [editorEmail, setEditorEmail] = useState('')
  const [dispatchLoading, setDispatchLoading] = useState(false)
  const [dispatchError, setDispatchError] = useState('')
  const [dispatchQueued, setDispatchQueued] = useState(false)

  const enterpriseEnabled = ENTERPRISE_READY && hasEnterpriseAccess(tenantProfile)
  const channelMode: ChannelMode = enterpriseEnabled ? 'PROGRAMMATIC_ENTERPRISE' : 'FREE_ORGANIC_MODE'
  const organicChannels = Object.values(copy.organicChannels)
  const enterpriseChannels = Object.values(copy.enterpriseChannels)

  async function generateOrganic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setOrganicError('')

    if (!providerConnected && apiKey.trim().length < 20) {
      setOrganicError(oc.byokKeyRequired)
      return
    }

    if (!company.trim() || !announcement.trim()) {
      setOrganicError(oc.requiredError)
      return
    }

    setOrganicLoading(true)
    setAssets(null)
    setDispatchQueued(false)
    setDispatchError('')

    try {
      const response = await fetch('/api/agency/organic-workflow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company, announcement, audience, website, lang, apiProvider, apiKey: providerConnected && !apiKey.trim() ? undefined : apiKey.trim() }),
      })

      const data = await response.json().catch(() => null) as OrganicResponse | null

      if (!response.ok || !data || !data.ok || !data.assets) {
        const code = (data as any)?.error_code
        if (code === 'missing_key') setOrganicError(oc.byokKeyRequired)
        else if (code === 'invalid_key') setOrganicError(oc.byokKeyInvalid)
        else setOrganicError(oc.genError)
        setOrganicLoading(false)
        return
      }

      setAssets(data.assets)

      if (saveKey && signedIn && apiKey.trim().length >= 20) {
        try {
          const saved = await fetch('/api/agency/provider-keys', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ provider: apiProvider, value: apiKey.trim() }),
          })
          if (saved.ok) {
            setConnectedProviders((current) => (current.includes(apiProvider) ? current : [...current, apiProvider]))
            setApiKey('')
          }
        } catch {
          // saving is best-effort; generation already succeeded
        }
      }
    } catch {
      setOrganicError(oc.genError)
    }

    setOrganicLoading(false)
  }

  async function queuePressDispatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDispatchError('')

    if (!assets) return
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(editorEmail.trim())
    if (!publication.trim() || !emailOk) {
      setDispatchError(oc.emailInvalid)
      return
    }

    setDispatchLoading(true)
    try {
      const response = await fetch('/api/agency/press-dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          created_by_role: 'staff',
          source: 'public_agency_page',
          channel: 'online-newspapers',
          publication_name: publication.trim(),
          editor_contact: editorEmail.trim(),
          headline: assets.pressReleaseSubject,
          article_notes: assets.pressReleaseBody,
          cta_url: website.trim() || undefined,
          force_owner_review: true,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.campaign) {
        setDispatchError(String(data?.error || oc.dispatchError))
        setDispatchLoading(false)
        return
      }

      setDispatchQueued(true)
    } catch {
      setDispatchError(oc.dispatchError)
    }

    setDispatchLoading(false)
  }

  async function requestCheckout(createStripeSession: boolean) {
    if (!enterpriseEnabled) {
      setError(copy.error)
      return
    }

    setLoading(true)
    setError('')
    setSummary(null)

    const budget = Number(selectedBudget)
    if (!Number.isFinite(budget) || budget <= 0 || (mode === 'managed' && !consent)) {
      setError(copy.error)
      setLoading(false)
      return
    }

    const response = await fetch('/api/agency/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedBudget: budget, createStripeSession, mode, enterpriseReady: enterpriseEnabled, channelMode }),
    })

    if (!response.ok) {
      setError(copy.error)
      setLoading(false)
      return
    }

    const data = await response.json() as CheckoutResponse
    setSummary(data)
    setLoading(false)

    if (createStripeSession && data.stripeCheckoutUrl) {
      window.location.href = data.stripeCheckoutUrl
    }
  }

  return (
    <section className="sb-page-shell sb-section" aria-label={copy.title} data-channel-mode={channelMode}>
      <div className="fathom-glass sb-glass" style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div>
          <div className="sb-cta-row" style={{ marginBottom: 12 }}>
            <span className="sb-eyebrow">{copy.freeModeBadge}</span>
            <span className="sb-caption" style={{ color: enterpriseEnabled ? '#86efac' : '#fbbf24' }}>{copy.enterpriseReadyBadge}</span>
          </div>
          <h2 className="sb-h2">{copy.title}</h2>
          <p className="sb-body" style={{ maxWidth: 820 }}>{copy.body}</p>
        </div>

        {/* Whose work is this? A signed-in user names their company so generated assets carry
            THEIR brand, never the platform's. Invisible to signed-out visitors. */}
        <CompanyIdentityPrompt />

        <section className="sb-card" style={{ padding: 20 }}>
          <span className="sb-eyebrow">{copy.organicModeTitle}</span>
          <p className="sb-body">{copy.organicModeBody}</p>
          <h3 className="sb-h3">{copy.organicChannelsTitle}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {organicChannels.map((channel) => (
              <article key={channel.label} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
                <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{channel.label}</h4>
                <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{channel.description}</p>
              </article>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginTop: 14 }}>
            <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
              <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{copy.hmiApprovalTitle}</h4>
              <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{copy.hmiApprovalBody}</p>
            </article>
            <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
              <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{copy.marketingAlertsTitle}</h4>
              <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{copy.marketingAlertsBody}</p>
            </article>
          </div>

          <form onSubmit={generateOrganic} style={{ display: 'grid', gap: 12, marginTop: 18, maxWidth: 720 }}>
            <h3 className="sb-h3" style={{ margin: 0 }}>{oc.formTitle}</h3>

            <div style={{ border: '1px solid rgba(251,191,36,.3)', borderRadius: 16, padding: 14, display: 'grid', gap: 10 }}>
              <h4 className="sb-h3" style={{ margin: 0, fontSize: 15 }}>{oc.byokTitle}</h4>
              <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{oc.byokBody}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="sb-caption" style={{ color: '#86efac' }}>{oc.byokLiveLabel}</span>
                {LIVE_PROVIDERS.map((name) => (
                  <span key={name} style={{ ...chipStyle, borderColor: 'rgba(134,239,172,.4)' }}>{name}</span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 200px) 1fr', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="sb-caption">{oc.byokProviderLabel}</span>
                  <select value={apiProvider} onChange={(e) => setApiProvider(e.target.value === 'openai' ? 'openai' : 'anthropic')} style={fieldStyle}>
                    <option value="anthropic">{uiText('generatedUi.u_962bc5fcdd2dbbd4')}</option>
                    <option value="openai">{uiText('generatedUi.u_8b7d1a3187ab355d')}</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="sb-caption">{oc.byokKeyLabel}{providerConnected ? <span style={{ color: '#86efac', marginLeft: 8 }}>✓ {oc.byokConnected}</span> : null}</span>
                  <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={providerConnected ? '✓ ' + oc.byokConnected : (apiProvider === 'openai' ? 'sk-…' : 'sk-ant-…')} maxLength={400} style={fieldStyle} />
                </label>
              </div>
              {signedIn && !providerConnected ? (
                <label className="sb-caption" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={saveKey} onChange={(e) => setSaveKey(e.target.checked)} />
                  <span>{oc.byokSaveKey}</span>
                </label>
              ) : null}
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span className="sb-caption">{oc.companyLabel}</span>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder={oc.companyPlaceholder} maxLength={120} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="sb-caption">{oc.announcementLabel}</span>
              <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder={oc.announcementPlaceholder} maxLength={1200} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="sb-caption">{oc.audienceLabel}</span>
                <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder={oc.audiencePlaceholder} maxLength={300} style={fieldStyle} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="sb-caption">{oc.websiteLabel}</span>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder={uiText('generatedUi.u_66dfeeedabf1f022')} maxLength={200} style={fieldStyle} />
              </label>
            </div>
            <div className="sb-cta-row">
              <button className="sb-button-primary" type="submit" disabled={organicLoading}>
                {organicLoading ? oc.generating : (assets ? oc.regenerate : oc.generate)}
              </button>
            </div>
            {organicError ? <p className="sb-body" style={{ color: '#fca5a5', margin: 0 }}>{organicError}</p> : null}
          </form>

          {assets ? (
            <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
              <h3 className="sb-h3" style={{ margin: 0, color: '#86efac' }}>{oc.resultsTitle}</h3>

              <span className="sb-eyebrow">{oc.sections.youtube}</span>
              <div style={{ display: 'grid', gap: 12 }}>
                <AssetBlock label={oc.labels.youtubeTitle} value={assets.youtubeTitle} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.youtubeDescription} value={assets.youtubeDescription} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.youtubeCommunityPost} value={assets.youtubeCommunityPost} copyBtn={oc.copyBtn} copied={oc.copied} />
              </div>

              <span className="sb-eyebrow">{oc.sections.linkedin}</span>
              <div style={{ display: 'grid', gap: 12 }}>
                <AssetBlock label={oc.labels.linkedinCompanyPost} value={assets.linkedinCompanyPost} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.linkedinFounderPost} value={assets.linkedinFounderPost} copyBtn={oc.copyBtn} copied={oc.copied} />
              </div>

              <span className="sb-eyebrow">{oc.sections.press}</span>
              <div style={{ display: 'grid', gap: 12 }}>
                <AssetBlock label={oc.labels.pressReleaseSubject} value={assets.pressReleaseSubject} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.pressReleaseBody} value={assets.pressReleaseBody} copyBtn={oc.copyBtn} copied={oc.copied} />
              </div>

              <div style={{ border: '1px solid rgba(26,240,255,.25)', borderRadius: 16, padding: 16, marginTop: 4 }}>
                <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{oc.dispatchTitle}</h4>
                <p className="sb-body" style={{ margin: '0 0 12px', fontSize: 13 }}>{oc.dispatchBody}</p>
                {dispatchQueued ? (
                  <p className="sb-body" style={{ color: '#86efac', margin: 0 }}>{oc.dispatchQueued}</p>
                ) : (
                  <form onSubmit={queuePressDispatch} style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span className="sb-caption">{oc.publicationLabel}</span>
                        <input value={publication} onChange={(e) => setPublication(e.target.value)} placeholder={oc.publicationPlaceholder} maxLength={140} style={fieldStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span className="sb-caption">{oc.editorEmailLabel}</span>
                        <input value={editorEmail} onChange={(e) => setEditorEmail(e.target.value)} placeholder={uiText('generatedUi.u_af340ed4537c667e')} maxLength={200} style={fieldStyle} />
                      </label>
                    </div>
                    <div className="sb-cta-row">
                      <button className="sb-button-primary" type="submit" disabled={dispatchLoading}>
                        {dispatchLoading ? oc.dispatching : oc.dispatchBtn}
                      </button>
                    </div>
                    {dispatchError ? <p className="sb-body" style={{ color: '#fca5a5', margin: 0 }}>{dispatchError}</p> : null}
                  </form>
                )}
              </div>
            </div>
          ) : null}
        </section>

        {enterpriseEnabled ? (
          <section className="sb-card" style={{ padding: 20 }}>
            <span className="sb-eyebrow">{copy.enterpriseModeTitle}</span>
            <p className="sb-body">{copy.enterpriseModeBody}</p>
            <h3 className="sb-h3">{copy.enterpriseChannelsTitle}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              {enterpriseChannels.map((channel) => (
                <article key={channel.label} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
                  <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{channel.label}</h4>
                  <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{channel.description}</p>
                </article>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <span className="sb-caption">{copy.modeLabel}</span>
              <div className="sb-cta-row">
                <button type="button" className={mode === 'download' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('download')}>{copy.downloadMode}</button>
                <button type="button" className={mode === 'managed' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('managed')}>{copy.publishMode}</button>
              </div>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); requestCheckout(false) }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginTop: 14 }}>
              <label style={{ display: 'grid', gap: 8, minWidth: 240 }}>
                <span className="sb-caption">{copy.budgetLabel}</span>
                <input
                  value={selectedBudget}
                  onChange={(event) => setSelectedBudget(event.target.value)}
                  type="number"
                  min="1"
                  step="0.01"
                  style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.08)', color: '#fff', padding: '12px 14px' }}
                />
              </label>
              <button className="sb-button-primary" type="submit" disabled={loading}>{copy.submit}</button>
            </form>

            {mode === 'managed' ? (
              <label className="sb-body" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '14px 0 0' }}>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>{copy.consentLabel}</span>
              </label>
            ) : null}
          </section>
        ) : (
          <section className="sb-card" style={{ padding: 20, borderColor: 'rgba(251,191,36,.28)' }}>
            <span className="sb-eyebrow">{copy.enterpriseReadyBadge}</span>
            <h3 className="sb-h3">{copy.enterpriseLockedTitle}</h3>
            <p className="sb-body" style={{ margin: 0 }}>{copy.enterpriseLockedBody}</p>
          </section>
        )}

        {error ? <p className="sb-body" style={{ color: '#fca5a5', margin: 0 }}>{error}</p> : null}
        {summary ? (
          <div className="sb-card" style={{ padding: 20 }}>
            <h3 className="sb-h3">{copy.summaryTitle}</h3>
            <p className="sb-body">{summary.status === 'STRIPE_CHECKOUT_READY' ? copy.paymentReady : copy.ready}</p>
            <p className="sb-caption">{copy.noBrokerDispatch}</p>
            {!summary.stripeConfigured ? <p className="sb-caption">{copy.stripeUnavailable}</p> : null}
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, margin: 0 }}>
              <div><dt className="sb-caption">{copy.selectedBudget}</dt><dd>{formatUsd(summary.selectedBudget)}</dd></div>
              <div><dt className="sb-caption">{copy.processingFee}</dt><dd>{formatUsd(summary.processingFee)}</dd></div>
              <div><dt className="sb-caption">{copy.totalCharged}</dt><dd>{formatUsd(summary.totalCharged)}</dd></div>
            </dl>
            {enterpriseEnabled && mode === 'managed' ? <button className="sb-button-secondary" type="button" disabled={loading || !consent} onClick={() => requestCheckout(true)} style={{ marginTop: 16 }}>{copy.paymentSubmit}</button> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
