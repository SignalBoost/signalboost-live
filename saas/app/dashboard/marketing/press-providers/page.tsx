// saas/app/dashboard/marketing/press-providers/page.tsx
'use client'

// saas/app/dashboard/marketing/press-providers/page.tsx
// Press & Media Provider Cockpit — mirrors the Social Outreach Connector Cockpit layout
// (/dashboard/outreach/social). Reads providers from the press-media registry (live vs coming)
// and drives them via /api/agency/press-media. Fully localized in the platform's five
// languages (EN/ES/PT/PL/RU) through useI18n() — provider labels and blurbs included, so the
// API's English roadmap text is never shown to a non-English operator.

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import PressProviderConnectForm from './PressProviderConnectForm.tsx'
import PressCompanyProfileForm from './PressCompanyProfileForm.tsx'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Provider = { id: string; label: string; type: string; cost: string; proof: string; needs: string[]; blurb: string; live: boolean; registered?: boolean }
type Campaign = {
  id: string; status: string; media_target_type: string; headline?: string | null; publication_name?: string | null
  editor_contact?: string | null; publication_contact?: string | null; cta_url?: string | null; published_url?: string | null
  source?: string | null; updated_at?: string | null; content_body?: string | null
}
type Cockpit = { ok: boolean; providers: Provider[]; summary: { total: number; live: number; coming: number }; campaigns: Campaign[]; profile?: any; error?: string }
type Note = { text: string; ok: boolean } | null

const panel: React.CSSProperties = { background: 'rgba(15,23,42,.86)', border: '1px solid rgba(148,163,184,.18)', borderRadius: 18, padding: 18 }
const button: React.CSSProperties = { border: 'none', background: '#ffc300', color: '#020617', borderRadius: 12, padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }
const ghost: React.CSSProperties = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '9px 12px', fontWeight: 800, cursor: 'pointer' }
const field: React.CSSProperties = { background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, width: '100%', boxSizing: 'border-box' }

function chip(text: string, color = '#94a3b8') {
  return <span style={{ display: 'inline-flex', border: `1px solid ${color}66`, background: `${color}18`, color, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 900 }}>{text}</span>
}
function statusColor(c: Campaign) {
  if (c.status === 'published') return '#22c55e'
  if (c.status === 'approved') return '#1af0ff'
  if (c.status === 'rejected') return '#fb923c'
  return '#ffc300'
}
function noteStyle(note: Note) {
  return { color: note?.ok ? '#22c55e' : '#fb923c', margin: '10px 0 0', fontSize: 12 }
}

