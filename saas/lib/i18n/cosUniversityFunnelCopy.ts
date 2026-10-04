// saas/lib/i18n/cosUniversityFunnelCopy.ts
//
// Copy for the Artifact Effectiveness Funnel block on the University telemetry page. Five languages, same keys.
import type { CosUniversityTelemetryLanguage } from './cosUniversityTelemetryCopy'

export type CosUniversityFunnelCopy = Readonly<{
  title: string
  explanation: string
  windowLabel: string
  window24h: string
  window7d: string
  window30d: string
  windowAll: string
  subjectLabel: string
  subjectAll: string
  refresh: string
  loading: string
  requestFailed: string
  cohortTruncated: string
  production: string
  runsStarted: string
  runsCompleted: string
  runsFailed: string
  runsInFlight: string
  capabilityTitle: string
  capabilityComparable: string
  capabilityMeanBaseline: string
  capabilityMeanTrained: string
  capabilityMeanGain: string
  capabilityMedianGain: string
  capabilityImproved: string
  capabilityUnchangedRegressed: string
  capabilityPositiveRate: string
  methodology: string
  stagesTitle: string
  stageBorn: string
  stageBirthCertificate: string
  stageExamined: string
  stageImproved: string
  stageSafety: string
  stageTransfer: string
  stageRetention: string
  stageAllGates: string
  stageResidencyEnrolled: string
  stageResidencyComplete: string
  stageGraduated: string
  stageActivated: string
  stageHired: string
  stagePerformedWork: string
  stageServedSuccessfully: string
  stageVerifiedOutcome: string
  rejectedTitle: string
  rejectedQuarantined: string
  rejectedRetired: string
  byStatus: string
  failuresTitle: string
  failuresTotal: string
  failuresInfrastructure: string
  failuresMerit: string
  failuresByReason: string
  failuresRule: string
  unavailableTitle: string
  unavailableExplanation: string
  source: string
  generatedAt: string
}>

