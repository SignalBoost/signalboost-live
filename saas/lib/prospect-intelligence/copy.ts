// saas/lib/prospect-intelligence/copy.ts

import type { ProspectIntelligenceLanguage } from './contracts.ts'

type ProspectIntelligenceCopy = Readonly<{
  title: string
  description: string
  providerHubTitle: string
  noProviders: string
  connectionHealthy: string
  connectionDisabled: string
  connectionFailed: string
  validationFailed: string
  executionDisabled: string
  stagedConnectorNotice: string
}>

export const PROSPECT_INTELLIGENCE_COPY: Readonly<
  Record<ProspectIntelligenceLanguage, ProspectIntelligenceCopy>
> = {
  en: {
    title: 'Prospect Intelligence',
    description: 'Buyer-hosted, AI-assisted prospect research and qualification.',
    providerHubTitle: 'Provider Hub',
    noProviders: 'No providers are configured.',
    connectionHealthy: 'Connection healthy.',
    connectionDisabled: 'Connection disabled.',
    connectionFailed: 'Connection test failed.',
    validationFailed: 'Provider configuration is invalid.',
    executionDisabled: 'Live provider execution is disabled.',
    stagedConnectorNotice:
      'This connector is staged and requires the buyer’s own licence and credentials.',
  },
  es: {
    title: 'Inteligencia de prospectos',
    description:
      'Investigación y calificación de prospectos asistidas por IA y alojadas por el comprador.',
    providerHubTitle: 'Centro de proveedores',
    noProviders: 'No hay proveedores configurados.',
    connectionHealthy: 'La conexión funciona correctamente.',
    connectionDisabled: 'La conexión está deshabilitada.',
    connectionFailed: 'La prueba de conexión falló.',
    validationFailed: 'La configuración del proveedor no es válida.',
    executionDisabled: 'La ejecución con proveedores reales está deshabilitada.',
    stagedConnectorNotice:
      'Este conector está preparado y requiere la licencia y las credenciales del comprador.',
  },
  pt: {
    title: 'Inteligência de Prospects',
    description:
      'Pesquisa e qualificação de prospects assistidas por IA e hospedadas pelo comprador.',
    providerHubTitle: 'Central de Provedores',
    noProviders: 'Nenhum provedor está configurado.',
    connectionHealthy: 'A conexão está funcionando corretamente.',
    connectionDisabled: 'A conexão está desativada.',
    connectionFailed: 'O teste de conexão falhou.',
    validationFailed: 'A configuração do provedor é inválida.',
    executionDisabled: 'A execução com provedores reais está desativada.',
    stagedConnectorNotice:
      'Este conector está preparado e exige a licença e as credenciais do comprador.',
  },
  pl: {
    title: 'Analiza potencjalnych klientów',
    description:
      'Hostowane przez kupującego badanie i kwalifikowanie potencjalnych klientów wspomagane przez AI.',
    providerHubTitle: 'Centrum dostawców',
    noProviders: 'Nie skonfigurowano żadnych dostawców.',
    connectionHealthy: 'Połączenie działa prawidłowo.',
    connectionDisabled: 'Połączenie jest wyłączone.',
    connectionFailed: 'Test połączenia nie powiódł się.',
    validationFailed: 'Konfiguracja dostawcy jest nieprawidłowa.',
    executionDisabled: 'Wykonywanie operacji u aktywnych dostawców jest wyłączone.',
    stagedConnectorNotice:
      'Ten łącznik jest przygotowany i wymaga licencji oraz danych uwierzytelniających kupującego.',
  },
  ru: {
    title: 'Аналитика потенциальных клиентов',
    description:
      'Размещаемые у покупателя исследование и квалификация потенциальных клиентов с поддержкой ИИ.',
    providerHubTitle: 'Центр поставщиков',
    noProviders: 'Поставщики не настроены.',
    connectionHealthy: 'Подключение работает нормально.',
    connectionDisabled: 'Подключение отключено.',
    connectionFailed: 'Проверка подключения завершилась ошибкой.',
    validationFailed: 'Конфигурация поставщика недействительна.',
    executionDisabled: 'Работа с активными поставщиками отключена.',
    stagedConnectorNotice:
      'Этот коннектор подготовлен и требует лицензии и учетных данных покупателя.',
  },
  de: {
    title: 'Interessenten-Intelligence',
    description: 'Vom Käufer gehostete, KI-gestützte Recherche und Qualifizierung von Interessenten.',
    providerHubTitle: 'Anbieter-Hub',
    noProviders: 'Es sind keine Anbieter konfiguriert.',
    connectionHealthy: 'Verbindung fehlerfrei.',
    connectionDisabled: 'Verbindung deaktiviert.',
    connectionFailed: 'Verbindungstest fehlgeschlagen.',
    validationFailed: 'Die Anbieterkonfiguration ist ungültig.',
    executionDisabled: 'Die Live-Ausführung über Anbieter ist deaktiviert.',
    stagedConnectorNotice:
      'Dieser Konnektor ist vorbereitet und erfordert die eigene Lizenz und die Zugangsdaten des Käufers.',
  },
  fr: {
    title: 'Intelligence prospects',
    description: 'Recherche et qualification de prospects assistées par IA, hébergées par l’acheteur.',
    providerHubTitle: 'Hub des fournisseurs',
    noProviders: 'Aucun fournisseur n’est configuré.',
    connectionHealthy: 'Connexion opérationnelle.',
    connectionDisabled: 'Connexion désactivée.',
    connectionFailed: 'Échec du test de connexion.',
    validationFailed: 'La configuration du fournisseur n’est pas valide.',
    executionDisabled: 'L’exécution réelle via les fournisseurs est désactivée.',
    stagedConnectorNotice:
      'Ce connecteur est préparé et nécessite la licence et les identifiants propres à l’acheteur.',
  },
  it: {
    title: 'Prospect Intelligence',
    description: 'Ricerca e qualificazione dei prospect assistite dall’AI e ospitate dall’acquirente.',
    providerHubTitle: 'Hub dei provider',
    noProviders: 'Nessun provider configurato.',
    connectionHealthy: 'Connessione funzionante.',
    connectionDisabled: 'Connessione disattivata.',
    connectionFailed: 'Test di connessione non riuscito.',
    validationFailed: 'La configurazione del provider non è valida.',
    executionDisabled: 'L’esecuzione live tramite provider è disattivata.',
    stagedConnectorNotice:
      'Questo connettore è predisposto e richiede la licenza e le credenziali proprie dell’acquirente.',
  },
  ja: {
    title: '見込み客インテリジェンス',
    description: '購入者がホストする、AI 支援の見込み客調査と選定。',
    providerHubTitle: 'プロバイダー Hub',
    noProviders: 'プロバイダーが設定されていません。',
    connectionHealthy: '接続は正常です。',
    connectionDisabled: '接続は無効です。',
    connectionFailed: '接続テストに失敗しました。',
    validationFailed: 'プロバイダーの設定が無効です。',
    executionDisabled: 'プロバイダーでの本番実行は無効です。',
    stagedConnectorNotice:
      'このコネクタは準備済みで、購入者自身のライセンスと認証情報が必要です。',
  },
  ko: {
    title: '잠재 고객 인텔리전스',
    description: '구매자가 호스팅하는 AI 지원 잠재 고객 조사 및 검증.',
    providerHubTitle: '공급자 Hub',
    noProviders: '구성된 공급자가 없습니다.',
    connectionHealthy: '연결 상태가 양호합니다.',
    connectionDisabled: '연결이 비활성화되었습니다.',
    connectionFailed: '연결 테스트에 실패했습니다.',
    validationFailed: '공급자 구성이 올바르지 않습니다.',
    executionDisabled: '실제 공급자 실행이 비활성화되었습니다.',
    stagedConnectorNotice:
      '이 커넥터는 준비된 상태이며 구매자 자체의 라이선스와 자격 증명이 필요합니다.',
  },
  ar: {
    title: 'ذكاء العملاء المحتملين',
    description: 'بحث عن العملاء المحتملين وتأهيلهم بمساعدة الذكاء الاصطناعي ويستضيفه المشتري.',
    providerHubTitle: 'Hub المزوّدين',
    noProviders: 'لم يتم تكوين أي مزوّدين.',
    connectionHealthy: 'الاتصال سليم.',
    connectionDisabled: 'الاتصال معطّل.',
    connectionFailed: 'فشل اختبار الاتصال.',
    validationFailed: 'تكوين المزوّد غير صالح.',
    executionDisabled: 'التنفيذ الفعلي عبر المزوّدين معطّل.',
    stagedConnectorNotice:
      'هذا الموصل مُجهّز ويتطلب ترخيص المشتري وبيانات اعتماده الخاصة.',
  },
}