const COPY: Record<string, any> = {
  en: {
    eyebrow: uiCopy('u_a7e469ae8f42894b'), title: uiCopy('u_b8380466d75e5e38'),
    intro: uiCopy('u_7d08ceb4a488e035'),
    refresh: uiCopy('u_f907f1fcbf95b62b'), loading: uiCopy('u_96a2fc25959ba801'), types: uiCopy('u_1fc549c47045c303'), liveNow: uiCopy('u_87f0344bb011b614'), coming: uiCopy('u_e7300e08b1f34360'), recent: uiCopy('u_fc66d41d2761f3ce'),
    live: uiCopy('u_28b87a8a1dcfec61'), comingSoon: uiCopy('u_721daf3e4b413488'), cost: uiCopy('u_89a06601e29f1121'), proof: uiCopy('u_c6d8e89308f6f1a5'), needs: uiCopy('u_f79278fd27d336e6'),
    run: uiCopy('u_a84bcdfeb1f23afc'), close: uiCopy('u_dfba46b1855f4d4f'), goal: uiCopy('u_b7c5d4a243c7019c'),
    editorEmail: uiCopy('u_9ffbc0db212218c4'), publication: uiCopy('u_c2dd554fee25db5f'), audience: uiCopy('u_a99af69c3a841cb5'),
    ctaUrl: uiCopy('u_cc5d6f809a3c489c'), language: uiCopy('u_0e676cafddaa38c8'),
    sendNow: uiCopy('u_f84606f9f5b17f40'), generate: uiCopy('u_597b4d22dbec2c7d'), working: uiCopy('u_9bdc1a95e6a05f54'),
    connectComing: uiCopy('u_fd561df1f2943519'), methods: uiCopy('u_faac7d523c13aff4'),
    methodsIntro: uiCopy('u_5c0cae89c4ecfb31'),
    api: uiCopy('u_08ded6ccf0762acb'), cheapest: uiCopy('u_356d4d86ee0778f2'), apiText: uiCopy('u_5b3f030ec0d7873c'),
    cosPr: uiCopy('u_61e520594dd43421'), cosPrText: uiCopy('u_f9623bf342960fea'),
    agent: uiCopy('u_e9447d896b5e46ab'), premium: uiCopy('u_94fa917214f5597b'), agentText: uiCopy('u_8aa99e11b100bd0a'),
    recentTitle: uiCopy('u_68a0ede5a9283bfa'), approve: uiCopy('u_96dfdca239e43955'), openLink: uiCopy('u_3dc9303a62259b48'),
    recordUrl: uiCopy('u_b5b4e66f223471cb'), record: uiCopy('u_c4f473905be2d64b'), noContact: uiCopy('u_71f15154a4e79d06'),
    opNote: uiCopy('u_ff36d06265e18903'), liveList: uiCopy('u_290f4dc064202bab'), none: uiCopy('u_3aa9aef839c69a1f'),
    opText: uiCopy('u_1a09b0910199f495'),
    submitted: uiCopy('u_44a01343b32d4d9f'),
    queued: uiCopy('u_1f001665dacc1095'), dispatched: uiCopy('u_79269e817b19c468'), recorded: uiCopy('u_2352b78da14288d9'),
    errRun: uiCopy('u_d41240c94a0f6c13'), errAction: uiCopy('u_3a4e8a6be1d516e6'), errLoad: uiCopy('u_8dd87018777530be'), noData: uiCopy('u_e592ffa110a3bd29'),
    aiMode: uiCopy('u_e596412ad2345e3d'), manualMode: uiCopy('u_13f51a052d80c82b'), yourCopy: uiCopy('u_e8d1272b9ec64aa6'), reviewDraft: uiCopy('u_a181981b0ada8f19'), saveCopy: uiCopy('u_a42c45237f779a4a'), savedCopy: uiCopy('u_a16aff7328c89c48'), gaps: uiCopy('u_991fea28bb5c5862'),
    p: {
      free_submission: { label: uiCopy('u_39e1d5b08c9f1c4a'), blurb: uiCopy('u_1ccdb24b9269c061') },
      pr_wire: { label: uiCopy('u_dd35627482678066'), blurb: uiCopy('u_493dcc98d7be4ec7') },
      media_database: { label: uiCopy('u_c0e3eea04d17d3c5'), blurb: uiCopy('u_22ce8b3ff8b66b37') },
      ad_platform: { label: uiCopy('u_ca62f5ea99c93791'), blurb: uiCopy('u_86acbd80c50e26ae') },
      direct_io: { label: uiCopy('u_f922a57ad8de9831'), blurb: uiCopy('u_9047d1ba0391b54d') },
    },
  },
  es: {
    eyebrow: 'Plug-and-play empresarial', title: 'Centro de proveedores de prensa y medios',
    intro: 'Conecta tus propios proveedores de medios y un solo motor gobernado los dirige todos: brief, comunicado escrito por IA, aprobación del propietario, control de gasto, envío y prueba según el proveedor. SignalBoost funciona con el proveedor gratuito; los compradores con recursos activan los de pago, sin cambiar el backend.',
    refresh: 'Actualizar', loading: 'Cargando…', types: 'tipos de proveedor', liveNow: 'activos', coming: 'próximamente', recent: 'campañas recientes',
    live: 'activo', comingSoon: 'próximamente', cost: 'coste', proof: 'prueba', needs: 'requiere',
    run: 'Lanzar campaña de prensa', close: 'Cerrar', goal: '¿Qué debe decir el comunicado? Ej.: anunciar nuestra herramienta de auditoría con IA a revistas de TI gratuitas.',
    editorEmail: 'Email verificado del editor (solo contactos reales)', publication: 'Nombre de la publicación', audience: 'Audiencia (opcional)',
    ctaUrl: 'URL de llamada a la acción (opcional)', language: 'Idioma (opcional, p. ej. es, pt)',
    sendNow: 'Enviar ahora (solo propietario; si no, queda pendiente de aprobación)', generate: 'Generar y enviar', working: 'Procesando…',
    connectComing: 'Conectar proveedor (próximamente)', methods: 'Método de conexión — API · COS+PR · Agente de navegador',
    methodsIntro: 'Cuando se habilite este proveedor conectarás TU PROPIA cuenta; la plataforma nunca adelanta el gasto. Las tres vías llegan al mismo resultado.',
    api: 'API', cheapest: '· más económico', apiText: 'Pega la clave API de este proveedor; el motor lo maneja directamente.',
    cosPr: 'COS + PR', cosPrText: 'Prepara las credenciales como un PR de infraestructura, revisa, fusiona y conecta.',
    agent: 'Agente de navegador', premium: '· premium', agentText: 'Configuración asistida que maneja las pantallas del proveedor y se detiene para el inicio de sesión o 2FA.',
    recentTitle: 'Campañas de prensa recientes', approve: 'Aprobar y enviar', openLink: 'Abrir enlace publicado',
    recordUrl: 'Registrar la URL publicada real', record: 'Registrar URL', noContact: 'sin contacto',
    opNote: 'Nota operativa', liveList: 'Activos ahora', none: 'ninguno',
    opText: 'Los demás tipos de proveedor están soportados y se activan al conectarlos: la tarjeta cambia automáticamente. Los proveedores de pago nunca envían sin la aprobación de presupuesto del propietario, y nunca se inventa un enlace publicado: el propietario registra el real.',
    submitted: 'Enviado al editor: la prueba queda pendiente hasta que registres el enlace publicado.',
    queued: 'En espera de aprobación del propietario', dispatched: 'Enviado a través del proveedor.', recorded: 'Enlace publicado registrado.',
    errRun: 'No se pudo lanzar la campaña.', errAction: 'La acción falló.', errLoad: 'No se pudieron cargar los proveedores.', noData: 'No se recibieron datos de proveedores.',
    aiMode: 'La IA lo escribe', manualMode: 'Lo escribo yo', yourCopy: 'Pega tu propio texto del comunicado', reviewDraft: 'Revisar borrador', saveCopy: 'Guardar texto', savedCopy: 'Texto guardado.', gaps: 'Datos sin completar: sustitúyelos antes de enviar:',
    p: {
      free_submission: { label: 'Envío gratuito al editor', blurb: 'Envía comunicados escritos por IA a editores verificados y prensa gratuita o sectorial. Sin coste; el editor decide si se publica y cuándo.' },
      pr_wire: { label: 'Distribución por cable de prensa', blurb: 'Business Wire, PR Newswire, GlobeNewswire, EIN Presswire. Distribución garantizada con informe — se factura por comunicado en tu propia cuenta.' },
      media_database: { label: 'Base de datos de medios', blurb: 'Cision, Muck Rack, Meltwater. Aporta contactos verificados de periodistas que alimentan la validación de destinatarios.' },
      ad_platform: { label: 'Plataforma publicitaria', blurb: 'Google, LinkedIn, Meta, Taboola, Outbrain. Distribución de pago con presupuesto e informe en tiempo real; el gasto corre en tu cuenta.' },
      direct_io: { label: 'Orden de inserción directa', blurb: 'Prensa impresa, revistas de TI, TV y radio a través de un editor o agencia. Flujo de orden de inserción; la prueba es un recorte o certificado, semanas después.' },
    },
  },
  pt: {
    eyebrow: 'Plug-and-play empresarial', title: 'Central de provedores de imprensa e mídia',
    intro: 'Conecte seus próprios provedores de mídia e um único motor governado conduz todos: briefing, release escrito por IA, aprovação do proprietário, trava de gasto, envio e prova conforme o provedor. O SignalBoost roda no provedor gratuito; compradores com recursos ativam os pagos, sem mudar o backend.',
    refresh: 'Atualizar', loading: 'Carregando…', types: 'tipos de provedor', liveNow: 'ativos', coming: 'em breve', recent: 'campanhas recentes',
    live: 'ativo', comingSoon: 'em breve', cost: 'custo', proof: 'prova', needs: 'requer',
    run: 'Executar campanha de imprensa', close: 'Fechar', goal: 'O que o release deve dizer? Ex.: anunciar nossa ferramenta de auditoria com IA para revistas de TI gratuitas.',
    editorEmail: 'E-mail verificado do editor (apenas contatos reais)', publication: 'Nome da publicação', audience: 'Público (opcional)',
    ctaUrl: 'URL de chamada para ação (opcional)', language: 'Idioma (opcional, ex.: es, pt)',
    sendNow: 'Enviar agora (apenas proprietário; caso contrário, fica para aprovação)', generate: 'Gerar e executar', working: 'Processando…',
    connectComing: 'Conectar provedor (em breve)', methods: 'Método de conexão — API · COS+PR · Agente de navegador',
    methodsIntro: 'Quando este provedor for habilitado você conecta a SUA PRÓPRIA conta — a plataforma nunca adianta o gasto. Os três caminhos chegam ao mesmo resultado.',
    api: 'API', cheapest: '· mais barato', apiText: 'Cole a chave de API deste provedor; o motor o conduz diretamente.',
    cosPr: 'COS + PR', cosPrText: 'Prepare as credenciais como um PR de infraestrutura, revise, faça o merge e conecte.',
    agent: 'Agente de navegador', premium: '· premium', agentText: 'Configuração assistida que conduz as telas do provedor e pausa para login / 2FA.',
    recentTitle: 'Campanhas de imprensa recentes', approve: 'Aprovar e enviar', openLink: 'Abrir link publicado',
    recordUrl: 'Registrar a URL publicada real', record: 'Registrar URL', noContact: 'sem contato',
    opNote: 'Nota operacional', liveList: 'Ativos agora', none: 'nenhum',
    opText: 'Os demais tipos de provedor são suportados e entram no ar assim que conectados — o cartão muda automaticamente. Provedores pagos nunca enviam sem aprovação de orçamento do proprietário, e nenhum link publicado é inventado: o proprietário registra o real.',
    submitted: 'Enviado ao editor — a prova fica pendente até você registrar o link publicado.',
    queued: 'Na fila para aprovação do proprietário', dispatched: 'Enviado pelo provedor.', recorded: 'Link publicado registrado.',
    errRun: 'Não foi possível executar a campanha.', errAction: 'A ação falhou.', errLoad: 'Não foi possível carregar os provedores.', noData: 'Nenhum dado de provedor retornado.',
    aiMode: 'A IA escreve', manualMode: 'Eu escrevo', yourCopy: 'Cole o seu próprio texto do comunicado', reviewDraft: 'Revisar rascunho', saveCopy: 'Salvar texto', savedCopy: 'Texto salvo.', gaps: 'Dados não preenchidos — substitua antes de enviar:',
    p: {
      free_submission: { label: 'Envio gratuito ao editor', blurb: 'Envie releases escritos por IA a editores verificados e à imprensa gratuita ou setorial. Custo zero; o editor decide se e quando publica.' },
      pr_wire: { label: 'Distribuição por wire de imprensa', blurb: 'Business Wire, PR Newswire, GlobeNewswire, EIN Presswire. Distribuição garantida com relatório — cobrado por release na sua própria conta.' },
      media_database: { label: 'Base de dados de mídia', blurb: 'Cision, Muck Rack, Meltwater. Fornece contatos verificados de jornalistas que alimentam a validação de destinatários.' },
      ad_platform: { label: 'Plataforma de anúncios', blurb: 'Google, LinkedIn, Meta, Taboola, Outbrain. Distribuição paga com orçamento e relatório em tempo real; o gasto corre na sua conta.' },
      direct_io: { label: 'Ordem de inserção direta', blurb: 'Impresso, revistas de TI, TV e rádio via editora ou agência. Fluxo de ordem de inserção; a prova é um recorte ou atestado, semanas depois.' },
    },
  },
  pl: {
    eyebrow: 'Firmowe plug-and-play', title: 'Panel dostawców prasy i mediów',
    intro: 'Podłącz własnych dostawców mediów, a jeden nadzorowany silnik obsłuży wszystkich: brief, komunikat napisany przez AI, zatwierdzenie właściciela, kontrola wydatków, wysyłka i dowód zależny od dostawcy. SignalBoost działa na darmowym dostawcy; kupujący z budżetem włączają płatnych — bez zmian w backendzie.',
    refresh: 'Odśwież', loading: 'Ładowanie…', types: 'typy dostawców', liveNow: 'aktywni', coming: 'wkrótce', recent: 'ostatnie kampanie',
    live: 'aktywny', comingSoon: 'wkrótce', cost: 'koszt', proof: 'dowód', needs: 'wymaga',
    run: 'Uruchom kampanię prasową', close: 'Zamknij', goal: 'Co ma zawierać komunikat? Np. ogłoszenie naszego narzędzia audytu AI w darmowych magazynach IT.',
    editorEmail: 'Zweryfikowany e-mail redaktora (tylko prawdziwe kontakty)', publication: 'Nazwa publikacji', audience: 'Odbiorcy (opcjonalnie)',
    ctaUrl: 'URL wezwania do działania (opcjonalnie)', language: 'Język (opcjonalnie, np. es, pt)',
    sendNow: 'Wyślij teraz (tylko właściciel — w przeciwnym razie czeka na zatwierdzenie)', generate: 'Wygeneruj i uruchom', working: 'Przetwarzanie…',
    connectComing: 'Podłącz dostawcę (wkrótce)', methods: 'Metoda połączenia — API · COS+PR · Agent przeglądarki',
    methodsIntro: 'Po włączeniu tego dostawcy podłączasz WŁASNE konto — platforma nigdy nie finansuje wydatku. Wszystkie trzy ścieżki dają ten sam efekt.',
    api: 'API', cheapest: '· najtaniej', apiText: 'Wklej klucz API dostawcy; silnik obsłuży go bezpośrednio.',
    cosPr: 'COS + PR', cosPrText: 'Przygotuj dane uwierzytelniające jako PR infrastrukturalny, sprawdź, scal i podłącz.',
    agent: 'Agent przeglądarki', premium: '· premium', agentText: 'Wspomagana konfiguracja prowadząca po ekranach dostawcy, z pauzą na logowanie / 2FA.',
    recentTitle: 'Ostatnie kampanie prasowe', approve: 'Zatwierdź i wyślij', openLink: 'Otwórz opublikowany link',
    recordUrl: 'Zapisz prawdziwy opublikowany URL', record: 'Zapisz URL', noContact: 'brak kontaktu',
    opNote: 'Uwaga operacyjna', liveList: 'Aktywni teraz', none: 'brak',
    opText: 'Pozostałe typy dostawców są obsługiwane i stają się aktywne po podłączeniu — karta przełącza się automatycznie. Płatni dostawcy nigdy nie wysyłają bez zatwierdzenia budżetu przez właściciela, a opublikowany link nigdy nie jest zmyślany: właściciel zapisuje prawdziwy.',
    submitted: 'Wysłano do redaktora — dowód pozostaje w toku, dopóki nie zapiszesz opublikowanego linku.',
    queued: 'Oczekuje na zatwierdzenie właściciela', dispatched: 'Wysłano przez dostawcę.', recorded: 'Zapisano opublikowany link.',
    errRun: 'Nie udało się uruchomić kampanii.', errAction: 'Akcja nie powiodła się.', errLoad: 'Nie udało się wczytać dostawców.', noData: 'Brak danych o dostawcach.',
    aiMode: 'Pisze AI', manualMode: 'Piszę sam', yourCopy: 'Wklej własny tekst komunikatu', reviewDraft: 'Przejrzyj projekt', saveCopy: 'Zapisz tekst', savedCopy: 'Tekst zapisany.', gaps: 'Nieuzupełnione dane — uzupełnij przed wysłaniem:',
    p: {
      free_submission: { label: 'Bezpłatne zgłoszenie do redakcji', blurb: 'Wysyłaj komunikaty napisane przez AI do zweryfikowanych redaktorów i darmowej lub branżowej prasy. Zero kosztów; redaktor decyduje, czy i kiedy opublikuje.' },
      pr_wire: { label: 'Dystrybucja przez wire prasowy', blurb: 'Business Wire, PR Newswire, GlobeNewswire, EIN Presswire. Gwarantowana dystrybucja z raportem — rozliczana za komunikat na Twoim koncie.' },
      media_database: { label: 'Baza mediów', blurb: 'Cision, Muck Rack, Meltwater. Dostarcza zweryfikowane kontakty dziennikarzy zasilające walidację odbiorców.' },
      ad_platform: { label: 'Platforma reklamowa', blurb: 'Google, LinkedIn, Meta, Taboola, Outbrain. Płatna dystrybucja z budżetem i raportem w czasie rzeczywistym; wydatek idzie z Twojego konta.' },
      direct_io: { label: 'Bezpośrednie zlecenie reklamowe', blurb: 'Druk, magazyny IT, TV, radio przez wydawcę lub agencję. Proces zlecenia reklamowego; dowodem jest wycinek lub zaświadczenie, po tygodniach.' },
    },
  },
  ru: {
    eyebrow: 'Корпоративный plug-and-play', title: 'Панель провайдеров прессы и медиа',
    intro: 'Подключите своих провайдеров медиа — единый управляемый движок работает со всеми: бриф, релиз, написанный ИИ, одобрение владельца, контроль расходов, отправка и подтверждение в формате провайдера. SignalBoost работает на бесплатном провайдере; покупатели с бюджетом включают платных — без изменений в бэкенде.',
    refresh: 'Обновить', loading: 'Загрузка…', types: 'типы провайдеров', liveNow: 'активны', coming: 'скоро', recent: 'последние кампании',
    live: 'активен', comingSoon: 'скоро', cost: 'стоимость', proof: 'подтверждение', needs: 'требуется',
    run: 'Запустить пресс-кампанию', close: 'Закрыть', goal: 'Что должен сообщать релиз? Напр.: анонс нашего ИИ-инструмента аудита в бесплатных ИТ-журналах.',
    editorEmail: 'Проверенный e-mail редактора (только реальные контакты)', publication: 'Название издания', audience: 'Аудитория (необязательно)',
    ctaUrl: 'URL призыва к действию (необязательно)', language: 'Язык (необязательно, напр. es, pt)',
    sendNow: 'Отправить сейчас (только владелец — иначе встанет в очередь на одобрение)', generate: 'Сгенерировать и запустить', working: 'Обработка…',
    connectComing: 'Подключить провайдера (скоро)', methods: 'Способ подключения — API · COS+PR · Браузерный агент',
    methodsIntro: 'Когда провайдер станет доступен, вы подключаете СВОЙ аккаунт — платформа никогда не оплачивает расходы за вас. Все три пути дают одинаковый результат.',
    api: 'API', cheapest: '· дешевле всего', apiText: 'Вставьте API-ключ этого провайдера; движок работает с ним напрямую.',
    cosPr: 'COS + PR', cosPrText: 'Подготовьте учётные данные как инфраструктурный PR, проверьте, слейте и подключите.',
    agent: 'Браузерный агент', premium: '· премиум', agentText: 'Ассистированная настройка: агент проходит экраны провайдера и делает паузу для входа / 2FA.',
    recentTitle: 'Последние пресс-кампании', approve: 'Одобрить и отправить', openLink: 'Открыть опубликованную ссылку',
    recordUrl: 'Записать реальный URL публикации', record: 'Записать URL', noContact: 'нет контакта',
    opNote: 'Операционное примечание', liveList: 'Активны сейчас', none: 'нет',
    opText: 'Остальные типы провайдеров поддерживаются и становятся активными после подключения — карточка переключается автоматически. Платные провайдеры никогда не отправляют без одобрения бюджета владельцем, и ссылка на публикацию никогда не выдумывается: владелец записывает настоящую.',
    submitted: 'Отправлено редактору — подтверждение остаётся в ожидании, пока вы не запишете ссылку на публикацию.',
    queued: 'В очереди на одобрение владельца', dispatched: 'Отправлено через провайдера.', recorded: 'Ссылка на публикацию записана.',
    errRun: 'Не удалось запустить кампанию.', errAction: 'Действие не выполнено.', errLoad: 'Не удалось загрузить провайдеров.', noData: 'Данные о провайдерах не получены.',
    aiMode: 'Пишет ИИ', manualMode: 'Напишу сам', yourCopy: 'Вставьте свой текст релиза', reviewDraft: 'Проверить черновик', saveCopy: 'Сохранить текст', savedCopy: 'Текст сохранён.', gaps: 'Незаполненные факты — замените перед отправкой:',
    p: {
      free_submission: { label: 'Бесплатная отправка редактору', blurb: 'Отправляйте написанные ИИ релизы проверенным редакторам и бесплатной или отраслевой прессе. Без затрат; редактор решает, публиковать ли и когда.' },
      pr_wire: { label: 'Распространение через пресс-вайр', blurb: 'Business Wire, PR Newswire, GlobeNewswire, EIN Presswire. Гарантированное распространение с отчётом — оплата за релиз на вашем аккаунте.' },
      media_database: { label: 'База медиаконтактов', blurb: 'Cision, Muck Rack, Meltwater. Даёт проверенные контакты журналистов, которые питают проверку получателей.' },
      ad_platform: { label: 'Рекламная платформа', blurb: 'Google, LinkedIn, Meta, Taboola, Outbrain. Платное распространение с бюджетом и отчётом в реальном времени; расходы идут с вашего аккаунта.' },
      direct_io: { label: 'Прямой заказ на размещение', blurb: 'Печать, ИТ-журналы, ТВ, радио через издателя или агентство. Процесс заказа на размещение; подтверждение — вырезка или справка, спустя недели.' },
    },
  },
}