export const COS_UNIVERSITY_FUNNEL_COPY: Record<CosUniversityTelemetryLanguage, CosUniversityFunnelCopy> = {
  en: {
    title: 'Artifact effectiveness funnel',
    explanation: 'The same artifacts counted through every stage of their life, read from the tables - never from a counter. Cohort = artifacts registered in the window; later stages are followed wherever they happened. Every row names its source table; a chapter that could not be read is listed, not shown as zero.',
    windowLabel: 'Cohort window',
    window24h: 'Last 24 hours',
    window7d: 'Last 7 days',
    window30d: 'Last 30 days',
    windowAll: 'All time',
    subjectLabel: 'Subject',
    subjectAll: 'All subjects',
    refresh: 'Refresh',
    loading: 'Reading the tables…',
    requestFailed: 'Request failed.',
    cohortTruncated: 'Cohort truncated at the read limit; shares are computed on the artifacts read.',
    production: 'Production in the window',
    runsStarted: 'Distillation runs started',
    runsCompleted: 'Completed',
    runsFailed: 'Failed',
    runsInFlight: 'In flight',
    capabilityTitle: 'Capability gain',
    capabilityComparable: 'Comparable artifacts',
    capabilityMeanBaseline: 'Mean baseline',
    capabilityMeanTrained: 'Mean trained',
    capabilityMeanGain: 'Mean gain',
    capabilityMedianGain: 'Median gain',
    capabilityImproved: 'Improved',
    capabilityUnchangedRegressed: 'Unchanged / regressed',
    capabilityPositiveRate: 'Positive gain rate',
    methodology: 'methodology',
    stagesTitle: 'Cohort by stage',
    stageBorn: 'Born (registered)',
    stageBirthCertificate: 'Birth certificate issued',
    stageExamined: 'Examined (≥1 independent evaluation)',
    stageImproved: 'Improved over baseline (holdout)',
    stageSafety: 'Passed safety',
    stageTransfer: 'Passed transfer',
    stageRetention: 'Passed retention',
    stageAllGates: 'Passed all four gates',
    stageResidencyEnrolled: 'Residency enrolled (coding)',
    stageResidencyComplete: 'Residency complete',
    stageGraduated: 'Graduated',
    stageActivated: 'Activated (runtime)',
    stageHired: 'Hired into workforce',
    stagePerformedWork: 'Performed work (≥1 serving attempt)',
    stageServedSuccessfully: 'Served successfully',
    stageVerifiedOutcome: 'Independently verified outcome',
    rejectedTitle: 'Rejected',
    rejectedQuarantined: 'Quarantined',
    rejectedRetired: 'Retired',
    byStatus: 'Cohort by current status',
    failuresTitle: 'Evaluation failures in the window',
    failuresTotal: 'Failed evaluations',
    failuresInfrastructure: 'Our infrastructure (retryable)',
    failuresMerit: 'Student merit (counts against the artifact)',
    failuresByReason: 'By reason family',
    failuresRule: 'Classified by',
    unavailableTitle: 'Chapters not read',
    unavailableExplanation: 'These stages show 0 because their table could not be read, not because nothing happened.',
    source: 'source',
    generatedAt: 'Generated',
  },
  es: {
    title: 'Embudo de efectividad de artefactos',
    explanation: 'Los mismos artefactos contados en cada etapa de su vida, leídos de las tablas, nunca de un contador. Cohorte = artefactos registrados en la ventana; las etapas posteriores se siguen donde ocurrieran. Cada fila indica su tabla de origen; un capítulo que no pudo leerse se lista, no se muestra como cero.',
    windowLabel: 'Ventana de la cohorte',
    window24h: 'Últimas 24 horas',
    window7d: 'Últimos 7 días',
    window30d: 'Últimos 30 días',
    windowAll: 'Todo el historial',
    subjectLabel: 'Materia',
    subjectAll: 'Todas las materias',
    refresh: 'Actualizar',
    loading: 'Leyendo las tablas…',
    requestFailed: 'La solicitud falló.',
    cohortTruncated: 'Cohorte truncada en el límite de lectura; las proporciones se calculan sobre los artefactos leídos.',
    production: 'Producción en la ventana',
    runsStarted: 'Ejecuciones de destilación iniciadas',
    runsCompleted: 'Completadas',
    runsFailed: 'Fallidas',
    runsInFlight: 'En curso',
    capabilityTitle: 'Ganancia de capacidad',
    capabilityComparable: 'Artefactos comparables',
    capabilityMeanBaseline: 'Media base',
    capabilityMeanTrained: 'Media entrenada',
    capabilityMeanGain: 'Ganancia media',
    capabilityMedianGain: 'Ganancia mediana',
    capabilityImproved: 'Mejoraron',
    capabilityUnchangedRegressed: 'Sin cambio / empeoraron',
    capabilityPositiveRate: 'Tasa de ganancia positiva',
    methodology: 'metodología',
    stagesTitle: 'Cohorte por etapa',
    stageBorn: 'Nacidos (registrados)',
    stageBirthCertificate: 'Certificado de nacimiento emitido',
    stageExamined: 'Examinados (≥1 evaluación independiente)',
    stageImproved: 'Mejoraron sobre la base (holdout)',
    stageSafety: 'Aprobaron seguridad',
    stageTransfer: 'Aprobaron transferencia',
    stageRetention: 'Aprobaron retención',
    stageAllGates: 'Aprobaron las cuatro puertas',
    stageResidencyEnrolled: 'Inscritos en residencia (código)',
    stageResidencyComplete: 'Residencia completada',
    stageGraduated: 'Graduados',
    stageActivated: 'Activados (runtime)',
    stageHired: 'Contratados en la plantilla',
    stagePerformedWork: 'Trabajaron (≥1 intento de servicio)',
    stageServedSuccessfully: 'Sirvieron con éxito',
    stageVerifiedOutcome: 'Resultado verificado independientemente',
    rejectedTitle: 'Rechazados',
    rejectedQuarantined: 'En cuarentena',
    rejectedRetired: 'Retirados',
    byStatus: 'Cohorte por estado actual',
    failuresTitle: 'Fallos de evaluación en la ventana',
    failuresTotal: 'Evaluaciones fallidas',
    failuresInfrastructure: 'Nuestra infraestructura (reintentable)',
    failuresMerit: 'Mérito del estudiante (cuenta contra el artefacto)',
    failuresByReason: 'Por familia de motivo',
    failuresRule: 'Clasificado por',
    unavailableTitle: 'Capítulos no leídos',
    unavailableExplanation: 'Estas etapas muestran 0 porque su tabla no pudo leerse, no porque no haya ocurrido nada.',
    source: 'origen',
    generatedAt: 'Generado',
  },
  pt: {
    title: 'Funil de efetividade dos artefatos',
    explanation: 'Os mesmos artefatos contados em cada etapa de sua vida, lidos das tabelas, nunca de um contador. Coorte = artefatos registrados na janela; as etapas seguintes são acompanhadas onde quer que tenham ocorrido. Cada linha indica sua tabela de origem; um capítulo que não pôde ser lido é listado, não mostrado como zero.',
    windowLabel: 'Janela da coorte',
    window24h: 'Últimas 24 horas',
    window7d: 'Últimos 7 dias',
    window30d: 'Últimos 30 dias',
    windowAll: 'Todo o histórico',
    subjectLabel: 'Matéria',
    subjectAll: 'Todas as matérias',
    refresh: 'Atualizar',
    loading: 'Lendo as tabelas…',
    requestFailed: 'A solicitação falhou.',
    cohortTruncated: 'Coorte truncada no limite de leitura; as proporções são calculadas sobre os artefatos lidos.',
    production: 'Produção na janela',
    runsStarted: 'Execuções de destilação iniciadas',
    runsCompleted: 'Concluídas',
    runsFailed: 'Falhas',
    runsInFlight: 'Em andamento',
    capabilityTitle: 'Ganho de capacidade',
    capabilityComparable: 'Artefatos comparáveis',
    capabilityMeanBaseline: 'Média base',
    capabilityMeanTrained: 'Média treinada',
    capabilityMeanGain: 'Ganho médio',
    capabilityMedianGain: 'Ganho mediano',
    capabilityImproved: 'Melhoraram',
    capabilityUnchangedRegressed: 'Sem mudança / regrediram',
    capabilityPositiveRate: 'Taxa de ganho positivo',
    methodology: 'metodologia',
    stagesTitle: 'Coorte por etapa',
    stageBorn: 'Nascidos (registrados)',
    stageBirthCertificate: 'Certidão de nascimento emitida',
    stageExamined: 'Examinados (≥1 avaliação independente)',
    stageImproved: 'Melhoraram sobre a base (holdout)',
    stageSafety: 'Aprovados em segurança',
    stageTransfer: 'Aprovados em transferência',
    stageRetention: 'Aprovados em retenção',
    stageAllGates: 'Aprovados nas quatro etapas',
    stageResidencyEnrolled: 'Inscritos na residência (código)',
    stageResidencyComplete: 'Residência concluída',
    stageGraduated: 'Formados',
    stageActivated: 'Ativados (runtime)',
    stageHired: 'Contratados na força de trabalho',
    stagePerformedWork: 'Trabalharam (≥1 tentativa de atendimento)',
    stageServedSuccessfully: 'Atenderam com sucesso',
    stageVerifiedOutcome: 'Resultado verificado independentemente',
    rejectedTitle: 'Rejeitados',
    rejectedQuarantined: 'Em quarentena',
    rejectedRetired: 'Aposentados',
    byStatus: 'Coorte por status atual',
    failuresTitle: 'Falhas de avaliação na janela',
    failuresTotal: 'Avaliações com falha',
    failuresInfrastructure: 'Nossa infraestrutura (repetível)',
    failuresMerit: 'Mérito do aluno (conta contra o artefato)',
    failuresByReason: 'Por família de motivo',
    failuresRule: 'Classificado por',
    unavailableTitle: 'Capítulos não lidos',
    unavailableExplanation: 'Estas etapas mostram 0 porque sua tabela não pôde ser lida, não porque nada aconteceu.',
    source: 'origem',
    generatedAt: 'Gerado',
  },
  pl: {
    title: 'Lejek skuteczności artefaktów',
    explanation: 'Te same artefakty liczone na każdym etapie ich życia, odczytane z tabel, nigdy z licznika. Kohorta = artefakty zarejestrowane w oknie; późniejsze etapy śledzone są niezależnie od tego, kiedy zaszły. Każdy wiersz wskazuje tabelę źródłową; rozdział, którego nie dało się odczytać, jest wymieniony, a nie pokazany jako zero.',
    windowLabel: 'Okno kohorty',
    window24h: 'Ostatnie 24 godziny',
    window7d: 'Ostatnie 7 dni',
    window30d: 'Ostatnie 30 dni',
    windowAll: 'Cała historia',
    subjectLabel: 'Przedmiot',
    subjectAll: 'Wszystkie przedmioty',
    refresh: 'Odśwież',
    loading: 'Odczyt tabel…',
    requestFailed: 'Żądanie nie powiodło się.',
    cohortTruncated: 'Kohorta obcięta na limicie odczytu; udziały liczone są na odczytanych artefaktach.',
    production: 'Produkcja w oknie',
    runsStarted: 'Rozpoczęte przebiegi destylacji',
    runsCompleted: 'Ukończone',
    runsFailed: 'Nieudane',
    runsInFlight: 'W toku',
    capabilityTitle: 'Wzrost zdolności',
    capabilityComparable: 'Porównywalne artefakty',
    capabilityMeanBaseline: 'Średnia bazowa',
    capabilityMeanTrained: 'Średnia po treningu',
    capabilityMeanGain: 'Średni wzrost',
    capabilityMedianGain: 'Mediana wzrostu',
    capabilityImproved: 'Poprawione',
    capabilityUnchangedRegressed: 'Bez zmian / pogorszone',
    capabilityPositiveRate: 'Odsetek dodatniego wzrostu',
    methodology: 'metodologia',
    stagesTitle: 'Kohorta według etapu',
    stageBorn: 'Urodzone (zarejestrowane)',
    stageBirthCertificate: 'Wydany akt urodzenia',
    stageExamined: 'Zbadane (≥1 niezależna ocena)',
    stageImproved: 'Lepsze niż bazowy (holdout)',
    stageSafety: 'Zaliczone bezpieczeństwo',
    stageTransfer: 'Zaliczony transfer',
    stageRetention: 'Zaliczona retencja',
    stageAllGates: 'Zaliczone wszystkie cztery bramki',
    stageResidencyEnrolled: 'Zapisane na rezydenturę (kod)',
    stageResidencyComplete: 'Rezydentura ukończona',
    stageGraduated: 'Z dyplomem',
    stageActivated: 'Aktywowane (runtime)',
    stageHired: 'Zatrudnione w kadrze',
    stagePerformedWork: 'Pracowały (≥1 próba obsługi)',
    stageServedSuccessfully: 'Obsłużyły pomyślnie',
    stageVerifiedOutcome: 'Niezależnie zweryfikowany wynik',
    rejectedTitle: 'Odrzucone',
    rejectedQuarantined: 'W kwarantannie',
    rejectedRetired: 'Wycofane',
    byStatus: 'Kohorta według bieżącego statusu',
    failuresTitle: 'Błędy oceny w oknie',
    failuresTotal: 'Nieudane oceny',
    failuresInfrastructure: 'Nasza infrastruktura (do ponowienia)',
    failuresMerit: 'Zasługa ucznia (liczy się przeciw artefaktowi)',
    failuresByReason: 'Według rodziny przyczyn',
    failuresRule: 'Sklasyfikowane przez',
    unavailableTitle: 'Nieodczytane rozdziały',
    unavailableExplanation: 'Te etapy pokazują 0, bo ich tabeli nie dało się odczytać, a nie dlatego, że nic się nie wydarzyło.',
    source: 'źródło',
    generatedAt: 'Wygenerowano',
  },
  ru: {
    title: 'Воронка эффективности артефактов',
    explanation: 'Одни и те же артефакты, посчитанные на каждом этапе их жизни, прочитаны из таблиц — никогда из счётчика. Когорта = артефакты, зарегистрированные в окне; последующие этапы отслеживаются, когда бы они ни произошли. Каждая строка указывает исходную таблицу; глава, которую не удалось прочитать, перечислена, а не показана как ноль.',
    windowLabel: 'Окно когорты',
    window24h: 'Последние 24 часа',
    window7d: 'Последние 7 дней',
    window30d: 'Последние 30 дней',
    windowAll: 'За всё время',
    subjectLabel: 'Предмет',
    subjectAll: 'Все предметы',
    refresh: 'Обновить',
    loading: 'Чтение таблиц…',
    requestFailed: 'Запрос не выполнен.',
    cohortTruncated: 'Когорта обрезана по лимиту чтения; доли рассчитаны по прочитанным артефактам.',
    production: 'Производство в окне',
    runsStarted: 'Запущено прогонов дистилляции',
    runsCompleted: 'Завершено',
    runsFailed: 'Сбоев',
    runsInFlight: 'В работе',
    capabilityTitle: 'Прирост способности',
    capabilityComparable: 'Сопоставимые артефакты',
    capabilityMeanBaseline: 'Средний базовый',
    capabilityMeanTrained: 'Средний обученный',
    capabilityMeanGain: 'Средний прирост',
    capabilityMedianGain: 'Медианный прирост',
    capabilityImproved: 'Улучшились',
    capabilityUnchangedRegressed: 'Без изменений / ухудшились',
    capabilityPositiveRate: 'Доля положительного прироста',
    methodology: 'методика',
    stagesTitle: 'Когорта по этапам',
    stageBorn: 'Рождены (зарегистрированы)',
    stageBirthCertificate: 'Выдано свидетельство о рождении',
    stageExamined: 'Проэкзаменованы (≥1 независимая оценка)',
    stageImproved: 'Лучше базовой модели (holdout)',
    stageSafety: 'Прошли безопасность',
    stageTransfer: 'Прошли перенос',
    stageRetention: 'Прошли удержание',
    stageAllGates: 'Прошли все четыре ворота',
    stageResidencyEnrolled: 'Зачислены в резидентуру (код)',
    stageResidencyComplete: 'Резидентура завершена',
    stageGraduated: 'Выпущены',
    stageActivated: 'Активированы (среда выполнения)',
    stageHired: 'Наняты в рабочую силу',
    stagePerformedWork: 'Работали (≥1 попытка обслуживания)',
    stageServedSuccessfully: 'Обслужили успешно',
    stageVerifiedOutcome: 'Независимо проверенный результат',
    rejectedTitle: 'Отклонены',
    rejectedQuarantined: 'В карантине',
    rejectedRetired: 'Выведены',
    byStatus: 'Когорта по текущему статусу',
    failuresTitle: 'Сбои оценки в окне',
    failuresTotal: 'Неудачных оценок',
    failuresInfrastructure: 'Наша инфраструктура (повторяемо)',
    failuresMerit: 'Заслуга ученика (засчитывается против артефакта)',
    failuresByReason: 'По семейству причин',
    failuresRule: 'Классифицировано по',
    unavailableTitle: 'Непрочитанные главы',
    unavailableExplanation: 'Эти этапы показывают 0, потому что их таблицу не удалось прочитать, а не потому, что ничего не произошло.',
    source: 'источник',
    generatedAt: 'Сформировано',
  },
}
// end of saas/lib/i18n/cosUniversityFunnelCopy.ts (if this line is missing, the paste was cut short)
