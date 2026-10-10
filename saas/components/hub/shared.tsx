'use client'
import { uiText } from '@/lib/i18n/uiText'

// saas/components/hub/shared.tsx
// Hub Console — shared design system, types, and translations.
// Every console page imports from here. One source of truth.

export type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
export const LANGS: Lang[] = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']

export type Tier = { name: string; priceId: string; amount: number; interval: string; mismatch: boolean }
export type Webhook = { url: string; status: string; events: number }
export type ScopeInfo = { scope: string; count: number; names: string[] }
export type HubData = {
  generatedAt: string
  stripe: { ok: boolean; tiers: Tier[]; webhooks: Webhook[]; mismatches: string[]; error?: string }
  supabase: { ok: boolean; latencyMs: number; projectHost: string; anonKeyMasked: string; error?: string }
  vercel: { ok: boolean; configured: boolean; scopes: ScopeInfo[]; error?: string }
  alerts: { stripeMismatches: string[]; envSync: string[] }
}

export type PageProps = { lang: Lang; data: HubData | null; loading: boolean; failed: boolean }

export const COPY: Record<string, Record<Lang, string>> = {
  title:        { en: uiText('generatedUi.u_8bf1f1617e61e29f'), es: 'Consola Hub de SignalBoost', pt: 'Console Hub da SignalBoost', pl: 'Konsola Hub SignalBoost', ru: 'Консоль Hub SignalBoost', de: 'SignalBoost Hub-Konsole', fr: 'Console Hub SignalBoost', it: 'Console Hub SignalBoost', ja: 'SignalBoost Hub コンソール', ko: 'SignalBoost Hub 콘솔', ar: 'وحدة تحكم Hub من SignalBoost' },
  phaseBadge:   { en: uiText('generatedUi.u_74ff0751d70068d3'), es: 'En vivo, solo lectura', pt: 'Ao vivo, somente leitura', pl: 'Na żywo, tylko odczyt', ru: 'Живые данные, только чтение', de: 'Live, schreibgeschützt', fr: 'En direct, lecture seule', it: 'Live, sola lettura', ja: 'ライブ、読み取り専用', ko: '실시간, 읽기 전용', ar: 'مباشر، للقراءة فقط' },
  systemHealth: { en: uiText('generatedUi.u_982649422d26c0a5'), es: 'Estado del sistema', pt: 'Saúde do sistema', pl: 'Stan systemu', ru: 'Состояние системы', de: 'Systemzustand', fr: 'Santé du système', it: 'Stato del sistema', ja: 'システムの状態', ko: '시스템 상태', ar: 'سلامة النظام' },
  refresh:      { en: uiText('generatedUi.u_0e91610117029a62'), es: 'Actualizar', pt: 'Atualizar', pl: 'Odśwież', ru: 'Обновить', de: 'Aktualisieren', fr: 'Actualiser', it: 'Aggiorna', ja: '更新', ko: '새로 고침', ar: 'تحديث' },
  loading:      { en: uiText('generatedUi.u_12050e4e7259534e'), es: 'Cargando datos en vivo…', pt: 'Carregando dados ao vivo…', pl: 'Ładowanie danych na żywo…', ru: 'Загрузка живых данных…', de: 'Live-Daten werden geladen…', fr: 'Chargement des données en direct…', it: 'Caricamento dati in tempo reale…', ja: 'リアルタイムデータを読み込み中…', ko: '실시간 데이터 불러오는 중…', ar: 'جارٍ تحميل البيانات المباشرة…' },
  loadError:    { en: uiText('generatedUi.u_d952aac6b414355b'), es: 'No se pudieron cargar los datos. Intenta actualizar.', pt: 'Não foi possível carregar os dados. Tente atualizar.', pl: 'Nie udało się załadować danych. Spróbuj odświeżyć.', ru: 'Не удалось загрузить данные. Попробуйте обновить.', de: 'Live-Daten konnten nicht geladen werden. Versuchen Sie, die Seite zu aktualisieren.', fr: 'Impossible de charger les données en direct. Essayez d’actualiser.', it: 'Impossibile caricare i dati in tempo reale. Prova ad aggiornare.', ja: 'ライブデータを読み込めませんでした。更新してみてください。', ko: '실시간 데이터를 불러올 수 없습니다. 새로 고침해 보세요.', ar: 'تعذّر تحميل البيانات المباشرة. حاول التحديث.' },
  pageDashboard:{ en: uiText('generatedUi.u_67b696468610b879'), es: 'Panel', pt: 'Painel', pl: 'Panel', ru: 'Панель', de: 'Dashboard', fr: 'Tableau de bord', it: 'Dashboard', ja: 'ダッシュボード', ko: '대시보드', ar: 'لوحة المعلومات' },
  pageVault:    { en: uiText('generatedUi.u_e7ccb35263c6b8a0'), es: 'Bóveda de Claves', pt: 'Cofre de Chaves', pl: 'Sejf Kluczy', ru: 'Хранилище ключей', de: 'Schlüsseltresor', fr: 'Coffre de clés', it: 'Cassaforte chiavi', ja: 'キー保管庫', ko: '키 보관소', ar: 'خزنة المفاتيح' },
  yourData:     { en: uiText('generatedUi.u_0fdcada440a9ff8c'), es: 'Tus Datos', pt: 'Seus Dados', pl: 'Twoje Dane', ru: 'Ваши данные', de: 'Ihre Daten', fr: 'Vos données', it: 'I tuoi dati', ja: 'あなたのデータ', ko: '내 데이터', ar: 'بياناتك' },
  yourPayments: { en: uiText('generatedUi.u_14d6a3a8516b6ffa'), es: 'Tus Pagos', pt: 'Seus Pagamentos', pl: 'Twoje Płatności', ru: 'Ваши платежи', de: 'Ihre Zahlungen', fr: 'Vos paiements', it: 'I tuoi pagamenti', ja: 'お支払い', ko: '내 결제', ar: 'مدفوعاتك' },
  yourWebsite:  { en: uiText('generatedUi.u_5187a9b8f4ba30f7'), es: 'Tu Sitio Web', pt: 'Seu Site', pl: 'Twoja Strona', ru: 'Ваш сайт', de: 'Ihre Website', fr: 'Votre site web', it: 'Il tuo sito web', ja: 'あなたのウェブサイト', ko: '내 웹사이트', ar: 'موقعك الإلكتروني' },
  yourTeam:     { en: uiText('generatedUi.u_6466ccfda8bd01ec'), es: 'Tu Equipo', pt: 'Sua Equipe', pl: 'Twój Zespół', ru: 'Ваша команда', de: 'Ihr Team', fr: 'Votre équipe', it: 'Il tuo team', ja: 'あなたのチーム', ko: '내 팀', ar: 'فريقك' },
  manageData:   { en: uiText('generatedUi.u_19a2ded00fdbeeac'), es: 'Gestiona tus datos y cuentas.', pt: 'Gerencie seus dados e contas.', pl: 'Zarządzaj danymi i kontami.', ru: 'Управляйте данными и аккаунтами.', de: 'Verwalten Sie Ihre Daten und Konten.', fr: 'Gérez vos données et vos comptes.', it: 'Gestisci i tuoi dati e account.', ja: 'データとアカウントを管理します。', ko: '데이터와 계정을 관리하세요.', ar: 'أدِر بياناتك وحساباتك.' },
  managePay:    { en: uiText('generatedUi.u_9ae77bb00bb8aef8'), es: 'Gestiona tus pagos y planes.', pt: 'Gerencie seus pagamentos e planos.', pl: 'Zarządzaj płatnościami i planami.', ru: 'Управляйте платежами и тарифами.', de: 'Verwalten Sie Ihre Zahlungen und Tarife.', fr: 'Gérez vos paiements et vos formules.', it: 'Gestisci pagamenti e piani.', ja: '支払いとプランを管理します。', ko: '결제 및 요금제를 관리하세요.', ar: 'إدارة مدفوعاتك وخططك.' },
  manageHost:   { en: uiText('generatedUi.u_a5d667c8dcfb2ad0'), es: 'Gestiona tu alojamiento y versiones.', pt: 'Gerencie sua hospedagem e versões.', pl: 'Zarządzaj hostingiem i wersjami.', ru: 'Управляйте хостингом и версиями.', de: 'Verwalten Sie Ihr Hosting und Ihre Versionen.', fr: 'Gérez votre hébergement et vos versions.', it: 'Gestisci hosting e versioni.', ja: 'ホスティングとバージョンを管理します。', ko: '호스팅과 버전을 관리하세요.', ar: 'أدِر الاستضافة والإصدارات الخاصة بك.' },
  manageTeam:   { en: uiText('generatedUi.u_08781bcbe467e17c'), es: 'Gestiona roles e historial de actividad.', pt: 'Gerencie funções e histórico de atividade.', pl: 'Zarządzaj rolami i historią aktywności.', ru: 'Управляйте ролями и историей действий.', de: 'Rollen & Aktivitätsverlauf verwalten.', fr: 'Gérez les rôles et l\'historique d\'activité.', it: 'Gestisci ruoli e cronologia attività.', ja: 'ロールとアクティビティ履歴を管理します。', ko: '역할 및 활동 기록을 관리하세요.', ar: 'إدارة الأدوار وسجل النشاط.' },
  statusDb:     { en: uiText('generatedUi.u_53da2546c59b3162'), es: 'Base de datos en línea', pt: 'Banco de dados online', pl: 'Baza danych działa', ru: 'База данных в сети', de: 'Datenbank ist online', fr: 'La base de données est en ligne', it: 'Il database è online', ja: 'データベースはオンラインです', ko: '데이터베이스 온라인', ar: 'قاعدة البيانات متصلة' },
  statusDbDown: { en: uiText('generatedUi.u_27daf5a802813184'), es: 'Problema con la base de datos', pt: 'Problema no banco de dados', pl: 'Problem z bazą danych', ru: 'Проблема с базой данных', de: 'Datenbankproblem', fr: 'Problème de base de données', it: 'Problema del database', ja: 'データベースの問題', ko: '데이터베이스 문제', ar: 'مشكلة في قاعدة البيانات' },
  statusPay:    { en: uiText('generatedUi.u_16e6b3a0259910dc'), es: 'Pagos conectados', pt: 'Pagamentos conectados', pl: 'Płatności połączone', ru: 'Платежи подключены', de: 'Zahlungen verbunden', fr: 'Paiements connectés', it: 'Pagamenti collegati', ja: '決済接続済み', ko: '결제 연결됨', ar: 'المدفوعات متصلة' },
  statusPayDown:{ en: uiText('generatedUi.u_46d4ed7d0f0fcd0b'), es: 'Problema con pagos', pt: 'Problema nos pagamentos', pl: 'Problem z płatnościami', ru: 'Проблема с платежами', de: 'Zahlungsproblem', fr: 'Problème de paiement', it: 'Problema con i pagamenti', ja: '支払いの問題', ko: '결제 문제', ar: 'مشكلة في المدفوعات' },
  statusHost:   { en: uiText('generatedUi.u_bec70e416c3a5b78'), es: 'Alojamiento conectado', pt: 'Hospedagem conectada', pl: 'Hosting połączony', ru: 'Хостинг подключён', de: 'Hosting verbunden', fr: 'Hébergement connecté', it: 'Hosting connesso', ja: 'ホスティング接続済み', ko: '호스팅 연결됨', ar: 'الاستضافة متصلة' },
  statusNoToken:{ en: uiText('generatedUi.u_89856935661256a8'), es: 'Aún no conectado', pt: 'Ainda não conectado', pl: 'Jeszcze nie połączono', ru: 'Ещё не подключено', de: 'Noch nicht verbunden', fr: 'Pas encore connecté', it: 'Non ancora connesso', ja: '未接続', ko: '아직 연결되지 않음', ar: 'غير متصل بعد' },
  tokenHint:    { en: uiText('generatedUi.u_90eca37b698de180'), es: 'Agrega la variable de entorno VERCEL_TOKEN para activar esta tarjeta.', pt: 'Adicione a variável de ambiente VERCEL_TOKEN para ativar este cartão.', pl: 'Dodaj zmienną środowiskową VERCEL_TOKEN, aby aktywować tę kartę.', ru: 'Добавьте переменную окружения VERCEL_TOKEN, чтобы активировать эту карту.', de: 'Fügen Sie eine Umgebungsvariable VERCEL_TOKEN hinzu, um diese Karte zu aktivieren.', fr: 'Ajoutez une variable d\'environnement VERCEL_TOKEN pour activer cette carte.', it: 'Aggiungi una variabile d\'ambiente VERCEL_TOKEN per attivare questa scheda.', ja: 'このカードを有効にするには、環境変数 VERCEL_TOKEN を追加してください。', ko: '이 카드를 활성화하려면 VERCEL_TOKEN 환경 변수를 추가하세요.', ar: 'أضف متغير البيئة VERCEL_TOKEN لتفعيل هذه البطاقة.' },
  statusRoles:  { en: uiText('generatedUi.u_f07357c606117bda'), es: 'Roles asignados', pt: 'Funções atribuídas', pl: 'Role przypisane', ru: 'Роли назначены', de: 'Zugewiesene Rollen', fr: 'Rôles attribués', it: 'Ruoli assegnati', ja: '割り当て済みロール', ko: '할당된 역할', ar: 'الأدوار المعيّنة' },
  openSupabase: { en: uiText('generatedUi.u_1350a9f933cc85e3'), es: 'Abrir Configuración de Supabase', pt: 'Abrir Configurações do Supabase', pl: 'Otwórz Ustawienia Supabase', ru: 'Открыть настройки Supabase', de: 'Supabase-Einstellungen öffnen', fr: 'Ouvrir les paramètres Supabase', it: 'Apri impostazioni Supabase', ja: 'Supabase 設定を開く', ko: 'Supabase 설정 열기', ar: 'فتح إعدادات Supabase' },
  openStripe:   { en: uiText('generatedUi.u_15fee333f0fbdd9f'), es: 'Abrir Planes de Stripe', pt: 'Abrir Planos da Stripe', pl: 'Otwórz Plany Stripe', ru: 'Открыть тарифы Stripe', de: 'Stripe-Pläne öffnen', fr: 'Ouvrir les forfaits Stripe', it: 'Apri piani Stripe', ja: 'Stripe プランを開く', ko: 'Stripe 요금제 열기', ar: 'فتح خطط Stripe' },
  openVercel:   { en: uiText('generatedUi.u_d73ce01d9e011555'), es: 'Abrir Configuración de Vercel', pt: 'Abrir Configurações da Vercel', pl: 'Otwórz Ustawienia Vercel', ru: 'Открыть настройки Vercel', de: 'Vercel-Einstellungen öffnen', fr: 'Ouvrir les paramètres Vercel', it: 'Apri impostazioni Vercel', ja: 'Vercel の設定を開く', ko: 'Vercel 설정 열기', ar: 'فتح إعدادات Vercel' },
  openTeam:     { en: uiText('generatedUi.u_f7bb4738f12e114d'), es: 'Abrir Actividad del Equipo', pt: 'Abrir Atividade da Equipe', pl: 'Otwórz Aktywność Zespołu', ru: 'Открыть активность команды', de: 'Teamaktivität öffnen', fr: 'Ouvrir l\'activité de l\'équipe', it: 'Apri attività del team', ja: 'チームアクティビティを開く', ko: '팀 활동 열기', ar: 'فتح نشاط الفريق' },
  showDetails:  { en: uiText('generatedUi.u_1af77ee273cbdaae'), es: 'Mostrar detalles', pt: 'Mostrar detalhes', pl: 'Pokaż szczegóły', ru: 'Показать детали', de: 'Details anzeigen', fr: 'Afficher les détails', it: 'Mostra dettagli', ja: '詳細を表示', ko: '세부 정보 표시', ar: 'عرض التفاصيل' },
  hideDetails:  { en: uiText('generatedUi.u_c9722a7a962a8435'), es: 'Ocultar detalles', pt: 'Ocultar detalhes', pl: 'Ukryj szczegóły', ru: 'Скрыть детали', de: 'Details ausblenden', fr: 'Masquer les détails', it: 'Nascondi dettagli', ja: '詳細を非表示', ko: '세부 정보 숨기기', ar: 'إخفاء التفاصيل' },
  projectUrl:   { en: uiText('generatedUi.u_9859597853197476'), es: 'Proyecto', pt: 'Projeto', pl: 'Projekt', ru: 'Проект', de: 'Projekt', fr: 'Projet', it: 'Progetto', ja: 'プロジェクト', ko: '프로젝트', ar: 'المشروع' },
  anonKey:      { en: uiText('generatedUi.u_a4ae51acb312efdb'), es: 'Clave anónima pública', pt: 'Chave anônima pública', pl: 'Publiczny klucz anon', ru: 'Публичный anon-ключ', de: 'Öffentlicher Anon-Schlüssel', fr: 'Clé anonyme publique', it: 'Chiave anonima pubblica', ja: '公開匿名キー', ko: '공개 익명 키', ar: 'المفتاح العام المجهول' },
  latency:      { en: uiText('generatedUi.u_b8e3c6d2e8a44efc'), es: 'Tiempo de respuesta', pt: 'Tempo de resposta', pl: 'Czas odpowiedzi', ru: 'Время ответа', de: 'Antwortzeit', fr: 'Temps de réponse', it: 'Tempo di risposta', ja: '応答時間', ko: '응답 시간', ar: 'زمن الاستجابة' },
  webhooks:     { en: uiText('generatedUi.u_7fd140d62b23ab19'), es: 'Suscripciones de webhooks', pt: 'Assinaturas de webhooks', pl: 'Subskrypcje webhooków', ru: 'Подписки вебхуков', de: 'Webhook-Abonnements', fr: 'Abonnements webhook', it: 'Sottoscrizioni webhook', ja: 'Webhook サブスクリプション', ko: '웹훅 구독', ar: 'اشتراكات Webhook' },
  events:       { en: uiText('generatedUi.u_862417b9e7c3720b'), es: 'eventos', pt: 'eventos', pl: 'zdarzeń', ru: 'событий', de: 'Ereignisse', fr: 'événements', it: 'eventi', ja: '件のイベント', ko: '이벤트', ar: 'أحداث' },
  priceIds:     { en: uiText('generatedUi.u_1c7589c7025e78bf'), es: 'IDs de precios', pt: 'IDs de preços', pl: 'ID cen', ru: 'ID цен', de: 'Preis-IDs', fr: 'ID de prix', it: 'ID prezzo', ja: '価格 ID', ko: '가격 ID', ar: 'معرّفات الأسعار' },
  envVars:      { en: uiText('generatedUi.u_1f5213ebb801884e'), es: 'Nombres de variables (valores ocultos)', pt: 'Nomes de variáveis (valores ocultos)', pl: 'Nazwy zmiennych (wartości ukryte)', ru: 'Имена переменных (значения скрыты)', de: 'Variablennamen (Werte ausgeblendet)', fr: 'Noms des variables (valeurs masquées)', it: 'Nomi delle variabili (valori nascosti)', ja: '変数名（値は非表示）', ko: '변수 이름(값 숨김)', ar: 'أسماء المتغيرات (القيم مخفية)' },
  timeline:     { en: uiText('generatedUi.u_88b5515685aed581'), es: 'Línea de actividad (ejemplo)', pt: 'Linha de atividade (exemplo)', pl: 'Oś aktywności (przykład)', ru: 'Лента активности (пример)', de: 'Aktivitätszeitachse (Beispiel)', fr: 'Chronologie des activités (exemple)', it: 'Cronologia attività (esempio)', ja: 'アクティビティタイムライン（サンプル）', ko: '활동 타임라인(샘플)', ar: 'الجدول الزمني للنشاط (نموذج)' },
  allClear:     { en: uiText('generatedUi.u_b6fecb8348bbfd58'), es: 'Todos los sistemas sincronizados — sin problemas.', pt: 'Todos os sistemas sincronizados — nenhum problema.', pl: 'Wszystkie systemy zsynchronizowane — brak problemów.', ru: 'Все системы синхронизированы — проблем нет.', de: 'Alle Systeme synchron – keine Probleme gefunden.', fr: 'Tous les systèmes sont synchronisés — aucun problème détecté.', it: 'Tutti i sistemi sincronizzati — nessun problema rilevato.', ja: 'すべてのシステムが同期済み — 問題は見つかりませんでした。', ko: '모든 시스템 동기화됨 — 문제가 없습니다.', ar: 'جميع الأنظمة متزامنة — لم يُعثر على أي مشكلات.' },
  fixStripe:    { en: uiText('generatedUi.u_684467a012142909'), es: 'Corregir en Stripe', pt: 'Corrigir na Stripe', pl: 'Napraw w Stripe', ru: 'Исправить в Stripe', de: 'In Stripe beheben', fr: 'Corriger dans Stripe', it: 'Correggi in Stripe', ja: 'Stripe で修正', ko: 'Stripe에서 수정', ar: 'الإصلاح في Stripe' },
  fixVercel:    { en: uiText('generatedUi.u_c263c23cfca9a8cd'), es: 'Corregir en Vercel', pt: 'Corrigir na Vercel', pl: 'Napraw w Vercel', ru: 'Исправить в Vercel', de: 'In Vercel beheben', fr: 'Corriger dans Vercel', it: 'Correggi in Vercel', ja: 'Vercelで修正', ko: 'Vercel에서 수정', ar: 'إصلاح في Vercel' },
  roleBilling:  { en: uiText('generatedUi.u_711274c290fec1a4'), es: 'Admin de Facturación', pt: 'Admin de Cobrança', pl: 'Admin Rozliczeń', ru: 'Админ биллинга', de: 'Abrechnungsadministrator', fr: 'Administrateur de facturation', it: 'Amministratore fatturazione', ja: '請求管理者', ko: '결제 관리자', ar: 'مسؤول الفوترة' },
  roleDev:      { en: uiText('generatedUi.u_3fb7b39416f1d067'), es: 'Desarrollador', pt: 'Desenvolvedor', pl: 'Programista', ru: 'Разработчик', de: 'Entwickler', fr: 'Développeur', it: 'Sviluppatore', ja: '開発者', ko: '개발자', ar: 'المطوّر' },
  roleTeam:     { en: uiText('generatedUi.u_d4e55dfafd6e4c93'), es: 'Miembro del Equipo', pt: 'Membro da Equipe', pl: 'Członek Zespołu', ru: 'Участник команды', de: 'Teammitglied', fr: 'Membre de l’équipe', it: 'Membro del team', ja: 'チームメンバー', ko: '팀원', ar: 'عضو الفريق' },
  futureTitle:  { en: uiText('generatedUi.u_1844b4a3f8fff8d7'), es: 'Espacios de proveedor listos', pt: 'Slots de provedores prontos', pl: 'Gotowe miejsca na dostawców', ru: 'Слоты для провайдеров готовы', de: 'Anbieter-Slots bereit', fr: 'Emplacements fournisseurs prêts', it: 'Slot provider pronti', ja: 'プロバイダースロット準備完了', ko: '공급자 슬롯 준비됨', ar: 'خانات المزوّدين جاهزة' },
  futureNote:   { en: uiText('generatedUi.u_e9e63ea5f8e300c4'), es: 'Cada nuevo proveedor es una tarjeta. Planificado para la fase de expansión de IA.', pt: 'Cada novo provedor é um cartão. Planejado para a fase de expansão de IA.', pl: 'Każdy nowy dostawca to jedna karta. Zaplanowane na fazę ekspansji AI.', ru: 'Каждый новый провайдер — одна карта. Запланировано на фазу расширения ИИ.', de: 'Jeder neue Anbieter ist eine Karte. Geplant für die KI-Erweiterungsphase.', fr: 'Chaque nouveau fournisseur correspond à une carte. Prévu pour la phase d’extension de l’IA.', it: 'Ogni nuovo provider è una scheda. Previsto per la fase di espansione dell’AI.', ja: '新しいプロバイダーごとに1枚のカードになります。AI拡張フェーズで予定されています。', ko: '새 공급자마다 카드 하나입니다. AI 확장 단계에서 계획되어 있습니다.', ar: 'كل مزوّد جديد يمثّل بطاقة واحدة. مخطط له في مرحلة توسيع الذكاء الاصطناعي.' },
  vaultTitle:   { en: uiText('generatedUi.u_f64b8fad64bf6e68'), es: 'Inventario de credenciales', pt: 'Inventário de credenciais', pl: 'Inwentarz poświadczeń', ru: 'Инвентарь учётных данных', de: 'Anmeldedaten-Inventar', fr: 'Inventaire des identifiants', it: 'Inventario credenziali', ja: '認証情報インベントリ', ko: '자격 증명 인벤토리', ar: 'جرد بيانات الاعتماد' },
  vaultSub:     { en: uiText('generatedUi.u_b4b23ceb746ad33b'), es: 'Cada clave que usa tu plataforma — solo nombres y cobertura. Los valores nunca se muestran ni se guardan aquí.', pt: 'Cada chave que sua plataforma usa — apenas nomes e cobertura. Os valores nunca são mostrados ou armazenados aqui.', pl: 'Każdy klucz używany przez platformę — tylko nazwy i pokrycie. Wartości nigdy nie są pokazywane ani przechowywane.', ru: 'Каждый ключ платформы — только имена и покрытие. Значения никогда не показываются и не хранятся.', de: 'Jeder Schlüssel, den Ihre Plattform verwendet – nur Namen und Abdeckung. Werte werden hier niemals angezeigt oder gespeichert.', fr: 'Chaque clé utilisée par votre plateforme : noms et couverture uniquement. Les valeurs ne sont jamais affichées ni stockées ici.', it: 'Ogni chiave usata dalla tua piattaforma: solo nomi e copertura. I valori non vengono mai mostrati né memorizzati qui.', ja: 'プラットフォームが使用するすべてのキー（名前とカバレッジのみ）。値がここに表示または保存されることはありません。', ko: '플랫폼에서 사용하는 모든 키의 이름과 적용 범위만 표시합니다. 값은 여기에 표시되거나 저장되지 않습니다.', ar: 'كل مفتاح تستخدمه منصتك، الأسماء والتغطية فقط. لا تُعرَض القيم ولا تُخزَّن هنا أبدًا.' },
  vaultCoverage:{ en: uiText('generatedUi.u_bf10ab40acae34f1'), es: 'Cobertura de entornos', pt: 'Cobertura de ambientes', pl: 'Pokrycie środowisk', ru: 'Покрытие окружений', de: 'Umgebungsabdeckung', fr: 'Couverture des environnements', it: 'Copertura degli ambienti', ja: '環境カバレッジ', ko: '환경 커버리지', ar: 'تغطية البيئات' },
  vaultMissing: { en: uiText('generatedUi.u_c7dd42f75c434435'), es: 'falta en', pt: 'faltando em', pl: 'brakuje w', ru: 'отсутствует в', de: 'fehlt in', fr: 'manquant dans', it: 'mancante in', ja: '欠落：', ko: '누락 위치:', ar: 'مفقود في' },
  vaultOther:   { en: uiText('generatedUi.u_f97e9da0e3b879f0'), es: 'Otros', pt: 'Outros', pl: 'Inne', ru: 'Прочее', de: 'Sonstiges', fr: 'Autre', it: 'Altro', ja: 'その他', ko: '기타', ar: 'أخرى' },
  vaultNeedsToken:{ en: uiText('generatedUi.u_8001bddd9a62c522'), es: 'La Bóveda lee desde Vercel. Agrega la variable VERCEL_TOKEN para activarla.', pt: 'O Cofre lê da Vercel. Adicione a variável VERCEL_TOKEN para ativá-lo.', pl: 'Sejf czyta z Vercel. Dodaj zmienną VERCEL_TOKEN, aby go aktywować.', ru: 'Хранилище читает из Vercel. Добавьте переменную VERCEL_TOKEN для активации.', de: 'Der Schlüsseltresor liest aus Vercel. Fügen Sie eine Umgebungsvariable VERCEL_TOKEN hinzu, um ihn zu aktivieren.', fr: 'Le coffre-fort de clés lit depuis Vercel. Ajoutez une variable d’environnement VERCEL_TOKEN pour l’activer.', it: 'Il Key Vault legge da Vercel. Aggiungi una variabile d’ambiente VERCEL_TOKEN per attivarlo.', ja: 'キーボールトは Vercel から読み取ります。有効にするには環境変数 VERCEL_TOKEN を追加してください。', ko: '키 볼트는 Vercel에서 읽어옵니다. 활성화하려면 VERCEL_TOKEN 환경 변수를 추가하세요.', ar: 'تقرأ خزنة المفاتيح من Vercel. أضف متغير البيئة VERCEL_TOKEN لتفعيلها.' },
  vaultKeys:    { en: uiText('generatedUi.u_48a53f0774c8ceff'), es: 'claves', pt: 'chaves', pl: 'kluczy', ru: 'ключей', de: 'Schlüssel', fr: 'clés', it: 'chiavi', ja: 'キー', ko: '키', ar: 'مفاتيح' },
}

