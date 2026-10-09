'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'


type Certification = {
  certificationId: string
  occurredAt?: string
  completedAt?: string
  status?: 'passed' | 'partial' | 'failed'
  transportProtocol?: string
  checks?: Array<{ id: string; status: string; latencyMs: number; errorCode: string | null }>
  unverifiedDeclaredCapabilities?: string[]
}
type Assignment = {
  assignmentId: string
  use: 'cos_reasoner' | 'builder' | 'specialist'
  profileKey: string
  previousAssignmentId: string | null
  certificationEventId: string
  status: string
  createdAt: string
}
type Profile = {
  key: string
  family: string
  modelId: string
  providerModelId: string
  revision: string | null
  revisionPolicy: string
  tokenizerModelId: string | null
  uses: string[]
  transportProtocols: string[]
  inference: Record<string, string>
  training: Record<string, string>
  durableRegistration: boolean
  binding: null | {
    provider: string
    protocol: string
    credentialConfigured: boolean
    apiVersion: string | null
    timeoutMs: number
    maxCallCostUsd: number
  }
  builtInAdapterAvailable: boolean
  certifiable: boolean
  latestCertification: Certification | null
}
type AssignmentGroup = {
  use: Assignment['use']
  current: Assignment | null
  history: Assignment[]
}
type Inventory = {
  ok: boolean
  registryStrictMode: boolean
  profiles: Profile[]
  assignments: AssignmentGroup[]
  certificationReceipts: Certification[]
  config: {
    durableRegistry: boolean
    serverBootstrapRegistryConfigured: boolean
    serverBootstrapTransportConfigured: boolean
    registrationSource: string
    secretsReturned: false
  }
  error?: string
}

