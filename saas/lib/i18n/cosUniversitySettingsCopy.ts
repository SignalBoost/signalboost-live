// saas/lib/i18n/cosUniversitySettingsCopy.ts
//
// Copy for the University settings block on the University telemetry page. Five languages, same keys, same order.
import type { CosUniversityTelemetryLanguage } from './cosUniversityTelemetryCopy.ts'

export type CosUniversitySettingsCopy = Readonly<{
  title: string
  explanation: string
  loading: string
  unavailable: string
  pauseTitle: string
  pauseExplanation: string
  pauseStateRunning: string
  pauseStatePaused: string
  pauseStateUnknown: string
  pauseButton: string
  resumeButton: string
  warmWindowTitle: string
  warmWindowExplanation: string
  warmWindowPlaceholder: string
  warmWindowEffective: string
  warmWindowNone: string
  warmWindowSourceSetting: string
  warmWindowSourceEnv: string
  warmWindowSourceNone: string
  warmWindowOpenNow: string
  warmWindowClosedNow: string
  warmWindowOpensAt: string
  warmWindowClosesAt: string
  warmWindowInvalid: string
  warmWindowSave: string
  warmWindowClear: string
  saving: string
  saved: string
  changedBy: string
  requestFailed: string
}>

export const COS_UNIVERSITY_SETTINGS_COPY: Record<CosUniversityTelemetryLanguage, CosUniversitySettingsCopy> = {
  en: {
    title: 'University settings',
    explanation: 'The portable\'s own controls. Changes apply on the next station tick; no redeploy, no environment variable.',
    loading: 'Loading settings…',
    unavailable: 'Settings could not be read.',
    pauseTitle: 'Production',
    pauseExplanation: 'Pause stops every production station (admission, canary, exam, graduation, residency, line controller). Graduates already serving keep working.',
    pauseStateRunning: 'Running',
    pauseStatePaused: 'Paused',
    pauseStateUnknown: 'Unknown (store unreadable; stations run)',
    pauseButton: 'Pause production',
    resumeButton: 'Resume production',
    warmWindowTitle: 'Workforce warm window (UTC)',
    warmWindowExplanation: 'Daily window in which the reserved graduates keep one worker running so practice work reaches them. Format HH:MM-HH:MM, UTC; may cross midnight. Empty means no window: no paid worker, no practice.',
    warmWindowPlaceholder: 'e.g. 14:00-16:00',
    warmWindowEffective: 'Effective window',
    warmWindowNone: 'none',
    warmWindowSourceSetting: 'from this page',
    warmWindowSourceEnv: 'from the deployment environment (nothing stored here)',
    warmWindowSourceNone: 'nothing declared',
    warmWindowOpenNow: 'open now',
    warmWindowClosedNow: 'closed now',
    warmWindowOpensAt: 'opens',
    warmWindowClosesAt: 'closes',
    warmWindowInvalid: 'Not a valid window. Use HH:MM-HH:MM in UTC, with different start and end.',
    warmWindowSave: 'Save window',
    warmWindowClear: 'Clear window',
    saving: 'Saving…',
    saved: 'Saved.',
    changedBy: 'Last change',
    requestFailed: 'Request failed.',
  },
  es: {
    title: 'Ajustes de la Universidad',
    explanation: 'Los controles propios del portable. Los cambios se aplican en el siguiente ciclo de estación; sin redespliegue ni variable de entorno.',
    loading: 'Cargando ajustes…',
    unavailable: 'No se pudieron leer los ajustes.',
    pauseTitle: 'Producción',
    pauseExplanation: 'Pausar detiene todas las estaciones de producción (admisión, canario, examen, graduación, residencia, controlador de línea). Los graduados que ya están sirviendo siguen trabajando.',
    pauseStateRunning: 'En marcha',
    pauseStatePaused: 'En pausa',
    pauseStateUnknown: 'Desconocido (almacén ilegible; las estaciones funcionan)',
    pauseButton: 'Pausar producción',
    resumeButton: 'Reanudar producción',
    warmWindowTitle: 'Ventana caliente de la plantilla (UTC)',
    warmWindowExplanation: 'Ventana diaria en la que los graduados reservados mantienen un worker en marcha para que les llegue trabajo de práctica. Formato HH:MM-HH:MM, UTC; puede cruzar la medianoche. Vacío significa sin ventana: sin worker de pago, sin práctica.',
    warmWindowPlaceholder: 'p. ej. 14:00-16:00',
    warmWindowEffective: 'Ventana efectiva',
    warmWindowNone: 'ninguna',
    warmWindowSourceSetting: 'desde esta página',
    warmWindowSourceEnv: 'desde el entorno del despliegue (nada guardado aquí)',
    warmWindowSourceNone: 'nada declarado',
    warmWindowOpenNow: 'abierta ahora',
    warmWindowClosedNow: 'cerrada ahora',
    warmWindowOpensAt: 'abre',
    warmWindowClosesAt: 'cierra',
    warmWindowInvalid: 'Ventana no válida. Use HH:MM-HH:MM en UTC, con inicio y fin distintos.',
    warmWindowSave: 'Guardar ventana',
    warmWindowClear: 'Borrar ventana',
    saving: 'Guardando…',
    saved: 'Guardado.',
    changedBy: 'Último cambio',
    requestFailed: 'La solicitud falló.',
  },
  pt: {
    title: 'Configurações da Universidade',
    explanation: 'Os controles do próprio portável. As mudanças valem no próximo ciclo de estação; sem redeploy, sem variável de ambiente.',
    loading: 'Carregando configurações…',
    unavailable: 'Não foi possível ler as configurações.',
    pauseTitle: 'Produção',
    pauseExplanation: 'Pausar interrompe todas as estações de produção (admissão, canário, exame, graduação, residência, controlador da linha). Os graduados que já estão servindo continuam trabalhando.',
    pauseStateRunning: 'Em execução',
    pauseStatePaused: 'Pausada',
    pauseStateUnknown: 'Desconhecido (armazenamento ilegível; as estações funcionam)',
    pauseButton: 'Pausar produção',
    resumeButton: 'Retomar produção',
    warmWindowTitle: 'Janela quente da força de trabalho (UTC)',
    warmWindowExplanation: 'Janela diária em que os graduados reservados mantêm um worker em execução para que o trabalho de prática chegue até eles. Formato HH:MM-HH:MM, UTC; pode cruzar a meia-noite. Vazio significa sem janela: sem worker pago, sem prática.',
    warmWindowPlaceholder: 'ex.: 14:00-16:00',
    warmWindowEffective: 'Janela efetiva',
    warmWindowNone: 'nenhuma',
    warmWindowSourceSetting: 'desta página',
    warmWindowSourceEnv: 'do ambiente do deploy (nada salvo aqui)',
    warmWindowSourceNone: 'nada declarado',
    warmWindowOpenNow: 'aberta agora',
    warmWindowClosedNow: 'fechada agora',
    warmWindowOpensAt: 'abre',
    warmWindowClosesAt: 'fecha',
    warmWindowInvalid: 'Janela inválida. Use HH:MM-HH:MM em UTC, com início e fim diferentes.',
    warmWindowSave: 'Salvar janela',
    warmWindowClear: 'Limpar janela',
    saving: 'Salvando…',
    saved: 'Salvo.',
    changedBy: 'Última alteração',
    requestFailed: 'A solicitação falhou.',
  },
  pl: {
    title: 'Ustawienia Uniwersytetu',
    explanation: 'Własne sterowanie portable. Zmiany obowiązują od następnego cyklu stacji; bez ponownego wdrożenia i bez zmiennej środowiskowej.',
    loading: 'Wczytywanie ustawień…',
    unavailable: 'Nie udało się odczytać ustawień.',
    pauseTitle: 'Produkcja',
    pauseExplanation: 'Pauza zatrzymuje wszystkie stacje produkcyjne (przyjęcie, kanarek, egzamin, dyplom, rezydentura, sterownik linii). Absolwenci już obsługujący ruch nadal pracują.',
    pauseStateRunning: 'Działa',
    pauseStatePaused: 'Wstrzymana',
    pauseStateUnknown: 'Nieznany (magazyn nieczytelny; stacje działają)',
    pauseButton: 'Wstrzymaj produkcję',
    resumeButton: 'Wznów produkcję',
    warmWindowTitle: 'Ciepłe okno kadry (UTC)',
    warmWindowExplanation: 'Dzienne okno, w którym zarezerwowani absolwenci utrzymują jeden działający worker, aby trafiała do nich praca ćwiczeniowa. Format HH:MM-HH:MM, UTC; może przechodzić przez północ. Puste oznacza brak okna: brak płatnego workera, brak ćwiczeń.',
    warmWindowPlaceholder: 'np. 14:00-16:00',
    warmWindowEffective: 'Obowiązujące okno',
    warmWindowNone: 'brak',
    warmWindowSourceSetting: 'z tej strony',
    warmWindowSourceEnv: 'ze środowiska wdrożenia (nic nie zapisano tutaj)',
    warmWindowSourceNone: 'nic nie zadeklarowano',
    warmWindowOpenNow: 'otwarte teraz',
    warmWindowClosedNow: 'zamknięte teraz',
    warmWindowOpensAt: 'otwiera się',
    warmWindowClosesAt: 'zamyka się',
    warmWindowInvalid: 'Nieprawidłowe okno. Użyj HH:MM-HH:MM w UTC, z różnym początkiem i końcem.',
    warmWindowSave: 'Zapisz okno',
    warmWindowClear: 'Wyczyść okno',
    saving: 'Zapisywanie…',
    saved: 'Zapisano.',
    changedBy: 'Ostatnia zmiana',
    requestFailed: 'Żądanie nie powiodło się.',
  },
  ru: {
    title: 'Настройки Университета',
    explanation: 'Собственные элементы управления портативной системы. Изменения вступают в силу на следующем такте станции; без передеплоя и без переменной окружения.',
    loading: 'Загрузка настроек…',
    unavailable: 'Не удалось прочитать настройки.',
    pauseTitle: 'Производство',
    pauseExplanation: 'Пауза останавливает все производственные станции (приём, канарейка, экзамен, выпуск, резидентура, контроллер линии). Выпускники, уже обслуживающие запросы, продолжают работать.',
    pauseStateRunning: 'Работает',
    pauseStatePaused: 'На паузе',
    pauseStateUnknown: 'Неизвестно (хранилище недоступно; станции работают)',
    pauseButton: 'Приостановить производство',
    resumeButton: 'Возобновить производство',
    warmWindowTitle: 'Тёплое окно рабочей силы (UTC)',
    warmWindowExplanation: 'Ежедневное окно, в течение которого зарезервированные выпускники держат один работающий worker, чтобы до них доходила практическая работа. Формат HH:MM-HH:MM, UTC; может переходить через полночь. Пусто означает отсутствие окна: ни платного worker, ни практики.',
    warmWindowPlaceholder: 'напр. 14:00-16:00',
    warmWindowEffective: 'Действующее окно',
    warmWindowNone: 'нет',
    warmWindowSourceSetting: 'с этой страницы',
    warmWindowSourceEnv: 'из окружения деплоя (здесь ничего не сохранено)',
    warmWindowSourceNone: 'ничего не объявлено',
    warmWindowOpenNow: 'открыто сейчас',
    warmWindowClosedNow: 'закрыто сейчас',
    warmWindowOpensAt: 'откроется',
    warmWindowClosesAt: 'закроется',
    warmWindowInvalid: 'Недопустимое окно. Используйте HH:MM-HH:MM в UTC с разными началом и концом.',
    warmWindowSave: 'Сохранить окно',
    warmWindowClear: 'Очистить окно',
    saving: 'Сохранение…',
    saved: 'Сохранено.',
    changedBy: 'Последнее изменение',
    requestFailed: 'Запрос не выполнен.',
  },
}
// end of saas/lib/i18n/cosUniversitySettingsCopy.ts (if this line is missing, the paste was cut short)