export function c(key: string, lang: Lang): string {
  const entry = COPY[key]
  if (!entry) return key
  return entry[lang] || entry.en
}


// ═══════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM — one source of truth for the entire Hub Console.
// Principles: calm deep-navy surfaces, hairline structure, a restrained
// gold/cyan accent pair used in small deliberate doses, and a consistent
// type + spacing + radius scale. Refine values here and every provider,
// card, and page updates in lockstep.
// ═══════════════════════════════════════════════════════════════════════════

// Surfaces
export const SURFACE = {
  page:   '#080c16',
  raised: 'linear-gradient(165deg, rgba(22,31,54,.55), rgba(8,12,22,.86))',
  sunken: 'rgba(4,8,16,.55)',
  inset:  'rgba(255,255,255,.03)',
  insetStrong: 'rgba(255,255,255,.05)',
}

// Hairline borders
export const LINE = {
  faint:  'rgba(255,255,255,.06)',
  soft:   'rgba(255,255,255,.10)',
  medium: 'rgba(255,255,255,.16)',
}

// Text levels (a clear ramp, not a rainbow)
export const TEXT = {
  primary:   "rgba(255,255,255,.95)",
  secondary: "rgba(255,255,255,.66)",
  muted:     "rgba(255,255,255,.44)",
  faint:     "rgba(255,255,255,.30)",
}