type Locale = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
const COPY: Record<Locale, Record<string, string>> = {
  en: {
    eyebrow:uiText('generatedUi.u_45313f94f36602b8'), title:uiText('generatedUi.u_a562b70726c1b3ea'),
    intro:uiText('generatedUi.u_d5bbd2162bf4ec76'),
    loading:uiText('generatedUi.u_c4d90a5bc541f363'), unavailable:uiText('generatedUi.u_e93393ea2d0f3271'),
    strict:uiText('generatedUi.u_fa30dcef58aa63a2'), enabled:uiText('generatedUi.u_92c1cdfdf4cb9cf6'), disabled:uiText('generatedUi.u_0a78e4a1db8cfae0'),
    registration:uiText('generatedUi.u_1bd5a23939fe3527'), durable:uiText('generatedUi.u_516d18db3049668d'),
    registerTitle:uiText('generatedUi.u_ba99965dfae53b49'), registerNote:uiText('generatedUi.u_88341ea572f908d8'),
    key:'Profile key', family:uiText('generatedUi.u_bd2d677b2ed4381b'), model:uiText('generatedUi.u_089ef2b6dbb34fa9'), providerModel:uiText('generatedUi.u_7aed0880728081cb'), revisionPolicy:uiText('generatedUi.u_c5bdb5ecf3a9955b'), revision:uiText('generatedUi.u_2e516d68f42f3e35'), tokenizer:uiText('generatedUi.u_735c9f3f4b42f5c4'),
    uses:uiText('generatedUi.u_96ee07b30e30c703'), transport:uiText('generatedUi.u_aaead4abf5d0fd5e'), provider:uiText('generatedUi.u_96cd4b4aa9291460'), endpoint:uiText('generatedUi.u_bde065b3835c90ee'), credential:uiText('generatedUi.u_a97d83648fc247e9'), cost:uiText('generatedUi.u_85fec3d60799d99f'), timeout:uiText('generatedUi.u_3b453bc8bd286be4'),
    json:uiText('generatedUi.u_d6fc4c85a1b0a651'), tools:uiText('generatedUi.u_10d67f48de9986c9'), streaming:uiText('generatedUi.u_a951c5945635e2d3'), save:uiText('generatedUi.u_f5bee9cb6313b524'), saving:uiText('generatedUi.u_23e39291d6135814'),
    inventory:uiText('generatedUi.u_af6195df362c8444'), adapter:uiText('generatedUi.u_0252b84901033771'), available:uiText('generatedUi.u_ddd9818abacfde7a'), hostRequired:uiText('generatedUi.u_8c30cb2e54fd41a1'),
    cert:uiText('generatedUi.u_86846f67dd19ad45'), none:uiText('generatedUi.u_7f8ecd1bd7fd19c4'), certify:uiText('generatedUi.u_48ff9521e1087816'), certifying:uiText('generatedUi.u_cf37a56bc78d921b'),
    spend:uiText('generatedUi.u_0e8a3b921df137d3'),
    checks:uiText('generatedUi.u_de07d07209556c79'), partial:uiText('generatedUi.u_f7e3a9227b046f1d'),
    assignments:uiText('generatedUi.u_70bdfc4e6bac0eda'), assign:uiText('generatedUi.u_8ece895c9b32c643'), assigning:uiText('generatedUi.u_8157fc4e6bdbbefa'), rollback:uiText('generatedUi.u_c591f5574995c740'), release:uiText('generatedUi.u_092390d46657bc5a'), disabling:uiText('generatedUi.u_fb7bdec372eeef3f'), disable:uiText('generatedUi.u_40cc2683713b4e4d'),
    current:uiText('generatedUi.u_e0d1b68224bf0b31'), noAssignment:uiText('generatedUi.u_c47dadc5e63c74b4'), history:uiText('generatedUi.u_60d04d82b62a8886'),
    confirmRegister:uiText('generatedUi.u_0e0770333c91df08'),
    confirmCert:uiText('generatedUi.u_8d742d112db235a2'),
    confirmAssign:uiText('generatedUi.u_9748e1ae0aa7711d'),
    confirmRollback:uiText('generatedUi.u_55a335160f876171'),
    confirmRelease:uiText('generatedUi.u_dde0e20e29669178'),
    confirmDisable:uiText('generatedUi.u_e3da7b10b3f6c9bc'),
    saved:uiText('generatedUi.u_84368feb416ba1d3'), assigned:uiText('generatedUi.u_376a4046ba5ec2cc'), rolledBack:uiText('generatedUi.u_3c3d4356831c12d3'), released:uiText('generatedUi.u_c618fe17763edfbe'), disabledModel:uiText('generatedUi.u_e395e0aae4dfd264'),
  },
  es: {
    eyebrow:'Modelos de plataforma', title:'Consola de modelos y proveedores',
    intro:'Registra modelos del comprador, cifra credenciales, certifica capacidades reales y controla asignación o reversión para COS, Builder y especialistas.',
    loading:'Cargando modelos…', unavailable:'Consola de modelos no disponible',
    strict:'Enrutamiento estricto de modelos registrados', enabled:'Activado', disabled:'Modo de compatibilidad de migración',
    registration:'Origen del registro', durable:'Registro durable y neutral al host',
    registerTitle:'Registrar o actualizar un modelo', registerNote:'Las credenciales se cifran en el servidor y nunca vuelven al navegador. Al rotarlas se elimina el cifrado anterior.',
    key:'Clave del perfil', family:'Familia', model:'ID del modelo', providerModel:'ID del modelo del proveedor', revisionPolicy:'Política de revisión', revision:'Revisión', tokenizer:'ID del tokenizador',
    uses:'Usos permitidos', transport:'Transporte', provider:'Proveedor', endpoint:'Endpoint HTTPS', credential:'Credencial del proveedor', cost:'Coste máximo por llamada (USD)', timeout:'Tiempo límite (ms)',
    json:'JSON estructurado', tools:'Uso de herramientas', streaming:'Streaming', save:'Guardar registro', saving:'Guardando…',
    inventory:'Inventario de modelos', adapter:'Adaptador', available:'disponible', hostRequired:'requiere plug-in del host',
    cert:'Certificación', none:'Sin certificado', certify:'Ejecutar certificación', certifying:'Certificando…',
    spend:'La certificación realiza llamadas reales limitadas y puede generar cargos.',
    checks:'Pruebas', partial:'Capacidades declaradas no verificadas',
    assignments:'Asignaciones de producción', assign:'Asignar', assigning:'Asignando…', rollback:'Revertir', release:'Usar valor predeterminado', disabling:'Desactivando…', disable:'Desactivar registro',
    current:'Actual', noAssignment:'Sin asignación durable', history:'Historial reciente',
    confirmRegister:'¿Guardar este registro y su configuración de credencial cifrada?',
    confirmCert:'¿Ejecutar certificación en vivo? Puede generar cargos limitados.',
    confirmAssign:'¿Activar este modelo certificado para este rol? No habrá fallback silencioso a otro modelo.',
    confirmRollback:'¿Revertir este rol a su asignación anterior?',
    confirmRelease:'¿Liberar esta asignación y devolver el rol al enrutamiento predeterminado de la plataforma?',
    confirmDisable:'¿Desactivar este registro? Primero hay que revertir las asignaciones activas.',
    saved:'Registro guardado.', assigned:'Asignación cambiada.', rolledBack:'Asignación revertida.', released:'Asignación liberada al enrutamiento predeterminado.', disabledModel:'Registro desactivado.',
  },
  pt: {
    eyebrow:'Modelos da plataforma', title:'Console de modelos e provedores',
    intro:'Registre modelos do comprador, mantenha credenciais criptografadas, certifique capacidades reais e governe atribuição ou rollback para COS, Builder e especialistas.',
    loading:'Carregando modelos…', unavailable:'Console de modelos indisponível',
    strict:'Roteamento estrito de modelos registrados', enabled:'Ativado', disabled:'Modo de compatibilidade de migração',
    registration:'Origem do registro', durable:'Registro durável e neutro ao host',
    registerTitle:'Registrar ou atualizar um modelo', registerNote:'As credenciais são criptografadas no servidor e nunca retornam ao navegador. Ao rotacionar, o ciphertext anterior é apagado.',
    key:'Chave do perfil', family:'Família', model:'ID do modelo', providerModel:'ID do modelo no provedor', revisionPolicy:'Política de revisão', revision:'Revisão', tokenizer:'ID do tokenizer',
    uses:'Usos permitidos', transport:'Transporte', provider:'Provedor', endpoint:'Endpoint HTTPS', credential:'Credencial do provedor', cost:'Custo máximo por chamada (USD)', timeout:'Timeout (ms)',
    json:'JSON estruturado', tools:'Uso de ferramentas', streaming:'Streaming', save:'Salvar registro', saving:'Salvando…',
    inventory:'Inventário de modelos', adapter:'Adaptador', available:'disponível', hostRequired:'requer plug-in do host',
    cert:'Certificação', none:'Sem certificado', certify:'Executar certificação', certifying:'Certificando…',
    spend:'A certificação faz chamadas reais limitadas e pode gerar cobranças.',
    checks:'Verificações', partial:'Capacidades declaradas não verificadas',
    assignments:'Atribuições de produção', assign:'Atribuir', assigning:'Atribuindo…', rollback:'Rollback', release:'Usar padrão da plataforma', disabling:'Desativando…', disable:'Desativar registro',
    current:'Atual', noAssignment:'Sem atribuição durável', history:'Histórico recente',
    confirmRegister:'Salvar este registro e a configuração de credencial criptografada?',
    confirmCert:'Executar certificação ao vivo? Pode gerar cobranças limitadas.',
    confirmAssign:'Ativar este modelo certificado para este papel? Não haverá fallback silencioso para outro modelo.',
    confirmRollback:'Fazer rollback deste papel para a atribuição anterior?',
    confirmRelease:'Liberar esta atribuição e retornar o papel ao roteamento padrão da plataforma?',
    confirmDisable:'Desativar este registro? Atribuições ativas precisam ser revertidas primeiro.',
    saved:'Registro salvo.', assigned:'Atribuição alterada.', rolledBack:'Rollback concluído.', released:'Atribuição liberada para o roteamento padrão da plataforma.', disabledModel:'Registro desativado.',
  },
  pl: {
    eyebrow:'Modele platformy', title:'Konsola modeli i dostawców',
    intro:'Rejestruj modele kupującego, szyfruj dane dostępowe, certyfikuj rzeczywiste możliwości oraz zarządzaj przypisaniem i rollbackiem dla COS, Buildera i specjalistów.',
    loading:'Ładowanie modeli…', unavailable:'Konsola modeli jest niedostępna',
    strict:'Ścisłe routowanie zarejestrowanych modeli', enabled:'Włączone', disabled:'Tryb zgodności migracyjnej',
    registration:'Źródło rejestracji', durable:'Trwały rejestr niezależny od hosta',
    registerTitle:'Zarejestruj lub zaktualizuj model', registerNote:'Dane dostępowe są szyfrowane po stronie serwera i nigdy nie wracają do przeglądarki. Rotacja usuwa poprzedni szyfrogram.',
    key:'Klucz profilu', family:'Rodzina', model:'ID modelu', providerModel:'ID modelu dostawcy', revisionPolicy:'Polityka rewizji', revision:'Rewizja', tokenizer:'ID tokenizera',
    uses:'Dozwolone role', transport:'Transport', provider:'Dostawca', endpoint:'Endpoint HTTPS', credential:'Dane dostępowe dostawcy', cost:'Maksymalny koszt wywołania (USD)', timeout:'Limit czasu (ms)',
    json:'Strukturalny JSON', tools:'Wywołania narzędzi', streaming:'Streaming', save:'Zapisz rejestrację', saving:'Zapisywanie…',
    inventory:'Inwentarz modeli', adapter:'Adapter', available:'dostępny', hostRequired:'wymagany plug-in hosta',
    cert:'Certyfikacja', none:'Brak certyfikatu', certify:'Uruchom certyfikację', certifying:'Certyfikowanie…',
    spend:'Certyfikacja wykonuje ograniczone rzeczywiste wywołania i może naliczyć opłaty.',
    checks:'Kontrole', partial:'Niezweryfikowane zadeklarowane możliwości',
    assignments:'Przypisania produkcyjne', assign:'Przypisz', assigning:'Przypisywanie…', rollback:'Rollback', release:'Użyj domyślnego routingu', disabling:'Wyłączanie…', disable:'Wyłącz rejestrację',
    current:'Aktualne', noAssignment:'Brak trwałego przypisania', history:'Ostatnia historia',
    confirmRegister:'Zapisać tę rejestrację i zaszyfrowane dane dostępowe?',
    confirmCert:'Uruchomić certyfikację na żywo? Może naliczyć ograniczone opłaty.',
    confirmAssign:'Aktywować ten certyfikowany model dla tej roli? Nie będzie cichego fallbacku do innego modelu.',
    confirmRollback:'Przywrócić poprzednie przypisanie modelu dla tej roli?',
    confirmRelease:'Zwolnić to przypisanie i przywrócić domyślny routing platformy dla tej roli?',
    confirmDisable:'Wyłączyć rejestrację? Najpierw trzeba wycofać aktywne przypisania.',
    saved:'Rejestracja zapisana.', assigned:'Przypisanie zmienione.', rolledBack:'Rollback zakończony.', released:'Przypisanie zwolnione do domyślnego routingu platformy.', disabledModel:'Rejestracja wyłączona.',
  },
  ru: {
    eyebrow:'Модели платформы', title:'Консоль моделей и провайдеров',
    intro:'Регистрируйте модели покупателя, шифруйте учетные данные, сертифицируйте реальные возможности и управляйте назначением/откатом для COS, Builder и специалистов.',
    loading:'Загрузка моделей…', unavailable:'Консоль моделей недоступна',
    strict:'Строгая маршрутизация зарегистрированных моделей', enabled:'Включена', disabled:'Режим совместимости миграции',
    registration:'Источник регистрации', durable:'Долговременный реестр, независимый от хоста',
    registerTitle:'Зарегистрировать или обновить модель', registerNote:'Учетные данные шифруются на сервере и никогда не возвращаются в браузер. При ротации старый шифротекст удаляется.',
    key:'Ключ профиля', family:'Семейство', model:'ID модели', providerModel:'ID модели у провайдера', revisionPolicy:'Политика ревизии', revision:'Ревизия', tokenizer:'ID токенизатора',
    uses:'Разрешенные роли', transport:'Транспорт', provider:'Провайдер', endpoint:'HTTPS endpoint', credential:'Учетные данные провайдера', cost:'Максимальная стоимость вызова (USD)', timeout:'Таймаут (мс)',
    json:'Структурированный JSON', tools:'Вызов инструментов', streaming:'Streaming', save:'Сохранить регистрацию', saving:'Сохранение…',
    inventory:'Реестр моделей', adapter:'Адаптер', available:'доступен', hostRequired:'нужен plug-in хоста',
    cert:'Сертификация', none:'Нет сертификата', certify:'Запустить сертификацию', certifying:'Сертификация…',
    spend:'Сертификация выполняет ограниченные реальные вызовы и может быть платной.',
    checks:'Проверки', partial:'Непроверенные заявленные возможности',
    assignments:'Назначения Production', assign:'Назначить', assigning:'Назначение…', rollback:'Откат', release:'Маршрут платформы', disabling:'Отключение…', disable:'Отключить регистрацию',
    current:'Текущее', noAssignment:'Нет долговременного назначения', history:'Недавняя история',
    confirmRegister:'Сохранить регистрацию и зашифрованные учетные данные?',
    confirmCert:'Запустить живую сертификацию? Возможны ограниченные расходы.',
    confirmAssign:'Активировать эту сертифицированную модель для роли? Скрытого fallback на другую модель не будет.',
    confirmRollback:'Откатить роль к предыдущему назначению модели?',
    confirmRelease:'Освободить это назначение и вернуть роль к маршрутизации платформы по умолчанию?',
    confirmDisable:'Отключить регистрацию? Активное назначение сначала нужно откатить.',
    saved:'Регистрация сохранена.', assigned:'Назначение изменено.', rolledBack:'Откат выполнен.', released:'Назначение освобождено; используется маршрутизация платформы по умолчанию.', disabledModel:'Регистрация отключена.',
  },
  de: {
    eyebrow:'Plattformmodelle', title:'Modell- & Anbieterkonsole',
    intro:'Registrieren Sie Käufermodelle, halten Sie Zugangsdaten verschlüsselt, zertifizieren Sie tatsächliche Fähigkeiten und steuern Sie Zuweisung oder Rollback für COS, Builder und Spezialisten.',
    loading:'Modellbestand wird geladen…', unavailable:'Modellkonsole nicht verfügbar',
    strict:'Striktes Routing registrierter Modelle', enabled:'Aktiviert', disabled:'Migrationskompatibilitätsmodus',
    registration:'Registrierungsquelle', durable:'Dauerhaftes, hostneutrales Register',
    registerTitle:'Käufermodell registrieren oder aktualisieren', registerNote:'Zugangsdaten werden serverseitig verschlüsselt und nie an diesen Browser zurückgegeben. Beim Aktualisieren werden Zugangsdaten rotiert und der ersetzte Chiffretext gelöscht.',
    key:'Profilschlüssel', family:'Familie', model:'Modell-ID', providerModel:'Modell-ID des Anbieters', revisionPolicy:'Revisionsrichtlinie', revision:'Revision', tokenizer:'Tokenizer-ID',
    uses:'Zulässige Verwendungen', transport:'Transport', provider:'Anbieterbezeichnung', endpoint:'HTTPS-Endpunkt', credential:'Anbieter-Zugangsdaten', cost:'Maximale Anbieterkosten pro Aufruf (USD)', timeout:'Zeitlimit (ms)',
    json:'Strukturiertes JSON', tools:'Tool-Aufrufe', streaming:'Streaming', save:'Registrierung speichern', saving:'Wird gespeichert…',
    inventory:'Bestand registrierter Modelle', adapter:'Adapter', available:'verfügbar', hostRequired:'Host-Plug-in erforderlich',
    cert:'Zertifizierung', none:'Kein Zertifizierungsnachweis', certify:'Live-Zertifizierung ausführen', certifying:'Wird zertifiziert…',
    spend:'Die Zertifizierung führt begrenzte Live-Anbieteraufrufe durch und kann Kosten verursachen.',
    checks:'Prüfungen', partial:'Nicht verifizierte deklarierte Fähigkeiten',
    assignments:'Produktionszuweisungen', assign:'Zuweisen', assigning:'Wird zugewiesen…', rollback:'Rollback', release:'Plattformstandard verwenden', disabling:'Wird deaktiviert…', disable:'Registrierung deaktivieren',
    current:'Aktuell', noAssignment:'Keine dauerhafte Zuweisung', history:'Letzter Zuweisungsverlauf',
    confirmRegister:'Diese Modellregistrierung und die verschlüsselte Zugangsdatenkonfiguration speichern?',
    confirmCert:'Live-Zertifizierung ausführen? Dabei können begrenzte Anbieterkosten entstehen.',
    confirmAssign:'Genau dieses zertifizierte Modell für diese Plattformrolle aktivieren? Das modellübergreifende Fallback bleibt deaktiviert.',
    confirmRollback:'Diese Rolle auf die zuvor erfasste Modellzuweisung zurücksetzen?',
    confirmRelease:'Diese Zuweisung freigeben und die Rolle auf das Standard-Routing der Plattform zurücksetzen?',
    confirmDisable:'Diese Modellregistrierung deaktivieren? Aktive Zuweisungen müssen zuerst zurückgesetzt werden.',
    saved:'Modellregistrierung gespeichert.', assigned:'Modellzuweisung geändert.', rolledBack:'Modellzuweisung zurückgesetzt.', released:'Zuweisung an das Standard-Routing der Plattform freigegeben.', disabledModel:'Modellregistrierung deaktiviert.',
  },
  fr: {
    eyebrow:'Modèles de la plateforme', title:'Console des modèles et fournisseurs',
    intro:'Enregistrez les modèles de l’acheteur, conservez les identifiants chiffrés, certifiez les capacités réelles et gouvernez l’attribution ou le retour arrière pour COS, le Constructeur et les spécialistes.',
    loading:'Chargement de l’inventaire des modèles…', unavailable:'Console des modèles indisponible',
    strict:'Routage strict des modèles enregistrés', enabled:'Activé', disabled:'Mode de compatibilité de migration',
    registration:'Source de l’enregistrement', durable:'Registre durable et indépendant de l’hôte',
    registerTitle:'Enregistrer ou mettre à jour un modèle acheteur', registerNote:'Les identifiants sont chiffrés côté serveur et ne sont jamais renvoyés à ce navigateur. La mise à jour d’un identifiant le renouvelle et supprime le texte chiffré remplacé.',
    key:'Clé de profil', family:'Famille', model:'ID du modèle', providerModel:'ID du modèle chez le fournisseur', revisionPolicy:'Politique de révision', revision:'Révision', tokenizer:'ID du tokeniseur',
    uses:'Utilisations autorisées', transport:'Transport', provider:'Libellé du fournisseur', endpoint:'Point de terminaison HTTPS', credential:'Identifiant du fournisseur', cost:'Coût fournisseur maximal par appel (USD)', timeout:'Délai d’expiration (ms)',
    json:'JSON structuré', tools:'Appel d’outils', streaming:'Streaming', save:'Enregistrer l’inscription', saving:'Enregistrement…',
    inventory:'Inventaire des modèles enregistrés', adapter:'Adaptateur', available:'disponible', hostRequired:'plug-in hôte requis',
    cert:'Certification', none:'Aucun reçu de certification', certify:'Lancer la certification en direct', certifying:'Certification…',
    spend:'La certification effectue des appels réels limités au fournisseur et peut entraîner des frais.',
    checks:'Contrôles', partial:'Capacités déclarées non vérifiées',
    assignments:'Attributions de production', assign:'Attribuer', assigning:'Attribution…', rollback:'Restaurer', release:'Utiliser la valeur par défaut de la plateforme', disabling:'Désactivation…', disable:'Désactiver l’enregistrement',
    current:'Actuel', noAssignment:'Aucune attribution durable', history:'Historique récent des attributions',
    confirmRegister:'Enregistrer cet enregistrement de modèle et la configuration chiffrée de l’identifiant ?',
    confirmCert:'Lancer la certification en direct ? Des frais limités du fournisseur peuvent s’appliquer.',
    confirmAssign:'Activer ce modèle certifié précis pour ce rôle de la plateforme ? Le repli vers un autre modèle restera désactivé.',
    confirmRollback:'Rétablir ce rôle sur son attribution de modèle précédente ?',
    confirmRelease:'Libérer cette attribution et rendre le rôle au routage par défaut de la plateforme ?',
    confirmDisable:'Désactiver cet enregistrement de modèle ? Les attributions actives doivent d’abord être annulées.',
    saved:'Enregistrement du modèle sauvegardé.', assigned:'Attribution du modèle modifiée.', rolledBack:'Attribution du modèle restaurée.', released:'Attribution rendue au routage par défaut de la plateforme.', disabledModel:'Enregistrement du modèle désactivé.',
  },
  it: {
    eyebrow:'Modelli della piattaforma', title:'Console modelli e provider',
    intro:'Registra i modelli dell’acquirente, mantieni le credenziali cifrate, certifica le capacità reali e gestisci assegnazione o rollback per COS, Builder e specialisti.',
    loading:'Caricamento dell’inventario modelli…', unavailable:'Console modelli non disponibile',
    strict:'Routing rigoroso dei modelli registrati', enabled:'Abilitato', disabled:'Modalità di compatibilità migrazione',
    registration:'Origine della registrazione', durable:'Registro persistente e neutrale rispetto all’host',
    registerTitle:'Registra o aggiorna un modello dell’acquirente', registerNote:'Le credenziali sono cifrate lato server e non vengono mai restituite a questo browser. L’aggiornamento di una credenziale la ruota ed elimina il testo cifrato sostituito.',
    key:'Chiave del profilo', family:'Famiglia', model:'ID modello', providerModel:'ID modello del provider', revisionPolicy:'Criterio di revisione', revision:'Revisione', tokenizer:'ID tokenizer',
    uses:'Usi consentiti', transport:'Trasporto', provider:'Etichetta del provider', endpoint:'Endpoint HTTPS', credential:'Credenziale del provider', cost:'Costo massimo del provider per chiamata (USD)', timeout:'Timeout (ms)',
    json:'JSON strutturato', tools:'Chiamata di strumenti', streaming:'Streaming', save:'Salva registrazione', saving:'Salvataggio…',
    inventory:'Inventario dei modelli registrati', adapter:'Adattatore', available:'disponibile', hostRequired:'plug-in host richiesto',
    cert:'Certificazione', none:'Nessuna ricevuta di certificazione', certify:'Esegui certificazione live', certifying:'Certificazione in corso…',
    spend:'La certificazione esegue chiamate live limitate al provider e può comportare costi.',
    checks:'Verifiche', partial:'Capacità dichiarate non verificate',
    assignments:'Assegnazioni di produzione', assign:'Assegna', assigning:'Assegnazione in corso…', rollback:'Ripristina', release:'Usa il predefinito della piattaforma', disabling:'Disattivazione in corso…', disable:'Disattiva registrazione',
    current:'Attuale', noAssignment:'Nessuna assegnazione persistente', history:'Cronologia recente delle assegnazioni',
    confirmRegister:'Salvare questa registrazione del modello e la configurazione cifrata delle credenziali?',
    confirmCert:'Eseguire la certificazione live? Può comportare costi limitati del provider.',
    confirmAssign:'Attivare esattamente questo modello certificato per questo ruolo della piattaforma? Il fallback verso altri modelli resterà disattivato.',
    confirmRollback:'Ripristinare questo ruolo all’assegnazione del modello precedente?',
    confirmRelease:'Rilasciare questa assegnazione e riportare il ruolo al routing predefinito della piattaforma?',
    confirmDisable:'Disattivare questa registrazione del modello? Le assegnazioni attive devono prima essere ripristinate.',
    saved:'Registrazione del modello salvata.', assigned:'Assegnazione del modello modificata.', rolledBack:'Assegnazione del modello ripristinata.', released:'Assegnazione rilasciata al routing predefinito della piattaforma.', disabledModel:'Registrazione del modello disattivata.',
  },
  ja: {
    eyebrow:'プラットフォームモデル', title:'モデル & プロバイダーコンソール',
    intro:'購入者のモデルを登録し、認証情報を暗号化したまま保持し、実際の機能を認定して、COS、Builder、スペシャリストへの割り当てやロールバックを管理します。',
    loading:'モデル一覧を読み込み中…', unavailable:'モデルコンソールを利用できません',
    strict:'登録済みモデルの厳格なルーティング', enabled:'有効', disabled:'移行互換モード',
    registration:'登録元', durable:'永続的でホスト非依存のレジストリ',
    registerTitle:'購入者モデルを登録または更新', registerNote:'認証情報はサーバー側で暗号化され、このブラウザーに返されることはありません。認証情報を更新するとローテーションされ、置き換えられた暗号文は削除されます。',
    key:'プロファイルキー', family:'ファミリー', model:'モデル ID', providerModel:'プロバイダーのモデル ID', revisionPolicy:'リビジョンポリシー', revision:'リビジョン', tokenizer:'トークナイザー ID',
    uses:'許可された用途', transport:'トランスポート', provider:'プロバイダー名', endpoint:'HTTPS エンドポイント', credential:'プロバイダーの認証情報', cost:'1 回の呼び出しあたりの最大プロバイダー費用（USD）', timeout:'タイムアウト（ms）',
    json:'構造化 JSON', tools:'ツール呼び出し', streaming:'Streaming', save:'登録を保存', saving:'保存中…',
    inventory:'登録済みモデル一覧', adapter:'アダプター', available:'利用可能', hostRequired:'ホストプラグインが必要',
    cert:'認定', none:'認定レシートなし', certify:'ライブ認定を実行', certifying:'認定中…',
    spend:'認定ではプロバイダーへの実際の呼び出しを限定的に行うため、料金が発生する場合があります。',
    checks:'チェック', partial:'未検証の申告機能',
    assignments:'本番環境の割り当て', assign:'割り当て', assigning:'割り当て中…', rollback:'ロールバック', release:'プラットフォームの既定を使用', disabling:'無効化中…', disable:'登録を無効化',
    current:'現在', noAssignment:'永続的な割り当てなし', history:'最近の割り当て履歴',
    confirmRegister:'このモデル登録と暗号化された認証情報の設定を保存しますか？',
    confirmCert:'ライブ認定を実行しますか？限定的なプロバイダー料金が発生する場合があります。',
    confirmAssign:'このプラットフォームロールに、この認定済みモデルを有効化しますか？モデル間のフォールバックは無効のままです。',
    confirmRollback:'このロールを以前に記録されたモデル割り当てにロールバックしますか？',
    confirmRelease:'この割り当てを解除し、ロールをプラットフォームの既定ルーティングに戻しますか？',
    confirmDisable:'このモデル登録を無効化しますか？先に有効な割り当てをロールバックする必要があります。',
    saved:'モデル登録を保存しました。', assigned:'モデルの割り当てを変更しました。', rolledBack:'モデルの割り当てをロールバックしました。', released:'割り当てを解除し、プラットフォームの既定ルーティングに戻しました。', disabledModel:'モデル登録を無効化しました。',
  },
  ko: {
    eyebrow:'플랫폼 모델', title:'모델 및 공급자 콘솔',
    intro:'구매자 모델을 등록하고 자격 증명을 암호화된 상태로 유지하며 실제 기능을 인증하고 COS, Builder, 전문가에 대한 할당 또는 롤백을 관리합니다.',
    loading:'모델 인벤토리 불러오는 중…', unavailable:'모델 콘솔을 사용할 수 없음',
    strict:'등록된 모델 엄격 라우팅', enabled:'사용', disabled:'마이그레이션 호환 모드',
    registration:'등록 출처', durable:'영구적이고 호스트 중립적인 레지스트리',
    registerTitle:'구매자 모델 등록 또는 업데이트', registerNote:'자격 증명은 서버 측에서 암호화되며 이 브라우저로 반환되지 않습니다. 자격 증명을 업데이트하면 교체되고 이전 암호문은 삭제됩니다.',
    key:'프로필 키', family:'제품군', model:'모델 ID', providerModel:'공급자 모델 ID', revisionPolicy:'리비전 정책', revision:'리비전', tokenizer:'토크나이저 ID',
    uses:'허용된 용도', transport:'전송', provider:'공급자 레이블', endpoint:'HTTPS 엔드포인트', credential:'공급자 자격 증명', cost:'호출당 최대 공급자 비용(USD)', timeout:'시간 제한(ms)',
    json:'구조화된 JSON', tools:'도구 호출', streaming:'Streaming', save:'등록 저장', saving:'저장 중…',
    inventory:'등록된 모델 인벤토리', adapter:'어댑터', available:'사용 가능', hostRequired:'호스트 플러그인 필요',
    cert:'인증', none:'인증 영수증 없음', certify:'라이브 인증 실행', certifying:'인증 중…',
    spend:'인증 과정에서 제한된 실제 공급자 호출이 이루어지며 요금이 발생할 수 있습니다.',
    checks:'점검', partial:'검증되지 않은 선언 기능',
    assignments:'프로덕션 할당', assign:'할당', assigning:'할당 중…', rollback:'롤백', release:'플랫폼 기본값 사용', disabling:'비활성화 중…', disable:'등록 비활성화',
    current:'현재', noAssignment:'영구 할당 없음', history:'최근 할당 기록',
    confirmRegister:'이 모델 등록과 암호화된 자격 증명 구성을 저장하시겠습니까?',
    confirmCert:'라이브 인증을 실행하시겠습니까? 제한된 공급자 요금이 발생할 수 있습니다.',
    confirmAssign:'이 플랫폼 역할에 이 인증된 모델을 활성화하시겠습니까? 다른 모델로의 대체는 계속 비활성화됩니다.',
    confirmRollback:'이 역할을 이전에 기록된 모델 할당으로 롤백하시겠습니까?',
    confirmRelease:'이 할당을 해제하고 역할을 플랫폼 기본 라우팅으로 되돌리시겠습니까?',
    confirmDisable:'이 모델 등록을 비활성화하시겠습니까? 먼저 활성 할당을 롤백해야 합니다.',
    saved:'모델 등록이 저장되었습니다.', assigned:'모델 할당이 변경되었습니다.', rolledBack:'모델 할당이 롤백되었습니다.', released:'할당이 해제되어 플랫폼 기본 라우팅으로 전환되었습니다.', disabledModel:'모델 등록이 비활성화되었습니다.',
  },
  ar: {
    eyebrow:'نماذج المنصة', title:'وحدة تحكم النماذج والمزوّدين',
    intro:'سجّل نماذج المشتري، واحفظ بيانات الاعتماد مشفّرة، واعتمد القدرات الفعلية، وتحكّم في التعيين أو التراجع لـ COS والمُنشئ والمتخصصين.',
    loading:'جارٍ تحميل قائمة النماذج…', unavailable:'وحدة تحكم النماذج غير متاحة',
    strict:'توجيه صارم للنماذج المسجّلة', enabled:'مُفعّل', disabled:'وضع توافق الترحيل',
    registration:'مصدر التسجيل', durable:'سجلّ دائم ومحايد تجاه المضيف',
    registerTitle:'تسجيل نموذج المشتري أو تحديثه', registerNote:'تُشفَّر بيانات الاعتماد على الخادم ولا تُعاد أبدًا إلى هذا المتصفح. يؤدي تحديث بيانات الاعتماد إلى تدويرها وحذف النص المشفّر السابق.',
    key:'مفتاح الملف الشخصي', family:'العائلة', model:'معرّف النموذج', providerModel:'معرّف النموذج لدى المزوّد', revisionPolicy:'سياسة المراجعة', revision:'المراجعة', tokenizer:'معرّف المُرمِّز',
    uses:'الاستخدامات المسموح بها', transport:'النقل', provider:'تسمية المزوّد', endpoint:'نقطة نهاية HTTPS', credential:'بيانات اعتماد المزوّد', cost:'الحد الأقصى لتكلفة المزوّد لكل استدعاء (USD)', timeout:'المهلة (ms)',
    json:'JSON منظم', tools:'استدعاء الأدوات', streaming:'Streaming', save:'حفظ التسجيل', saving:'جارٍ الحفظ…',
    inventory:'قائمة النماذج المسجّلة', adapter:'المحوّل', available:'متاح', hostRequired:'يلزم مكوّن إضافي من المضيف',
    cert:'الاعتماد', none:'لا يوجد إيصال اعتماد', certify:'تشغيل الاعتماد المباشر', certifying:'جارٍ الاعتماد…',
    spend:'يُجري الاعتماد استدعاءات فعلية محدودة للمزوّد وقد تترتب عليه رسوم.',
    checks:'الفحوصات', partial:'قدرات مُعلنة غير متحقق منها',
    assignments:'تعيينات الإنتاج', assign:'تعيين', assigning:'جارٍ التعيين…', rollback:'تراجع', release:'استخدام الإعداد الافتراضي للمنصة', disabling:'جارٍ التعطيل…', disable:'تعطيل التسجيل',
    current:'الحالي', noAssignment:'لا يوجد تعيين دائم', history:'سجل التعيينات الأخير',
    confirmRegister:'هل تريد حفظ تسجيل هذا النموذج وإعدادات بيانات الاعتماد المشفّرة؟',
    confirmCert:'هل تريد تشغيل الاعتماد المباشر؟ قد تترتب على ذلك رسوم محدودة من المزوّد.',
    confirmAssign:'هل تريد تفعيل هذا النموذج المعتمد بعينه لهذا الدور في المنصة؟ سيظل الرجوع إلى نموذج آخر معطّلًا.',
    confirmRollback:'هل تريد إرجاع هذا الدور إلى تعيين النموذج المسجّل سابقًا؟',
    confirmRelease:'هل تريد تحرير هذا التعيين وإعادة الدور إلى التوجيه الافتراضي للمنصة؟',
    confirmDisable:'هل تريد تعطيل تسجيل هذا النموذج؟ يجب التراجع عن التعيينات النشطة أولًا.',
    saved:'تم حفظ تسجيل النموذج.', assigned:'تم تغيير تعيين النموذج.', rolledBack:'تم التراجع عن تعيين النموذج.', released:'تم تحرير التعيين إلى التوجيه الافتراضي للمنصة.', disabledModel:'تم تعطيل تسجيل النموذج.',
  },
}

