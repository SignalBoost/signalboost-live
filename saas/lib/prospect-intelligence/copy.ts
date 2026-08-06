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
}