// Brand accents — used sparingly for emphasis and interactivity
export const ACCENT = { gold: '#ffc300', cyan: '#1af0ff' }

// Semantic status colors (softened, less neon)
export const SEMANTIC = { green: '#34d399', amber: '#fbbf24', red: '#f87171' }

// Geometry — one consistent family
export const RADIUS = { sm: 8, md: 12, lg: 16, pill: 999 }
export const SPACE  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 }

// Elevation — restrained, no glow
export const SHADOW = {
  sm: '0 1px 2px rgba(0,0,0,.28)',
  md: '0 10px 30px rgba(0,0,0,.34)',
  lg: '0 24px 64px rgba(0,0,0,.46)',
}

// Type
export const FONT = {
  sans: 'inherit',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
export const TYPE = {
  display: { fontSize: 20, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.2 },
  title:   { fontSize: 16, fontWeight: 700, letterSpacing: '-.005em', lineHeight: 1.25 },
  body:    { fontSize: 13, fontWeight: 500, lineHeight: 1.5 },
  small:   { fontSize: 12, fontWeight: 500, lineHeight: 1.45 },
  eyebrow: { fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' as const },
}

// Tone palette (refined: calmer fills, hairline borders). Same shape + keys.
export type Tone = { strong: string; soft: string; border: string }
export const TONES: Record<string, Tone> = {
  green:  { strong: '#34d399', soft: 'rgba(52,211,153,.12)',  border: 'rgba(52,211,153,.30)' },
  blue:   { strong: '#60a5fa', soft: 'rgba(96,165,250,.12)',  border: 'rgba(96,165,250,.30)' },
  purple: { strong: '#a78bfa', soft: 'rgba(167,139,250,.12)', border: 'rgba(167,139,250,.30)' },
  gray:   { strong: '#94a3b8', soft: 'rgba(148,163,184,.10)', border: 'rgba(148,163,184,.26)' },
  gold:   { strong: '#ffc300', soft: 'rgba(255,195,0,.10)',   border: 'rgba(255,195,0,.30)' },
  cyan:   { strong: '#1af0ff', soft: 'rgba(26,240,255,.10)',  border: 'rgba(26,240,255,.30)' },
}

// ── Core style tokens (same export names — used across every Hub page) ──────
export const cardStyle: React.CSSProperties = {
  background: SURFACE.raised,
  border: `1px solid ${LINE.soft}`,
  borderRadius: RADIUS.lg,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  boxShadow: SHADOW.md,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden',
}

export const bodyStyle: React.CSSProperties = {
  padding: `${SPACE.lg}px ${SPACE.lg}px ${SPACE.xl}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.md,
  flex: 1,
  minHeight: 0,
}

export const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: TEXT.muted,
}

export const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: SPACE.md,
  padding: `${SPACE.sm + 2}px ${SPACE.md}px`,
  background: SURFACE.inset,
  border: `1px solid ${LINE.faint}`,
  borderRadius: RADIUS.md,
  fontSize: 13,
}

export const monoStyle: React.CSSProperties = {
  fontFamily: FONT.mono,
  fontSize: 12,
  color: TEXT.secondary,
}

// Shared interactive surfaces (exported for forms/inputs across the Hub)
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: `${SPACE.sm + 3}px ${SPACE.md}px`,
  borderRadius: RADIUS.md,
  border: `1px solid ${LINE.medium}`,
  background: SURFACE.sunken,
  color: TEXT.primary,
  fontSize: 13,
  fontFamily: FONT.sans,
  outline: 'none',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
}

export const primaryBtnStyle: React.CSSProperties = {
  padding: `${SPACE.sm + 2}px ${SPACE.lg}px`,
  borderRadius: RADIUS.md,
  border: `1px solid ${ACCENT.cyan}`,
  background: 'rgba(26,240,255,.12)',
  color: ACCENT.cyan,
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: '.01em',
  cursor: 'pointer',
}

export const ghostBtnStyle: React.CSSProperties = {
  padding: `${SPACE.sm + 2}px ${SPACE.lg}px`,
  borderRadius: RADIUS.md,
  border: `1px solid ${LINE.medium}`,
  background: SURFACE.inset,
  color: TEXT.secondary,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
}

// ── Component primitives (same signatures, refined visuals) ────────────────
export function Dot({ tone }: { tone: 'green' | 'yellow' | 'red' }) {
  const color = tone === 'green' ? SEMANTIC.green : tone === 'yellow' ? ACCENT.gold : SEMANTIC.red
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}22`, display: 'inline-block', flexShrink: 0 }} />
}