// ── One provider card (the placement mirrored from the Social cockpit) ──
function ProviderCard({ provider, onRan, t }: { provider: Provider; onRan: () => void; t: any }) {
  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState('')
  const [editorEmail, setEditorEmail] = useState('')
  const [publicationName, setPublicationName] = useState('')
  const [audience, setAudience] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [language, setLanguage] = useState('')
  const [autoDispatch, setAutoDispatch] = useState(false)
  const [manual, setManual] = useState(false)        // manual is a CHOICE, not just a fallback
  const [ownCopy, setOwnCopy] = useState('')
  const [draft, setDraft] = useState('')
  const [gaps, setGaps] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const color = provider.live ? '#22c55e' : '#fb923c'
  const isPaid = provider.id !== 'free_submission'
  const meta = t.p[provider.id] || { label: provider.label, blurb: provider.blurb }

  async function run() {
    setBusy(true); setNote(null)
    try {
      const res = await fetch('/api/agency/press-media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          provider_id: provider.id, goal, editor_email: editorEmail, publication_name: publicationName,
          audience, cta_url: ctaUrl, language, auto_dispatch: autoDispatch,
          manual_copy: manual ? ownCopy : undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || json.reason || t.errRun)
      setDraft(json.creative || '')
      setGaps(Array.isArray(json.placeholders) ? json.placeholders : [])
      setNote({ ok: true, text: json.state === 'submitted' ? t.submitted : `${t.queued} (${json.status}).` })
      setGoal(''); onRan()
    } catch (err: any) { setNote({ ok: false, text: err?.message || t.errRun }) }
    finally { setBusy(false) }
  }

  return <article style={{ ...panel, borderColor: `${color}55` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
      <div>
        <h3 style={{ color: '#fff', margin: 0 }}>{meta.label}</h3>
        <p style={{ color: 'rgba(255,255,255,.58)', margin: '6px 0 0', fontSize: 12 }}>{provider.type} · {provider.cost} · {t.proof}: {provider.proof}</p>
      </div>
      {chip(provider.live ? t.live : t.comingSoon, color)}
    </div>

    <p style={{ color: 'rgba(255,255,255,.66)', fontSize: 13, lineHeight: 1.6, margin: '12px 0 0' }}>{meta.blurb}</p>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {chip(`${t.cost}: ${provider.cost}`, provider.cost === 'free' ? '#22c55e' : uiCopy('u_110183cb2099f93c'))}
      {chip(`${t.proof}: ${provider.proof}`, uiCopy('u_be92f4efdb1866ca'))}
      {provider.needs.map((n) => chip(`${t.needs}: ${n}`, '#94a3b8'))}
    </div>

    {provider.live ? <div style={{ marginTop: 14 }}>
      <button style={button} onClick={() => setOpen((v) => !v)}>{open ? t.close : t.run}</button>
      {open ? <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...(manual ? ghost : button), flex: 1, fontSize: 12 }} onClick={() => setManual(false)}>{t.aiMode}</button>
          <button style={{ ...(manual ? button : ghost), flex: 1, fontSize: 12 }} onClick={() => setManual(true)}>{t.manualMode}</button>
        </div>
        {manual
          ? <textarea value={ownCopy} onChange={(e) => setOwnCopy(e.target.value)} placeholder={t.yourCopy} rows={6} style={{ ...field, resize: 'vertical' }} />
          : <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t.goal} rows={3} style={{ ...field, resize: 'vertical' }} />}
        <input value={editorEmail} onChange={(e) => setEditorEmail(e.target.value)} placeholder={t.editorEmail} style={field} />
        <input value={publicationName} onChange={(e) => setPublicationName(e.target.value)} placeholder={t.publication} style={field} />
        <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder={t.audience} style={field} />
        <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder={t.ctaUrl} style={field} />
        <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder={t.language} style={field} />
        <label style={{ color: 'rgba(255,255,255,.65)', fontSize: 12, fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={autoDispatch} onChange={(e) => setAutoDispatch(e.target.checked)} />
          {t.sendNow}
        </label>
        <button style={button} disabled={busy || (manual ? !ownCopy.trim() : !goal.trim())} onClick={run}>{busy ? t.working : t.generate}</button>
        {draft ? <div style={{ display: 'grid', gap: 6 }}>
          {gaps.length ? <p style={{ color: '#fb923c', fontSize: 12, fontWeight: 850, margin: 0 }}>{t.gaps} {gaps.join(' ')}</p> : null}
          <textarea readOnly value={draft} rows={8} style={{ ...field, resize: 'vertical', fontSize: 12 }} />
        </div> : null}
      </div> : null}
      {isPaid ? <PressProviderConnectForm providerId={provider.id} connected onChanged={onRan} /> : null}
    </div> : provider.registered ? <div style={{ marginTop: 14 }}>
      <PressProviderConnectForm providerId={provider.id} onChanged={onRan} />
    </div> : <div style={{ marginTop: 14 }}>
      <button style={ghost} disabled>{t.connectComing}</button>
      <details style={{ marginTop: 12 }}>
        <summary style={{ color: '#1af0ff', cursor: 'pointer', fontSize: 12, fontWeight: 850 }}>{t.methods}</summary>
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, margin: 0 }}>{t.methodsIntro}</p>
          <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}><p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>{t.api} <span style={{ color: '#22c55e', fontWeight: 700 }}>{t.cheapest}</span></p><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: 0 }}>{t.apiText}</p></div>
          <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}><p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>{t.cosPr}</p><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: 0 }}>{t.cosPrText}</p></div>
          <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}><p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>{t.agent} <span style={{ color: '#ffc300', fontWeight: 700 }}>{t.premium}</span></p><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: 0 }}>{t.agentText}</p></div>
        </div>
      </details>
    </div>}

    {note ? <p style={noteStyle(note)}>{note.text}</p> : null}
  </article>
}

