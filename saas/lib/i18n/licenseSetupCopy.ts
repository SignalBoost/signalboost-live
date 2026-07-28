// saas/lib/i18n/licenseSetupCopy.ts
//
// Copy for the licence setup page (app/dashboard/supervisor/license).
//
// It lives here rather than inside the page because scripts/enforce-localized-page-copy.mjs
// requires user-facing English to sit outside app/ and components/. Keeping it as a typed
// five-language table — rather than pushing it through the generated central table — keeps
// the translations authored together and reviewable in one place.

export type LicenseSetupLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type LicenseSetupCopy = {
  title: string
  intro: string
  licensee: string
  licenseePlaceholder: string
  edition: string
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
  expires: string
  nextTitle: string
  nextBody: string
}

export const LICENSE_SETUP_COPY: Record<LicenseSetupLanguage, LicenseSetupCopy> = {
  en: {
    title: 'Self-Healing Supervisor — licence setup',
    intro: 'Generates an issuer key pair and signs a licence for this product. The three values below go into the deployment environment.',
    licensee: 'Licensed to',
    licenseePlaceholder: 'Legal entity name',
    edition: 'Edition',
    days: 'Valid for (days)',
    mint: 'Mint licence',
    minting: 'Minting…',
    needLicensee: 'Enter the name of the party this licence is issued to.',
    failed: 'The request did not complete',
    resultTitle: 'Licence issued',
    envTitle: 'Environment variables',
    envNote: 'Set all three in the deployment, then redeploy. Licence configuration is read once per process, so editing a variable changes nothing until a new deployment starts.',
    privateTitle: 'Private key — shown once',
    privateNote: 'This is not stored anywhere. Put it in your vault now. It cannot be recovered, and it is the only thing that can mint a licence this deployment will accept.',
    detailsTitle: 'Record',
    licenseId: 'Licence id',
    features: 'Features',
    expires: 'Expires',
    nextTitle: 'After it is installed',
    nextBody: 'Open the demo page and raise a drill incident. The drill reports the licence verdict, so it is the honest test of whether the token took.',
  },
  es: {
    title: 'Supervisor de Autorreparación — configuración de licencia',
    intro: 'Genera un par de claves de emisor y firma una licencia para este producto. Los tres valores siguientes se colocan en el entorno del despliegue.',
    licensee: 'Licencia a nombre de',
    licenseePlaceholder: 'Nombre de la entidad legal',
    edition: 'Edición',
    days: 'Vigencia (días)',
    mint: 'Emitir licencia',
    minting: 'Emitiendo…',
    needLicensee: 'Indique la parte a la que se emite esta licencia.',
    failed: 'La solicitud no se completó',
    resultTitle: 'Licencia emitida',
    envTitle: 'Variables de entorno',
    envNote: 'Defina las tres en el despliegue y vuelva a desplegar. La configuración de licencia se lee una vez por proceso, así que editar una variable no cambia nada hasta que arranque un despliegue nuevo.',
    privateTitle: 'Clave privada: se muestra una sola vez',
    privateNote: 'No se guarda en ningún sitio. Guárdela ahora en su almacén de secretos. No se puede recuperar y es lo único que puede emitir una licencia que este despliegue acepte.',
    detailsTitle: 'Registro',
    licenseId: 'Id de licencia',
    features: 'Funciones',
    expires: 'Caduca',
    nextTitle: 'Una vez instalada',
    nextBody: 'Abra la página de demostración y genere un incidente de prueba. La prueba informa del veredicto de la licencia, así que es la comprobación honesta de si el token quedó activo.',
  },
  pt: {
    title: 'Supervisor de Autorreparação — configuração de licença',
    intro: 'Gera um par de chaves de emissor e assina uma licença para este produto. Os três valores abaixo entram no ambiente da implantação.',
    licensee: 'Licenciado a',
    licenseePlaceholder: 'Nome da entidade legal',
    edition: 'Edição',
    days: 'Válida por (dias)',
    mint: 'Emitir licença',
    minting: 'A emitir…',
    needLicensee: 'Indique a parte a quem esta licença é emitida.',
    failed: 'O pedido não foi concluído',
    resultTitle: 'Licença emitida',
    envTitle: 'Variáveis de ambiente',
    envNote: 'Defina as três na implantação e volte a implantar. A configuração de licença é lida uma vez por processo, por isso editar uma variável não muda nada até arrancar uma nova implantação.',
    privateTitle: 'Chave privada — mostrada uma só vez',
    privateNote: 'Não é guardada em lado nenhum. Coloque-a já no seu cofre. Não pode ser recuperada e é a única coisa capaz de emitir uma licença que esta implantação aceite.',
    detailsTitle: 'Registo',
    licenseId: 'Id da licença',
    features: 'Funcionalidades',
    expires: 'Expira',
    nextTitle: 'Depois de instalada',
    nextBody: 'Abra a página de demonstração e levante um incidente de treino. O treino reporta o veredito da licença, por isso é o teste honesto de que o token ficou activo.',
  },
  pl: {
    title: 'Nadzorca Samonaprawy — konfiguracja licencji',
    intro: 'Generuje parę kluczy wydawcy i podpisuje licencję dla tego produktu. Trzy poniższe wartości trafiają do środowiska wdrożenia.',
    licensee: 'Licencja dla',
    licenseePlaceholder: 'Nazwa podmiotu prawnego',
    edition: 'Edycja',
    days: 'Ważna przez (dni)',
    mint: 'Wydaj licencję',
    minting: 'Wydawanie…',
    needLicensee: 'Podaj podmiot, dla którego wydawana jest licencja.',
    failed: 'Żądanie nie zostało ukończone',
    resultTitle: 'Licencja wydana',
    envTitle: 'Zmienne środowiskowe',
    envNote: 'Ustaw wszystkie trzy we wdrożeniu i wdroż ponownie. Konfiguracja licencji jest czytana raz na proces, więc sama edycja zmiennej nic nie zmieni, dopóki nie wystartuje nowe wdrożenie.',
    privateTitle: 'Klucz prywatny — pokazany raz',
    privateNote: 'Nie jest nigdzie zapisywany. Umieść go teraz w swoim sejfie. Nie da się go odzyskać, a jest jedyną rzeczą zdolną wydać licencję akceptowaną przez to wdrożenie.',
    detailsTitle: 'Zapis',
    licenseId: 'Identyfikator licencji',
    features: 'Funkcje',
    expires: 'Wygasa',
    nextTitle: 'Po zainstalowaniu',
    nextBody: 'Otwórz stronę demonstracji i zgłoś incydent ćwiczebny. Ćwiczenie raportuje werdykt licencji, więc jest uczciwym testem, czy token zadziałał.',
  },
  ru: {
    title: 'Супервизор самовосстановления — настройка лицензии',
    intro: 'Создаёт пару ключей издателя и подписывает лицензию для этого продукта. Три значения ниже вносятся в окружение развёртывания.',
    licensee: 'Лицензия выдана',
    licenseePlaceholder: 'Наименование юридического лица',
    edition: 'Редакция',
    days: 'Срок действия (дней)',
    mint: 'Выпустить лицензию',
    minting: 'Выпуск…',
    needLicensee: 'Укажите сторону, которой выдаётся лицензия.',
    failed: 'Запрос не был завершён',
    resultTitle: 'Лицензия выпущена',
    envTitle: 'Переменные окружения',
    envNote: 'Задайте все три в развёртывании и выполните повторное развёртывание. Конфигурация лицензии читается один раз за процесс, поэтому правка переменной ничего не изменит до старта нового развёртывания.',
    privateTitle: 'Закрытый ключ — показывается один раз',
    privateNote: 'Он нигде не сохраняется. Поместите его в хранилище прямо сейчас. Восстановить его нельзя, и это единственное, чем можно выпустить лицензию, которую примет это развёртывание.',
    detailsTitle: 'Запись',
    licenseId: 'Идентификатор лицензии',
    features: 'Возможности',
    expires: 'Истекает',
    nextTitle: 'После установки',
    nextBody: 'Откройте страницу демонстрации и создайте учебный инцидент. Учение сообщает вердикт лицензии — это честная проверка того, что токен принят.',
  },
}
