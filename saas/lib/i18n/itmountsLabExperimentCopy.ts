// saas/lib/i18n/itmountsLabExperimentCopy.ts
//
// Copy for the "Run one experiment" block on the University telemetry page. Five languages, same keys, same order.
import type { CosUniversityTelemetryLanguage } from './cosUniversityTelemetryCopy.ts'

export type ItmountsLabExperimentCopy = Readonly<{
  title: string
  explanation: string
  costNote: string
  loading: string
  unavailable: string
  noExperiments: string
  experimentLabel: string
  subjectLabel: string
  eligibleBatches: string
  noEligibleSubjects: string
  startButton: string
  starting: string
  started: string
  refusedNoBatch: string
  refused: string
  requestFailed: string
  runsTitle: string
  noRuns: string
  columnSubject: string
  columnCandidate: string
  columnStarted: string
  columnWindow: string
  columnTraining: string
  columnArtifact: string
  columnResidency: string
  columnGraduate: string
  windowActive: string
  windowExpired: string
  refresh: string
}>

export const ITMOUNTS_LAB_EXPERIMENT_COPY: Record<CosUniversityTelemetryLanguage, ItmountsLabExperimentCopy> = {
  en: {
    title: 'Run one experiment',
    explanation: 'Starts one training batch for the chosen subject and carries that artifact alone through training, Residency (Computer Science), canary, independent exam and graduation or rejection. While production is paused, only this run moves.',
    costNote: 'Spends at most $1.825 on training, then the usual ≤$0.20 canary and ≤$0.20 exam wakes. The run window is 48 hours.',
    loading: 'Loading experiments…',
    unavailable: 'Experiments could not be read.',
    noExperiments: 'You are not an active member of any Lab organization with an experiment.',
    experimentLabel: 'Experiment',
    subjectLabel: 'Subject',
    eligibleBatches: 'prepared batches',
    noEligibleSubjects: 'No subject has a prepared batch that meets the admission rules right now.',
    startButton: 'Start run',
    starting: 'Starting…',
    started: 'Run started.',
    refusedNoBatch: 'No eligible prepared batch for this subject.',
    refused: 'Refused',
    requestFailed: 'Request failed.',
    runsTitle: 'Runs',
    noRuns: 'No run started yet.',
    columnSubject: 'Subject',
    columnCandidate: 'Candidate',
    columnStarted: 'Started',
    columnWindow: 'Window',
    columnTraining: 'Training',
    columnArtifact: 'Artifact',
    columnResidency: 'Residency',
    columnGraduate: 'Graduate',
    windowActive: 'active',
    windowExpired: 'expired',
    refresh: 'Refresh',
  },
  es: {
    title: 'Ejecutar un experimento',
    explanation: 'Inicia un lote de entrenamiento para la materia elegida y lleva solo ese artefacto por entrenamiento, Residencia (Ciencias de la Computación), canario, examen independiente y graduación o rechazo. Con la producción en pausa, solo se mueve esta ejecución.',
    costNote: 'Gasta como máximo $1.825 en entrenamiento, luego los arranques habituales de ≤$0.20 del canario y ≤$0.20 del examen. La ventana de ejecución es de 48 horas.',
    loading: 'Cargando experimentos…',
    unavailable: 'No se pudieron leer los experimentos.',
    noExperiments: 'No eres miembro activo de ninguna organización del Lab con un experimento.',
    experimentLabel: 'Experimento',
    subjectLabel: 'Materia',
    eligibleBatches: 'lotes preparados',
    noEligibleSubjects: 'Ninguna materia tiene ahora un lote preparado que cumpla las reglas de admisión.',
    startButton: 'Iniciar ejecución',
    starting: 'Iniciando…',
    started: 'Ejecución iniciada.',
    refusedNoBatch: 'No hay un lote preparado elegible para esta materia.',
    refused: 'Rechazado',
    requestFailed: 'La solicitud falló.',
    runsTitle: 'Ejecuciones',
    noRuns: 'Aún no se inició ninguna ejecución.',
    columnSubject: 'Materia',
    columnCandidate: 'Candidato',
    columnStarted: 'Inicio',
    columnWindow: 'Ventana',
    columnTraining: 'Entrenamiento',
    columnArtifact: 'Artefacto',
    columnResidency: 'Residencia',
    columnGraduate: 'Graduado',
    windowActive: 'activa',
    windowExpired: 'vencida',
    refresh: 'Actualizar',
  },
  pt: {
    title: 'Executar um experimento',
    explanation: 'Inicia um lote de treinamento para a matéria escolhida e leva apenas esse artefato por treinamento, Residência (Ciência da Computação), canário, exame independente e graduação ou rejeição. Com a produção pausada, só esta execução se move.',
    costNote: 'Gasta no máximo $1.825 em treinamento e depois os despertares habituais de ≤$0.20 do canário e ≤$0.20 do exame. A janela de execução é de 48 horas.',
    loading: 'Carregando experimentos…',
    unavailable: 'Não foi possível ler os experimentos.',
    noExperiments: 'Você não é membro ativo de nenhuma organização do Lab com um experimento.',
    experimentLabel: 'Experimento',
    subjectLabel: 'Matéria',
    eligibleBatches: 'lotes preparados',
    noEligibleSubjects: 'Nenhuma matéria tem agora um lote preparado que atenda às regras de admissão.',
    startButton: 'Iniciar execução',
    starting: 'Iniciando…',
    started: 'Execução iniciada.',
    refusedNoBatch: 'Não há lote preparado elegível para esta matéria.',
    refused: 'Recusado',
    requestFailed: 'A solicitação falhou.',
    runsTitle: 'Execuções',
    noRuns: 'Nenhuma execução iniciada ainda.',
    columnSubject: 'Matéria',
    columnCandidate: 'Candidato',
    columnStarted: 'Início',
    columnWindow: 'Janela',
    columnTraining: 'Treinamento',
    columnArtifact: 'Artefato',
    columnResidency: 'Residência',
    columnGraduate: 'Graduado',
    windowActive: 'ativa',
    windowExpired: 'expirada',
    refresh: 'Atualizar',
  },
  pl: {
    title: 'Uruchom jeden eksperyment',
    explanation: 'Uruchamia jedną partię treningową dla wybranego przedmiotu i prowadzi tylko ten artefakt przez trening, rezydenturę (informatyka), test kanarkowy, niezależny egzamin oraz dyplom lub odrzucenie. Przy wstrzymanej produkcji porusza się tylko to uruchomienie.',
    costNote: 'Wydaje najwyżej 1,825 USD na trening, potem zwykłe wybudzenia ≤0,20 USD dla testu kanarkowego i ≤0,20 USD dla egzaminu. Okno uruchomienia wynosi 48 godzin.',
    loading: 'Wczytywanie eksperymentów…',
    unavailable: 'Nie udało się odczytać eksperymentów.',
    noExperiments: 'Nie jesteś aktywnym członkiem żadnej organizacji Lab z eksperymentem.',
    experimentLabel: 'Eksperyment',
    subjectLabel: 'Przedmiot',
    eligibleBatches: 'przygotowanych partii',
    noEligibleSubjects: 'Żaden przedmiot nie ma teraz przygotowanej partii spełniającej zasady przyjęcia.',
    startButton: 'Uruchom',
    starting: 'Uruchamianie…',
    started: 'Uruchomiono.',
    refusedNoBatch: 'Brak kwalifikującej się przygotowanej partii dla tego przedmiotu.',
    refused: 'Odrzucono',
    requestFailed: 'Żądanie nie powiodło się.',
    runsTitle: 'Uruchomienia',
    noRuns: 'Nie uruchomiono jeszcze żadnego eksperymentu.',
    columnSubject: 'Przedmiot',
    columnCandidate: 'Kandydat',
    columnStarted: 'Start',
    columnWindow: 'Okno',
    columnTraining: 'Trening',
    columnArtifact: 'Artefakt',
    columnResidency: 'Rezydentura',
    columnGraduate: 'Absolwent',
    windowActive: 'aktywne',
    windowExpired: 'wygasłe',
    refresh: 'Odśwież',
  },
  ru: {
    title: 'Запустить один эксперимент',
    explanation: 'Запускает одну учебную партию по выбранному предмету и проводит только этот артефакт через обучение, резидентуру (информатика), канареечную проверку, независимый экзамен и выпуск или отказ. При остановленном производстве движется только этот запуск.',
    costNote: 'Тратит не более $1.825 на обучение, затем обычные пробуждения ≤$0.20 для канареечной проверки и ≤$0.20 для экзамена. Окно запуска — 48 часов.',
    loading: 'Загрузка экспериментов…',
    unavailable: 'Не удалось прочитать эксперименты.',
    noExperiments: 'Вы не являетесь активным участником ни одной организации Lab с экспериментом.',
    experimentLabel: 'Эксперимент',
    subjectLabel: 'Предмет',
    eligibleBatches: 'подготовленных партий',
    noEligibleSubjects: 'Сейчас ни у одного предмета нет подготовленной партии, отвечающей правилам допуска.',
    startButton: 'Запустить',
    starting: 'Запуск…',
    started: 'Запуск начат.',
    refusedNoBatch: 'Для этого предмета нет подходящей подготовленной партии.',
    refused: 'Отказано',
    requestFailed: 'Запрос не выполнен.',
    runsTitle: 'Запуски',
    noRuns: 'Запусков ещё нет.',
    columnSubject: 'Предмет',
    columnCandidate: 'Кандидат',
    columnStarted: 'Начало',
    columnWindow: 'Окно',
    columnTraining: 'Обучение',
    columnArtifact: 'Артефакт',
    columnResidency: 'Резидентура',
    columnGraduate: 'Выпускник',
    windowActive: 'активно',
    windowExpired: 'истекло',
    refresh: 'Обновить',
  },
}
