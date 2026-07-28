// saas/lib/i18n/licenseSetupCopy.ts
//
// Copy for the licence setup page (app/dashboard/supervisor/license).
//
// It lives here rather than inside the page because scripts/enforce-localized-page-copy.mjs
// requires user-facing English to sit outside app/ and components/. Keeping it as a typed
// five-language table — rather than pushing it through the generated central table — keeps
// the translations authored together and reviewable in one place.

import type {
  LicenseEdition,
  LicenseMintErrorCode,
  LicenseMintFeatureId,
  LicenseMintRemedyCode,
  LicenseMintWarningCode,
} from '../supervisor/licenseMintContract'

export type LicenseSetupLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type LicenseSetupCopy = {
  title: string
  intro: string
  licensee: string
  licenseePlaceholder: string
  edition: string
  editions: Record<LicenseEdition, string>
  days: string
  mint: string
  minting: string
  needLicensee: string
  failed: string
  resultTitle: string
  envTitle: string
  envNote: string
  privateTitle: string
  privateNote: string
  detailsTitle: string
  licenseId: string
  features: string
  featureLabels: Record<LicenseMintFeatureId, string>
  expires: string
  nextTitle: string
  nextBody: string
  notAvailable: string
  errors: Record<LicenseMintErrorCode, string>
  remedies: Record<LicenseMintRemedyCode, string>
  warnings: Record<LicenseMintWarningCode, string>
}