export function Band({ tone, icon, title, plain, sub }: { tone: Tone; icon: string; title: string; plain: string; sub: string }) {
  return (
    <div style={{ padding: `${SPACE.lg}px ${SPACE.lg}px ${SPACE.md}px`, background: `linear-gradient(135deg, ${tone.soft}, rgba(8,12,22,0) 72%)`, borderBottom: `1px solid ${LINE.soft}`, position: 'relative' }}>
      <span aria-hidden="true" style={{ position: 'absolute', insetInlineStart: 0, bottom: 0, height: 2, width: 56, background: tone.strong, opacity: .85 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
        <span style={{ width: 42, height: 42, borderRadius: RADIUS.md, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, background: tone.soft, border: `1px solid ${tone.border}`, flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)' }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, flexWrap: 'wrap' }}>
            <span style={{ ...TYPE.display, color: TEXT.primary }}>{title}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: tone.strong }}>{plain}</span>
          </div>
          <div style={{ ...TYPE.small, color: TEXT.secondary, marginTop: 2 }}>{sub}</div>
        </div>
      </div>
    </div>
  )
}

export function Status({ ok, text }: { ok: boolean; text: string }) {
  const color = ok ? SEMANTIC.green : ACCENT.gold
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, fontSize: 13, fontWeight: 600, color }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}22`, flexShrink: 0 }} />
      {text}
    </div>
  )
}

export function ActionButton({ tone, label, href }: { tone: Tone; label: string; href: string }) {
  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="hub-btn" style={{ marginTop: 'auto', display: 'block', textAlign: 'center', padding: `${SPACE.sm + 3}px ${SPACE.lg}px`, borderRadius: RADIUS.md, border: `1px solid ${tone.border}`, background: tone.soft, color: TEXT.primary, fontSize: 13, fontWeight: 700, letterSpacing: '.01em', textDecoration: 'none', transition: 'background .15s ease, border-color .15s ease' }}>{label}</a>
  )
}

export function DetailsToggle({ open, onClick, lang }: { open: boolean; onClick: () => void; lang: Lang }) {
  return (
    <button onClick={onClick} className="hub-chip" style={{ alignSelf: 'flex-start', padding: `${SPACE.xs + 2}px ${SPACE.md + 1}px`, borderRadius: RADIUS.pill, fontSize: 12, fontWeight: 600, background: SURFACE.inset, border: `1px solid ${LINE.medium}`, color: TEXT.secondary, cursor: 'pointer' }}>{open ? '▴ ' + c('hideDetails', lang) : '▾ ' + c('showDetails', lang)}</button>
  )
}