// ── One campaign row with owner actions (mirrors social's destination actions) ──
function CampaignRow({ campaign, onChanged, t }: { campaign: Campaign; onChanged: () => void; t: any }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const [reviewing, setReviewing] = useState(false)
  const [copy, setCopy] = useState(campaign.content_body || '')
  const color = statusColor(campaign)
  const gaps = (campaign.content_body || '').match(/\[[A-Z][A-Z0-9 _/-]{2,40}\]/g) || []

  async function saveCopy() {
    setBusy(true); setNote(null)
    try {
      const res = await fetch('/api/agency/press-media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'update_copy', campaign_id: campaign.id, copy }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || t.errAction)
      setNote({ ok: true, text: t.savedCopy }); onChanged()
    } catch (err: any) { setNote({ ok: false, text: err?.message || t.errAction }) }
    finally { setBusy(false) }
  }

  async function act(action: 'dispatch' | 'record_url') {
    setBusy(true); setNote(null)
    try {
      const res = await fetch('/api/agency/press-media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action, campaign_id: campaign.id, url }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || json.reason || t.errAction)
      setNote({ ok: true, text: action === 'dispatch' ? t.dispatched : t.recorded })
      onChanged()
    } catch (err: any) { setNote({ ok: false, text: err?.message || t.errAction }) }
    finally { setBusy(false) }
  }

  return <div style={{ ...panel, borderColor: `${color}44` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
      <div>
        <h4 style={{ color: '#fff', margin: 0, fontSize: 14 }}>{campaign.headline || campaign.publication_name || campaign.media_target_type}</h4>
        <p style={{ color: 'rgba(255,255,255,.55)', margin: '4px 0 0', fontSize: 11 }}>{campaign.media_target_type} · {campaign.editor_contact || campaign.publication_contact || t.noContact}{campaign.source ? ` · ${campaign.source}` : ''}</p>
      </div>
      {chip(campaign.status.replace(/_/g, ' '), color)}
    </div>

    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      {campaign.status === 'pending_owner_review' ? <>
        <button style={ghost} onClick={() => setReviewing((v) => !v)}>{reviewing ? t.close : t.reviewDraft}</button>
        <button style={button} disabled={busy} onClick={() => act('dispatch')}>{busy ? t.working : t.approve}</button>
      </> : null}
      {campaign.published_url ? <a href={campaign.published_url} target="_blank" rel="noreferrer" style={{ ...ghost, textDecoration: 'none' }}>{t.openLink}</a> : <>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t.recordUrl} style={{ ...field, width: 260 }} />
        <button style={ghost} disabled={busy || !/^https?:\/\//i.test(url)} onClick={() => act('record_url')}>{busy ? t.working : t.record}</button>
      </>}
    </div>
    {reviewing ? <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
      {gaps.length ? <p style={{ color: '#fb923c', fontSize: 12, fontWeight: 850, margin: 0 }}>{t.gaps} {Array.from(new Set(gaps)).join(' ')}</p> : null}
      <textarea value={copy} onChange={(e) => setCopy(e.target.value)} rows={10} style={{ ...field, resize: 'vertical', fontSize: 12 }} />
      <button style={button} disabled={busy || !copy.trim()} onClick={saveCopy}>{busy ? t.working : t.saveCopy}</button>
    </div> : null}
    {note ? <p style={noteStyle(note)}>{note.text}</p> : null}
  </div>
}

export default function PressMediaProviderCockpit() {
  const { lang } = useI18n()
  const t = COPY[lang] || COPY.en
  const [data, setData] = useState<Cockpit | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<Note>(null)

  async function load() {
    setLoading(true); setNote(null)
    try {
      const res = await fetch('/api/agency/press-media', { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => ({ ok: false, error: t.errLoad }))
      if (!res.ok || !json.ok) throw new Error(json.error || t.errLoad)
      setData(json)
    } catch (err: any) { setNote({ ok: false, text: err?.message || t.errLoad }) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  const providers = data?.providers || []
  const campaigns = data?.campaigns || []
  const liveNames = useMemo(
    () => providers.filter((p) => p.live).map((p) => (t.p[p.id]?.label || p.label)),
    [providers, t],
  )

  return <main style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 22px', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'radial-gradient(circle at top left, rgba(26,240,255,.14), transparent 28rem), linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <p style={{ margin: 0, color: '#ffc300', fontSize: 12, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}>{t.eyebrow}</p>
          <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-.04em' }}>{t.title}</h1>
          <p style={{ color: 'rgba(255,255,255,.66)', maxWidth: 880, lineHeight: 1.6 }}>{t.intro}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}><button style={button} onClick={load}>{loading ? t.loading : t.refresh}</button></div>
      </div>
      {note ? <p style={{ color: note.ok ? '#22c55e' : '#fb923c', fontWeight: 850 }}>{note.text}</p> : null}
    </section>

    <PressCompanyProfileForm profile={data?.profile} onSaved={load} />

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <div style={panel}>{chip(t.types, uiCopy('u_88fd74efe53f9449'))}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.total ?? '-'}</h2></div>
      <div style={panel}>{chip(t.liveNow, '#22c55e')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.live ?? '-'}</h2></div>
      <div style={panel}>{chip(t.coming, uiCopy('u_9719213280fd72ed'))}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.coming ?? '-'}</h2></div>
      <div style={panel}>{chip(t.recent, '#94a3b8')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{campaigns.length}</h2></div>
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
      {providers.map((p) => <ProviderCard key={p.id} provider={p} onRan={load} t={t} />)}
      {!loading && !providers.length ? <div style={panel}><p style={{ color: '#fff' }}>{note?.text || t.noData}</p></div> : null}
    </section>

    {campaigns.length ? <section style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ color: '#fff', margin: 0 }}>{t.recentTitle}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12 }}>{campaigns.map((c) => <CampaignRow key={c.id} campaign={c} onChanged={load} t={t} />)}</div>
    </section> : null}

    <section style={panel}><h2 style={{ color: '#fff', margin: 0 }}>{t.opNote}</h2><p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.6 }}>{t.liveList}: {liveNames.join(', ') || t.none}. {t.opText}</p></section>
  </main>
}