export const LICENSE_SETUP_COPY: Record<LicenseSetupLanguage, LicenseSetupCopy> = {
  en: {
    title: 'Self-Healing Supervisor — licence setup',
    intro: 'Generates an issuer key pair and signs a licence for this product. The three values below go into the deployment environment.',
    licensee: 'Licensed to',
    licenseePlaceholder: 'Legal entity name',
    edition: 'Edition',
    editions: {
      standard: 'Standard',
      enterprise: 'Enterprise',
    },
    days: 'Valid for (days)',
    mint: 'Mint licence',
    minting: 'Minting…',
    needLicensee: 'Enter the name of the party this licence is issued to.',
    failed: 'The request did not complete.',
    resultTitle: 'Licence issued',
    envTitle: 'Environment variables',
    envNote: 'Set all three in the deployment, then redeploy. Licence configuration is read once per process, so editing a variable changes nothing until a new deployment starts.',
    privateTitle: 'Private key — shown once',
    privateNote: 'This is not stored anywhere. Put it in your vault now. It cannot be recovered, and it is the only thing that can mint a licence this deployment will accept.',
    detailsTitle: 'Record',
    licenseId: 'Licence id',
    features: 'Features',
    featureLabels: {
      'incident.observe': 'Incident visibility',
      'siem.export': 'SIEM export',
      'approval.gating': 'Approval controls',
      'repair.plan': 'Repair planning',
      'repair.dispatch': 'Approved repair execution',
      'repair.api-steps': 'API repair steps',
      'repair.browser-steps': 'Browser repair steps',
    },
    expires: 'Expires',
    nextTitle: 'After it is installed',
    nextBody: 'Open the demo page and raise a drill incident. The drill reports the licence verdict, so it is the honest test of whether the token took.',
    notAvailable: 'Not available',
    errors: {
      unauthorized: 'Your session is not authorized to issue a licence.',
      ownerOnly: 'Only the platform owner can issue a licence.',
      licenseeRequired: 'Enter the legal name of the party this licence is issued to.',
      invalidEdition: 'The selected edition is not available for this product.',
      invalidDays: 'The validity period must be a positive number.',
    },
    remedies: {
      useLegalEntityName: 'For your own deployment, use your own legal entity name.',
    },
    warnings: {
      privateKeyOnce: 'The private key is shown once and is not stored anywhere. Put it in your vault now; it cannot be recovered.',
      recordLicenseId: 'Record the licence id. Revocation uses this id.',
      limitsNotEnforced: 'Seat and execution limits are recorded in the token but are not enforced by the product. They remain contract terms.',
      redeployRequired: 'Set the three environment variables in the deployment and redeploy. Editing a variable alone does not reload the licence.',
    },
  },
  es: {
    title: 'Supervisor de Autorreparación — configuración de licencia',
    intro: 'Genera un par de claves de emisor y firma una licencia para este producto. Los tres valores siguientes se colocan en el entorno del despliegue.',
    licensee: 'Licencia a nombre de',
    licenseePlaceholder: 'Nombre de la entidad legal',
    edition: 'Edición',
    editions: {
      standard: 'Estándar',
      enterprise: 'Empresarial',
    },
    days: 'Vigencia (días)',
    mint: 'Emitir licencia',
    minting: 'Emitiendo…',
    needLicensee: 'Indique la parte a la que se emite esta licencia.',
    failed: 'La solicitud no se completó.',
    resultTitle: 'Licencia emitida',
    envTitle: 'Variables de entorno',
    envNote: 'Defina las tres en el despliegue y vuelva a desplegar. La configuración de licencia se lee una vez por proceso, así que editar una variable no cambia nada hasta que arranque un despliegue nuevo.',
    privateTitle: 'Clave privada: se muestra una sola vez',
    privateNote: 'No se guarda en ningún sitio. Guárdela ahora en su almacén de secretos. No se puede recuperar y es lo único que puede emitir una licencia que este despliegue acepte.',
    detailsTitle: 'Registro',
    licenseId: 'Id de licencia',
    features: 'Funciones',
    featureLabels: {
      'incident.observe': 'Visibilidad de incidentes',
      'siem.export': 'Exportación a SIEM',
      'approval.gating': 'Controles de aprobación',
      'repair.plan': 'Planificación de reparación',
      'repair.dispatch': 'Ejecución de reparaciones aprobadas',
      'repair.api-steps': 'Pasos de reparación mediante API',
      'repair.browser-steps': 'Pasos de reparación en navegador',
    },
    expires: 'Caduca',
    nextTitle: 'Una vez instalada',
    nextBody: 'Abra la página de demostración y genere un incidente de prueba. La prueba informa del veredicto de la licencia, así que es la comprobación honesta de si el token quedó activo.',
    notAvailable: 'No disponible',
    errors: {
      unauthorized: 'Su sesión no está autorizada para emitir una licencia.',
      ownerOnly: 'Solo el propietario de la plataforma puede emitir una licencia.',
      licenseeRequired: 'Indique el nombre legal de la parte a la que se emite esta licencia.',
      invalidEdition: 'La edición seleccionada no está disponible para este producto.',
      invalidDays: 'El período de vigencia debe ser un número positivo.',
    },
    remedies: {
      useLegalEntityName: 'Para su propio despliegue, utilice el nombre de su entidad legal.',
    },
    warnings: {
      privateKeyOnce: 'La clave privada se muestra una sola vez y no se guarda en ningún sitio. Guárdela ahora en su almacén de secretos; no se puede recuperar.',
      recordLicenseId: 'Anote el id de la licencia. La revocación utiliza este id.',
      limitsNotEnforced: 'Los límites de puestos y ejecuciones se registran en el token, pero el producto no los aplica. Siguen siendo condiciones contractuales.',
      redeployRequired: 'Defina las tres variables de entorno en el despliegue y vuelva a desplegar. Editar una variable no recarga por sí solo la licencia.',
    },
  },
  pt: {
    title: 'Supervisor de Autorreparação — configuração de licença',
    intro: 'Gera um par de chaves de emissor e assina uma licença para este produto. Os três valores abaixo entram no ambiente da implantação.',
    licensee: 'Licenciado a',
    licenseePlaceholder: 'Nome da entidade legal',
    edition: 'Edição',
    editions: {
      standard: 'Padrão',
      enterprise: 'Empresarial',
    },
    days: 'Válida por (dias)',
    mint: 'Emitir licença',
    minting: 'A emitir…',
    needLicensee: 'Indique a parte a quem esta licença é emitida.',
    failed: 'O pedido não foi concluído.',
    resultTitle: 'Licença emitida',
    envTitle: 'Variáveis de ambiente',
    envNote: 'Defina as três na implantação e volte a implantar. A configuração de licença é lida uma vez por processo, por isso editar uma variável não muda nada até arrancar uma nova implantação.',
    privateTitle: 'Chave privada — mostrada uma só vez',
    privateNote: 'Não é guardada em lado nenhum. Coloque-a já no seu cofre. Não pode ser recuperada e é a única coisa capaz de emitir uma licença que esta implantação aceite.',
    detailsTitle: 'Registo',
    licenseId: 'Id da licença',
    features: 'Funcionalidades',
    featureLabels: {
      'incident.observe': 'Visibilidade de incidentes',
      'siem.export': 'Exportação para SIEM',
      'approval.gating': 'Controlo de aprovações',
      'repair.plan': 'Planeamento de reparação',
      'repair.dispatch': 'Execução de reparações aprovadas',
      'repair.api-steps': 'Passos de reparação por API',
      'repair.browser-steps': 'Passos de reparação no navegador',
    },
    expires: 'Expira',
    nextTitle: 'Depois de instalada',
    nextBody: 'Abra a página de demonstração e levante um incidente de treino. O treino reporta o veredito da licença, por isso é o teste honesto de que o token ficou ativo.',
    notAvailable: 'Não disponível',
    errors: {
      unauthorized: 'A sua sessão não está autorizada a emitir uma licença.',
      ownerOnly: 'Apenas o proprietário da plataforma pode emitir uma licença.',
      licenseeRequired: 'Indique o nome legal da parte a quem esta licença é emitida.',
      invalidEdition: 'A edição selecionada não está disponível para este produto.',
      invalidDays: 'O período de validade deve ser um número positivo.',
    },
    remedies: {
      useLegalEntityName: 'Para a sua própria implantação, utilize o nome da sua entidade legal.',
    },
    warnings: {
      privateKeyOnce: 'A chave privada é mostrada uma só vez e não é guardada em lado nenhum. Coloque-a já no seu cofre; não pode ser recuperada.',
      recordLicenseId: 'Registe o id da licença. A revogação utiliza este id.',
      limitsNotEnforced: 'Os limites de lugares e execuções são registados no token, mas o produto não os aplica. Continuam a ser termos contratuais.',
      redeployRequired: 'Defina as três variáveis de ambiente na implantação e volte a implantar. Editar uma variável, por si só, não recarrega a licença.',
    },
  },
  pl: {
    title: 'Nadzorca Samonaprawy — konfiguracja licencji',
    intro: 'Generuje parę kluczy wydawcy i podpisuje licencję dla tego produktu. Trzy poniższe wartości trafiają do środowiska wdrożenia.',
    licensee: 'Licencja dla',
    licenseePlaceholder: 'Nazwa podmiotu prawnego',
    edition: 'Edycja',
    editions: {
      standard: 'Standardowa',
      enterprise: 'Korporacyjna',
    },
    days: 'Ważna przez (dni)',
    mint: 'Wydaj licencję',
    minting: 'Wydawanie…',
    needLicensee: 'Podaj podmiot, dla którego wydawana jest licencja.',
    failed: 'Żądanie nie zostało ukończone.',
    resultTitle: 'Licencja wydana',
    envTitle: 'Zmienne środowiskowe',
    envNote: 'Ustaw wszystkie trzy we wdrożeniu i wdroż ponownie. Konfiguracja licencji jest czytana raz na proces, więc sama edycja zmiennej nic nie zmieni, dopóki nie wystartuje nowe wdrożenie.',
    privateTitle: 'Klucz prywatny — pokazany raz',
    privateNote: 'Nie jest nigdzie zapisywany. Umieść go teraz w swoim sejfie. Nie da się go odzyskać, a jest jedyną rzeczą zdolną wydać licencję akceptowaną przez to wdrożenie.',
    detailsTitle: 'Zapis',
    licenseId: 'Identyfikator licencji',
    features: 'Funkcje',
    featureLabels: {
      'incident.observe': 'Wgląd w incydenty',
      'siem.export': 'Eksport do SIEM',
      'approval.gating': 'Kontrola zatwierdzeń',
      'repair.plan': 'Planowanie naprawy',
      'repair.dispatch': 'Wykonywanie zatwierdzonych napraw',
      'repair.api-steps': 'Kroki naprawy przez API',
      'repair.browser-steps': 'Kroki naprawy w przeglądarce',
    },
    expires: 'Wygasa',
    nextTitle: 'Po zainstalowaniu',
    nextBody: 'Otwórz stronę demonstracji i zgłoś incydent ćwiczebny. Ćwiczenie raportuje werdykt licencji, więc jest uczciwym testem, czy token zadziałał.',
    notAvailable: 'Niedostępne',
    errors: {
      unauthorized: 'Ta sesja nie ma uprawnień do wydania licencji.',
      ownerOnly: 'Tylko właściciel platformy może wydać licencję.',
      licenseeRequired: 'Podaj prawną nazwę podmiotu, dla którego wydawana jest licencja.',
      invalidEdition: 'Wybrana edycja nie jest dostępna dla tego produktu.',
      invalidDays: 'Okres ważności musi być liczbą dodatnią.',
    },
    remedies: {
      useLegalEntityName: 'Dla własnego wdrożenia użyj prawnej nazwy swojego podmiotu.',
    },
    warnings: {
      privateKeyOnce: 'Klucz prywatny jest pokazany tylko raz i nie jest nigdzie zapisywany. Umieść go teraz w sejfie; nie da się go odzyskać.',
      recordLicenseId: 'Zapisz identyfikator licencji. Unieważnienie korzysta z tego identyfikatora.',
      limitsNotEnforced: 'Limity stanowisk i wykonań są zapisane w tokenie, ale produkt ich nie egzekwuje. Pozostają warunkami umowy.',
      redeployRequired: 'Ustaw trzy zmienne środowiskowe we wdrożeniu i wdroż ponownie. Sama edycja zmiennej nie przeładuje licencji.',
    },
  },
  ru: {
    title: 'Супервизор самовосстановления — настройка лицензии',
    intro: 'Создаёт пару ключей издателя и подписывает лицензию для этого продукта. Три значения ниже вносятся в окружение развёртывания.',
    licensee: 'Лицензия выдана',
    licenseePlaceholder: 'Наименование юридического лица',
    edition: 'Редакция',
    editions: {
      standard: 'Стандартная',
      enterprise: 'Корпоративная',
    },
    days: 'Срок действия (дней)',
    mint: 'Выпустить лицензию',
    minting: 'Выпуск…',
    needLicensee: 'Укажите сторону, которой выдаётся лицензия.',
    failed: 'Запрос не был завершён.',
    resultTitle: 'Лицензия выпущена',
    envTitle: 'Переменные окружения',
    envNote: 'Задайте все три в развёртывании и выполните повторное развёртывание. Конфигурация лицензии читается один раз за процесс, поэтому правка переменной ничего не изменит до старта нового развёртывания.',
    privateTitle: 'Закрытый ключ — показывается один раз',
    privateNote: 'Он нигде не сохраняется. Поместите его в хранилище прямо сейчас. Восстановить его нельзя, и это единственное, чем можно выпустить лицензию, которую примет это развёртывание.',
    detailsTitle: 'Запись',
    licenseId: 'Идентификатор лицензии',
    features: 'Возможности',
    featureLabels: {
      'incident.observe': 'Просмотр инцидентов',
      'siem.export': 'Экспорт в SIEM',
      'approval.gating': 'Контроль согласований',
      'repair.plan': 'Планирование восстановления',
      'repair.dispatch': 'Выполнение одобренных восстановлений',
      'repair.api-steps': 'Шаги восстановления через API',
      'repair.browser-steps': 'Шаги восстановления через браузер',
    },
    expires: 'Истекает',
    nextTitle: 'После установки',
    nextBody: 'Откройте страницу демонстрации и создайте учебный инцидент. Учение сообщает вердикт лицензии — это честная проверка того, что токен принят.',
    notAvailable: 'Недоступно',
    errors: {
      unauthorized: 'У этой сессии нет разрешения на выпуск лицензии.',
      ownerOnly: 'Выпустить лицензию может только владелец платформы.',
      licenseeRequired: 'Укажите юридическое наименование стороны, которой выдаётся лицензия.',
      invalidEdition: 'Выбранная редакция недоступна для этого продукта.',
      invalidDays: 'Срок действия должен быть положительным числом.',
    },
    remedies: {
      useLegalEntityName: 'Для собственного развёртывания используйте наименование своего юридического лица.',
    },
    warnings: {
      privateKeyOnce: 'Закрытый ключ показывается один раз и нигде не сохраняется. Поместите его в хранилище сейчас; восстановить его нельзя.',
      recordLicenseId: 'Запишите идентификатор лицензии. Для отзыва используется этот идентификатор.',
      limitsNotEnforced: 'Ограничения по местам и запускам записываются в токене, но продукт их не применяет. Они остаются условиями договора.',
      redeployRequired: 'Задайте три переменные окружения в развёртывании и выполните повторное развёртывание. Простое изменение переменной не перезагружает лицензию.',
    },
  },
}