const protocols = ['openai_compatible','anthropic_messages','google_generate_content','native_sdk','local_runtime','custom_http'] as const
const uses = ['cos_reasoner','builder','specialist'] as const

function localeOf(value: string): Locale {
  const code = value.toLowerCase().split('-')[0]
  return code === 'es' || code === 'pt' || code === 'pl' || code === 'ru' || code === 'de' || code === 'fr' || code === 'it' || code === 'ja' || code === 'ko' || code === 'ar' ? code : 'en'
}
function statusLabel(status?: string) { return status || '—' }
function panelStyle(): React.CSSProperties { return { border:'1px solid #334155', borderRadius:14, padding:20, background:'rgba(15,23,42,.65)' } }
function inputStyle(): React.CSSProperties { return { width:'100%', padding:'9px 10px', borderRadius:8, border:'1px solid #475569', background:'#0f172a', color:'#f8fafc' } }

export default function ModelConsole() {
  const { lang } = useI18n()
  const text = useMemo(() => COPY[localeOf(lang)], [lang])
  const [data, setData] = useState<Inventory | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [running, setRunning] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string,string>>({})
  const [form, setForm] = useState({
    key:'', family:'', modelId:'', providerModelId:'', revisionPolicy:'runtime_owned', revision:'', tokenizerModelId:'',
    protocol:'openai_compatible', provider:'buyer', endpoint:'', credential:'', maxCallCostUsd:'0.10', timeoutMs:'120000',
    structuredJson:true, toolCalling:true, streaming:false,
    cos_reasoner:true, builder:true, specialist:true,
  })

  async function load() {
    setError('')
    const response = await fetch('/api/admin/models', { cache:'no-store' })
    const body = await response.json() as Inventory
    if (!response.ok) throw new Error(body.error || 'model_inventory_load_failed')
    setData(body)
    setSelected(current => {
      const next = { ...current }
      for (const group of body.assignments || []) if (!next[group.use] && group.current?.profileKey) next[group.use] = group.current.profileKey
      return next
    })
  }
  useEffect(() => { load().catch(reason => setError(reason instanceof Error ? reason.message : String(reason))) }, [])

  async function mutate(payload: Record<string,unknown>, key: string, success: string, allow422 = false) {
    setRunning(key); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/models', {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok && !(allow422 && response.status === 422)) throw new Error(body.error || 'platform_model_action_failed')
      setNotice(success)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setRunning(null) }
  }

  async function register(event: FormEvent) {
    event.preventDefault()
    if (!window.confirm(text.confirmRegister)) return
    const selectedUses = uses.filter(use => form[use])
    await mutate({
      action:'register', confirmMutation:true,
      profile:{
        key:form.key, family:form.family, modelId:form.modelId,
        providerModelId:form.providerModelId || form.modelId,
        revisionPolicy:form.revisionPolicy, revision:form.revision || null,
        tokenizerModelId:form.tokenizerModelId || null,
        uses:selectedUses, transportProtocols:[form.protocol],
        inference:{
          chatCompletion:'validated',
          streaming:form.streaming ? 'validated' : 'not_validated',
          toolCalling:form.toolCalling ? 'validated' : 'not_validated',
          structuredJson:form.structuredJson ? 'validated' : 'not_validated',
        },
        training:{},
      },
      transport:{
        protocol:form.protocol, provider:form.provider, endpoint:form.endpoint || null,
        timeoutMs:Number(form.timeoutMs), maxCallCostUsd:Number(form.maxCallCostUsd),
      },
      credential:form.credential || null, credentialName:'apiKey',
    }, 'register', text.saved)
    setForm(current => ({ ...current, credential:'' }))
  }

  async function certify(profileKey: string) {
    if (!window.confirm(text.confirmCert)) return
    await mutate({ action:'certify', profileKey, confirmSpend:true }, `cert:${profileKey}`, '', true)
  }

  async function assign(group: AssignmentGroup) {
    const profileKey = selected[group.use] || ''
    if (!profileKey || !window.confirm(text.confirmAssign)) return
    await mutate({
      action:'assign', use:group.use, profileKey,
      expectedCurrentAssignmentId:group.current?.assignmentId ?? null,
      confirmActivation:true,
    }, `assign:${group.use}`, text.assigned)
  }

  async function rollback(group: AssignmentGroup) {
    if (!group.current || !window.confirm(text.confirmRollback)) return
    await mutate({
      action:'rollback', use:group.use,
      expectedCurrentAssignmentId:group.current.assignmentId,
      confirmRollback:true,
    }, `rollback:${group.use}`, text.rolledBack)
  }

  async function release(group: AssignmentGroup) {
    if (!group.current || !window.confirm(text.confirmRelease)) return
    await mutate({
      action:'release', use:group.use,
      expectedCurrentAssignmentId:group.current.assignmentId,
      confirmRelease:true,
    }, `release:${group.use}`, text.released)
  }

  async function disable(profileKey: string) {
    if (!window.confirm(text.confirmDisable)) return
    await mutate({ action:'disable', profileKey, confirmMutation:true }, `disable:${profileKey}`, text.disabledModel)
  }

  return <main style={{ maxWidth:1180, margin:'0 auto', padding:'32px 20px', color:'#f8fafc' }}>
    <header style={{ marginBottom:24 }}>
      <p style={{ fontSize:12, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', color:'#67e8f9' }}>{text.eyebrow}</p>
      <h1 style={{ margin:'8px 0' }}>{text.title}</h1>
      <p style={{ maxWidth:900, color:'#cbd5e1' }}>{text.intro}</p>
    </header>

    {error ? <section role="alert" style={{ border:'1px solid #fb7185', borderRadius:12, padding:16, marginBottom:16 }}><strong>{text.unavailable}</strong><p>{error}</p></section> : null}
    {notice ? <section role="status" style={{ border:'1px solid #4ade80', borderRadius:12, padding:12, marginBottom:16 }}>{notice}</section> : null}
    {!data && !error ? <p>{text.loading}</p> : null}

    {data ? <>
      <section style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12, marginBottom:20 }}>
        <div style={panelStyle()}><strong>{text.strict}</strong><p>{data.registryStrictMode ? text.enabled : text.disabled}</p></div>
        <div style={panelStyle()}><strong>{text.registration}</strong><p>{text.durable}</p></div>
      </section>

      <form onSubmit={register} style={{ ...panelStyle(), marginBottom:24 }}>
        <h2 style={{ marginTop:0 }}>{text.registerTitle}</h2>
        <p style={{ color:'#94a3b8' }}>{text.registerNote}</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))', gap:12 }}>
          <label>{text.key}<input required value={form.key} onChange={e=>setForm(v=>({...v,key:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.family}<input required value={form.family} onChange={e=>setForm(v=>({...v,family:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.model}<input required value={form.modelId} onChange={e=>setForm(v=>({...v,modelId:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.providerModel}<input value={form.providerModelId} onChange={e=>setForm(v=>({...v,providerModelId:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.revisionPolicy}<select value={form.revisionPolicy} onChange={e=>setForm(v=>({...v,revisionPolicy:e.target.value}))} style={inputStyle()}>
            <option value="runtime_owned">{uiText('generatedUi.u_b8925443a580caf2')}</option><option value="fixed">{uiText('generatedUi.u_992a93455c71fedd')}</option><option value="resolve_and_pin_at_dispatch">{uiText('generatedUi.u_e6141342004e6f27')}</option>
          </select></label>
          <label>{text.revision}<input value={form.revision} onChange={e=>setForm(v=>({...v,revision:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.tokenizer}<input value={form.tokenizerModelId} onChange={e=>setForm(v=>({...v,tokenizerModelId:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.transport}<select value={form.protocol} onChange={e=>setForm(v=>({...v,protocol:e.target.value}))} style={inputStyle()}>{protocols.map(p=><option key={p}>{p}</option>)}</select></label>
          <label>{text.provider}<input required value={form.provider} onChange={e=>setForm(v=>({...v,provider:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.endpoint}<input type="url" value={form.endpoint} onChange={e=>setForm(v=>({...v,endpoint:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.credential}<input type="password" autoComplete="new-password" value={form.credential} onChange={e=>setForm(v=>({...v,credential:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.cost}<input required type="number" min="0" max="10000" step="0.000001" value={form.maxCallCostUsd} onChange={e=>setForm(v=>({...v,maxCallCostUsd:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.timeout}<input required type="number" min="1000" max="300000" value={form.timeoutMs} onChange={e=>setForm(v=>({...v,timeoutMs:e.target.value}))} style={inputStyle()} /></label>
        </div>
        <fieldset style={{ marginTop:16, border:'1px solid #334155', borderRadius:10 }}>
          <legend>{text.uses}</legend>
          {uses.map(use=><label key={use} style={{ marginRight:18 }}><input type="checkbox" checked={form[use]} onChange={e=>setForm(v=>({...v,[use]:e.target.checked}))} /> {use}</label>)}
        </fieldset>
        <fieldset style={{ marginTop:12, border:'1px solid #334155', borderRadius:10 }}>
          <legend>{uiText('generatedUi.u_9460f16ac9b5171e')}</legend>
          <label style={{ marginRight:18 }}><input type="checkbox" checked={form.structuredJson} onChange={e=>setForm(v=>({...v,structuredJson:e.target.checked}))} /> {text.json}</label>
          <label style={{ marginRight:18 }}><input type="checkbox" checked={form.toolCalling} onChange={e=>setForm(v=>({...v,toolCalling:e.target.checked}))} /> {text.tools}</label>
          <label><input type="checkbox" checked={form.streaming} onChange={e=>setForm(v=>({...v,streaming:e.target.checked}))} /> {text.streaming}</label>
        </fieldset>
        <button disabled={running==='register'} type="submit" style={{ marginTop:16, padding:'10px 16px' }}>{running==='register' ? text.saving : text.save}</button>
      </form>

      <section style={{ ...panelStyle(), marginBottom:24 }}>
        <h2 style={{ marginTop:0 }}>{text.assignments}</h2>
        <div style={{ display:'grid', gap:14 }}>
          {data.assignments.map(group => {
            const choices = data.profiles.filter(p => p.durableRegistration && p.uses.includes(group.use) && p.latestCertification && p.latestCertification.status !== 'failed')
            return <div key={group.use} style={{ borderTop:'1px solid #334155', paddingTop:12 }}>
              <strong>{group.use}</strong>
              <p>{text.current}: {group.current ? `${group.current.profileKey} · ${group.current.assignmentId}` : text.noAssignment}</p>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <select value={selected[group.use] || ''} onChange={e=>setSelected(v=>({...v,[group.use]:e.target.value}))} style={{ ...inputStyle(), width:320 }}>
                  <option value="">—</option>{choices.map(p=><option key={p.key} value={p.key}>{p.key}</option>)}
                </select>
                <button disabled={running===`assign:${group.use}`} onClick={()=>assign(group)} type="button">{running===`assign:${group.use}` ? text.assigning : text.assign}</button>
                <button disabled={!group.current?.previousAssignmentId || running===`rollback:${group.use}`} onClick={()=>rollback(group)} type="button">{text.rollback}</button>
                <button disabled={!group.current || running===`release:${group.use}`} onClick={()=>release(group)} type="button">{text.release}</button>
              </div>
              {group.history.length ? <details style={{ marginTop:8 }}><summary>{text.history}</summary><ul>{group.history.map(item=><li key={item.assignmentId}>{item.createdAt} · {item.status} · {item.profileKey}</li>)}</ul></details> : null}
            </div>
          })}
        </div>
      </section>

      <h2>{text.inventory}</h2>
      <section style={{ display:'grid', gap:18 }}>
        {data.profiles.map(profile => {
          const cert = profile.latestCertification
          const active = data.assignments.some(group => group.current?.profileKey === profile.key)
          return <article key={profile.key} style={panelStyle()}>
            <div style={{ display:'flex', gap:16, justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap' }}>
              <div><h3 style={{ margin:0 }}>{profile.key}</h3><p>{profile.modelId} · {profile.family}</p></div>
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" disabled={!profile.certifiable || running===`cert:${profile.key}`} onClick={()=>certify(profile.key)}>{running===`cert:${profile.key}` ? text.certifying : text.certify}</button>
                {profile.durableRegistration ? <button type="button" disabled={active || running===`disable:${profile.key}`} onClick={()=>disable(profile.key)}>{text.disable}</button> : null}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10 }}>
              <div><strong>{text.uses}</strong><p>{profile.uses.join(', ')}</p></div>
              <div><strong>{text.transport}</strong><p>{profile.binding ? `${profile.binding.provider} · ${profile.binding.protocol}` : '—'}</p></div>
              <div><strong>{text.credential}</strong><p>{profile.binding ? (profile.binding.credentialConfigured ? text.enabled : text.disabled) : '—'}</p></div>
              <div><strong>{text.adapter}</strong><p>{profile.builtInAdapterAvailable ? text.available : text.hostRequired}</p></div>
              <div><strong>{text.cost}</strong><p>{profile.binding ? `$${profile.binding.maxCallCostUsd}` : '—'}</p></div>
              <div><strong>{text.cert}</strong><p>{cert ? statusLabel(cert.status) : text.none}</p></div>
            </div>
            <details><summary>{uiText('generatedUi.u_9460f16ac9b5171e')}</summary><ul>{Object.entries(profile.inference).map(([name,state])=><li key={name}>{name}: {state}</li>)}</ul></details>
            {cert ? <div style={{ marginTop:12 }}>
              <strong>{text.checks}</strong>
              <ul>{(cert.checks || []).map(item=><li key={item.id}>{item.id}: {item.status} · {item.latencyMs} {uiText('generatedUi.u_f785c3ce1d580c8f')}{item.errorCode ? ` · ${item.errorCode}` : ''}</li>)}</ul>
              {cert.unverifiedDeclaredCapabilities?.length ? <p><strong>{text.partial}:</strong> {cert.unverifiedDeclaredCapabilities.join(', ')}</p> : null}
            </div> : null}
            {profile.certifiable ? <p style={{ fontSize:12, color:'#fbbf24' }}>{text.spend}</p> : null}
          </article>
        })}
      </section>
    </> : null}
  </main>
}
