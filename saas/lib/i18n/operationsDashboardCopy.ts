export type OperationsDashboardLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

type OperationsDashboardCopy = Readonly<{
  eyebrow: string
  title: string
  description: string
  generated: string
  executiveSummary: string
  organization: string
  operationalHealth: string
  criticalIncidents: string
  openIncidents: string
  verificationSuccess: string
  learningConfidence: string
  trustedPlaybooks: string
  totalOpenIncidents: string
  resolvedIncidents: string
  verified: string
  failed: string
  verifiedLearningSamples: string
  totalPlaybooks: string
  verification: string
  completed: string
  inconclusive: string
  averageConfidence: string
  learning: string
  acceptedSamples: string
  ignoredOutcomes: string
  strategies: string
  recommendationConfidence: string
  playbookStatus: string
  trusted: string
  recommended: string
  candidate: string
  deprecated: string
  recentIncidentReferences: string
  noIncidentReferences: string
  openSummary: string
  criticalSummary: string
  awaitingVerification: string
  awaitingClosureApproval: string
  stateGreen: string
  stateYellow: string
  stateRed: string
}>

export const operationsDashboardCopy: Readonly<Record<OperationsDashboardLocale, OperationsDashboardCopy>> = {
  en: {
    eyebrow: 'Mission 003 · Executive Dashboard', title: 'Operations Intelligence',
    description: 'Read-only executive visibility from the Operations Intelligence API. No repair, approval, execution, or learning controls are exposed here.',
    generated: 'Generated', executiveSummary: 'Executive Summary', organization: 'Organization', operationalHealth: 'Operational Health',
    criticalIncidents: 'Critical Incidents', openIncidents: 'Open Incidents', verificationSuccess: 'Verification Success', learningConfidence: 'Learning Confidence', trustedPlaybooks: 'Trusted Playbooks',
    totalOpenIncidents: 'total open incidents', resolvedIncidents: 'resolved incidents', verified: 'verified', failed: 'failed', verifiedLearningSamples: 'verified learning samples', totalPlaybooks: 'total playbooks',
    verification: 'Verification', completed: 'Completed', inconclusive: 'Inconclusive', averageConfidence: 'Average confidence', learning: 'Learning', acceptedSamples: 'Accepted samples', ignoredOutcomes: 'Ignored outcomes', strategies: 'Strategies', recommendationConfidence: 'Recommendation confidence',
    playbookStatus: 'Playbook Status', trusted: 'Trusted', recommended: 'Recommended', candidate: 'Candidate', deprecated: 'Deprecated', recentIncidentReferences: 'Recent Incident References', noIncidentReferences: 'No incident references were returned by the Operations Intelligence API.',
    openSummary: 'open incidents', criticalSummary: 'critical', awaitingVerification: 'awaiting verification', awaitingClosureApproval: 'awaiting closure approval', stateGreen: 'Green', stateYellow: 'Yellow', stateRed: 'Red',
  },
  es: {
    eyebrow: 'Misión 003 · Panel Ejecutivo', title: 'Inteligencia de Operaciones',
    description: 'Visibilidad ejecutiva de solo lectura desde la API de Inteligencia de Operaciones. Aquí no se muestran controles de reparación, aprobación, ejecución ni aprendizaje.',
    generated: 'Generado', executiveSummary: 'Resumen Ejecutivo', organization: 'Organización', operationalHealth: 'Salud Operativa',
    criticalIncidents: 'Incidentes Críticos', openIncidents: 'Incidentes Abiertos', verificationSuccess: 'Éxito de Verificación', learningConfidence: 'Confianza de Aprendizaje', trustedPlaybooks: 'Guías Confiables',
    totalOpenIncidents: 'incidentes abiertos en total', resolvedIncidents: 'incidentes resueltos', verified: 'verificados', failed: 'fallidos', verifiedLearningSamples: 'muestras de aprendizaje verificadas', totalPlaybooks: 'guías en total',
    verification: 'Verificación', completed: 'Completadas', inconclusive: 'No concluyentes', averageConfidence: 'Confianza promedio', learning: 'Aprendizaje', acceptedSamples: 'Muestras aceptadas', ignoredOutcomes: 'Resultados ignorados', strategies: 'Estrategias', recommendationConfidence: 'Confianza de recomendación',
    playbookStatus: 'Estado de las Guías', trusted: 'Confiables', recommended: 'Recomendadas', candidate: 'Candidatas', deprecated: 'Obsoletas', recentIncidentReferences: 'Referencias de Incidentes Recientes', noIncidentReferences: 'La API de Inteligencia de Operaciones no devolvió referencias de incidentes.',
    openSummary: 'incidentes abiertos', criticalSummary: 'críticos', awaitingVerification: 'en espera de verificación', awaitingClosureApproval: 'en espera de aprobación de cierre', stateGreen: 'Verde', stateYellow: 'Amarillo', stateRed: 'Rojo',
  },
  pt: {
    eyebrow: 'Missão 003 · Painel Executivo', title: 'Inteligência de Operações',
    description: 'Visibilidade executiva somente leitura da API de Inteligência de Operações. Nenhum controle de reparo, aprovação, execução ou aprendizado é exposto aqui.',
    generated: 'Gerado', executiveSummary: 'Resumo Executivo', organization: 'Organização', operationalHealth: 'Saúde Operacional',
    criticalIncidents: 'Incidentes Críticos', openIncidents: 'Incidentes Abertos', verificationSuccess: 'Sucesso da Verificação', learningConfidence: 'Confiança do Aprendizado', trustedPlaybooks: 'Guias Confiáveis',
    totalOpenIncidents: 'incidentes abertos no total', resolvedIncidents: 'incidentes resolvidos', verified: 'verificados', failed: 'com falha', verifiedLearningSamples: 'amostras de aprendizado verificadas', totalPlaybooks: 'guias no total',
    verification: 'Verificação', completed: 'Concluídas', inconclusive: 'Inconclusivas', averageConfidence: 'Confiança média', learning: 'Aprendizado', acceptedSamples: 'Amostras aceitas', ignoredOutcomes: 'Resultados ignorados', strategies: 'Estratégias', recommendationConfidence: 'Confiança da recomendação',
    playbookStatus: 'Status dos Guias', trusted: 'Confiáveis', recommended: 'Recomendados', candidate: 'Candidatos', deprecated: 'Descontinuados', recentIncidentReferences: 'Referências de Incidentes Recentes', noIncidentReferences: 'A API de Inteligência de Operações não retornou referências de incidentes.',
    openSummary: 'incidentes abertos', criticalSummary: 'críticos', awaitingVerification: 'aguardando verificação', awaitingClosureApproval: 'aguardando aprovação de encerramento', stateGreen: 'Verde', stateYellow: 'Amarelo', stateRed: 'Vermelho',
  },
  pl: {
    eyebrow: 'Misja 003 · Panel Kierowniczy', title: 'Inteligencja Operacyjna',
    description: 'Widok kierowniczy tylko do odczytu z API Inteligencji Operacyjnej. Nie ma tu kontroli naprawy, zatwierdzania, wykonania ani uczenia.',
    generated: 'Wygenerowano', executiveSummary: 'Podsumowanie Kierownicze', organization: 'Organizacja', operationalHealth: 'Stan Operacyjny',
    criticalIncidents: 'Incydenty Krytyczne', openIncidents: 'Otwarte Incydenty', verificationSuccess: 'Skuteczność Weryfikacji', learningConfidence: 'Pewność Uczenia', trustedPlaybooks: 'Zaufane Procedury',
    totalOpenIncidents: 'wszystkich otwartych incydentów', resolvedIncidents: 'rozwiązanych incydentów', verified: 'zweryfikowanych', failed: 'nieudanych', verifiedLearningSamples: 'zweryfikowanych próbek uczenia', totalPlaybooks: 'wszystkich procedur',
    verification: 'Weryfikacja', completed: 'Zakończone', inconclusive: 'Nierozstrzygające', averageConfidence: 'Średnia pewność', learning: 'Uczenie', acceptedSamples: 'Przyjęte próbki', ignoredOutcomes: 'Pominięte wyniki', strategies: 'Strategie', recommendationConfidence: 'Pewność rekomendacji',
    playbookStatus: 'Status Procedur', trusted: 'Zaufane', recommended: 'Rekomendowane', candidate: 'Kandydackie', deprecated: 'Wycofane', recentIncidentReferences: 'Ostatnie Odwołania do Incydentów', noIncidentReferences: 'API Inteligencji Operacyjnej nie zwróciło odwołań do incydentów.',
    openSummary: 'otwartych incydentów', criticalSummary: 'krytycznych', awaitingVerification: 'oczekuje na weryfikację', awaitingClosureApproval: 'oczekuje na zgodę na zamknięcie', stateGreen: 'Zielony', stateYellow: 'Żółty', stateRed: 'Czerwony',
  },
  ru: {
    eyebrow: 'Миссия 003 · Панель Руководителя', title: 'Операционная Аналитика',
    description: 'Исполнительный обзор только для чтения из API операционной аналитики. Здесь нет управления ремонтом, утверждением, выполнением или обучением.',
    generated: 'Сформировано', executiveSummary: 'Сводка для Руководства', organization: 'Организация', operationalHealth: 'Операционное Состояние',
    criticalIncidents: 'Критические Инциденты', openIncidents: 'Открытые Инциденты', verificationSuccess: 'Успех Проверки', learningConfidence: 'Достоверность Обучения', trustedPlaybooks: 'Надёжные Сценарии',
    totalOpenIncidents: 'всего открытых инцидентов', resolvedIncidents: 'решённых инцидентов', verified: 'подтверждено', failed: 'с ошибкой', verifiedLearningSamples: 'подтверждённых образцов обучения', totalPlaybooks: 'всего сценариев',
    verification: 'Проверка', completed: 'Завершено', inconclusive: 'Без результата', averageConfidence: 'Средняя достоверность', learning: 'Обучение', acceptedSamples: 'Принятые образцы', ignoredOutcomes: 'Пропущенные результаты', strategies: 'Стратегии', recommendationConfidence: 'Достоверность рекомендации',
    playbookStatus: 'Статус Сценариев', trusted: 'Надёжные', recommended: 'Рекомендуемые', candidate: 'Кандидаты', deprecated: 'Устаревшие', recentIncidentReferences: 'Последние Ссылки на Инциденты', noIncidentReferences: 'API операционной аналитики не вернуло ссылок на инциденты.',
    openSummary: 'открытых инцидентов', criticalSummary: 'критических', awaitingVerification: 'ожидают проверки', awaitingClosureApproval: 'ожидают утверждения закрытия', stateGreen: 'Зелёный', stateYellow: 'Жёлтый', stateRed: 'Красный',
  },
  de: {
    eyebrow: 'Mission 003 · Executive-Dashboard', title: 'Operations Intelligence',
    description: 'Schreibgeschützte Übersicht für die Geschäftsleitung aus der Operations-Intelligence-API. Hier sind keine Steuerelemente für Reparatur, Genehmigung, Ausführung oder Lernen verfügbar.',
    generated: 'Generiert', executiveSummary: 'Management-Zusammenfassung', organization: 'Organisation', operationalHealth: 'Betriebszustand',
    criticalIncidents: 'Kritische Vorfälle', openIncidents: 'Offene Vorfälle', verificationSuccess: 'Verifizierungserfolg', learningConfidence: 'Lernkonfidenz', trustedPlaybooks: 'Vertrauenswürdige Playbooks',
    totalOpenIncidents: 'offene Vorfälle insgesamt', resolvedIncidents: 'gelöste Vorfälle', verified: 'verifiziert', failed: 'fehlgeschlagen', verifiedLearningSamples: 'verifizierte Lernbeispiele', totalPlaybooks: 'Playbooks insgesamt',
    verification: 'Verifizierung', completed: 'Abgeschlossen', inconclusive: 'Nicht eindeutig', averageConfidence: 'Durchschnittliche Konfidenz', learning: 'Lernen', acceptedSamples: 'Akzeptierte Beispiele', ignoredOutcomes: 'Ignorierte Ergebnisse', strategies: 'Strategien', recommendationConfidence: 'Empfehlungskonfidenz',
    playbookStatus: 'Playbook-Status', trusted: 'Vertrauenswürdig', recommended: 'Empfohlen', candidate: 'Kandidat', deprecated: 'Veraltet', recentIncidentReferences: 'Referenzen zu aktuellen Vorfällen', noIncidentReferences: 'Die Operations-Intelligence-API hat keine Vorfallsreferenzen zurückgegeben.',
    openSummary: 'offene Vorfälle', criticalSummary: 'kritisch', awaitingVerification: 'warten auf Verifizierung', awaitingClosureApproval: 'warten auf Abschlussgenehmigung', stateGreen: 'Grün', stateYellow: 'Gelb', stateRed: 'Rot',
  },
  fr: {
    eyebrow: 'Mission 003 · Tableau de bord de direction', title: 'Intelligence opérationnelle',
    description: 'Visibilité de direction en lecture seule issue de l’API d’intelligence opérationnelle. Aucun contrôle de réparation, d’approbation, d’exécution ou d’apprentissage n’est exposé ici.',
    generated: 'Généré', executiveSummary: 'Synthèse de direction', organization: 'Organisation', operationalHealth: 'Santé opérationnelle',
    criticalIncidents: 'Incidents critiques', openIncidents: 'Incidents ouverts', verificationSuccess: 'Réussite de la vérification', learningConfidence: 'Confiance d’apprentissage', trustedPlaybooks: 'Playbooks fiables',
    totalOpenIncidents: 'incidents ouverts au total', resolvedIncidents: 'incidents résolus', verified: 'vérifiés', failed: 'échec', verifiedLearningSamples: 'échantillons d’apprentissage vérifiés', totalPlaybooks: 'playbooks au total',
    verification: 'Vérification', completed: 'Terminé', inconclusive: 'Non concluants', averageConfidence: 'Confiance moyenne', learning: 'Apprentissage', acceptedSamples: 'Échantillons acceptés', ignoredOutcomes: 'Résultats ignorés', strategies: 'Stratégies', recommendationConfidence: 'Confiance des recommandations',
    playbookStatus: 'Statut des playbooks', trusted: 'Fiables', recommended: 'Recommandés', candidate: 'Candidat', deprecated: 'Obsolète', recentIncidentReferences: 'Références des incidents récents', noIncidentReferences: 'L’API d’intelligence opérationnelle n’a renvoyé aucune référence d’incident.',
    openSummary: 'incidents ouverts', criticalSummary: 'critiques', awaitingVerification: 'en attente de vérification', awaitingClosureApproval: 'en attente d’approbation de clôture', stateGreen: 'Vert', stateYellow: 'Jaune', stateRed: 'Rouge',
  },
  it: {
    eyebrow: 'Missione 003 · Dashboard direzionale', title: 'Intelligence operativa',
    description: 'Visibilità direzionale in sola lettura dall’API di Intelligence operativa. Qui non sono esposti controlli di riparazione, approvazione, esecuzione o apprendimento.',
    generated: 'Generato', executiveSummary: 'Sintesi direzionale', organization: 'Organizzazione', operationalHealth: 'Salute operativa',
    criticalIncidents: 'Incidenti critici', openIncidents: 'Incidenti aperti', verificationSuccess: 'Successo della verifica', learningConfidence: 'Affidabilità dell’apprendimento', trustedPlaybooks: 'Playbook affidabili',
    totalOpenIncidents: 'incidenti aperti in totale', resolvedIncidents: 'incidenti risolti', verified: 'verificati', failed: 'non riuscito', verifiedLearningSamples: 'campioni di apprendimento verificati', totalPlaybooks: 'playbook in totale',
    verification: 'Verifica', completed: 'Completato', inconclusive: 'Non conclusivi', averageConfidence: 'Affidabilità media', learning: 'Apprendimento', acceptedSamples: 'Campioni accettati', ignoredOutcomes: 'Esiti ignorati', strategies: 'Strategie', recommendationConfidence: 'Affidabilità dei consigli',
    playbookStatus: 'Stato dei playbook', trusted: 'Affidabili', recommended: 'Consigliati', candidate: 'Candidato', deprecated: 'Deprecato', recentIncidentReferences: 'Riferimenti agli incidenti recenti', noIncidentReferences: 'L’API di Intelligence operativa non ha restituito riferimenti agli incidenti.',
    openSummary: 'incidenti aperti', criticalSummary: 'critici', awaitingVerification: 'in attesa di verifica', awaitingClosureApproval: 'in attesa di approvazione della chiusura', stateGreen: 'Verde', stateYellow: 'Giallo', stateRed: 'Rosso',
  },
  ja: {
    eyebrow: 'ミッション003 · エグゼクティブダッシュボード', title: 'オペレーションインテリジェンス',
    description: 'オペレーションインテリジェンスAPIによる経営層向けの読み取り専用ビューです。修復、承認、実行、学習のコントロールはここには表示されません。',
    generated: '生成済み', executiveSummary: 'エグゼクティブサマリー', organization: '組織', operationalHealth: '運用状態',
    criticalIncidents: '重大インシデント', openIncidents: '未解決のインシデント', verificationSuccess: '検証成功率', learningConfidence: '学習の信頼度', trustedPlaybooks: '信頼済みプレイブック',
    totalOpenIncidents: '未解決インシデントの合計', resolvedIncidents: '解決済みインシデント', verified: '検証済み', failed: '失敗', verifiedLearningSamples: '検証済みの学習サンプル', totalPlaybooks: 'プレイブックの合計',
    verification: '検証', completed: '完了', inconclusive: '判定不能', averageConfidence: '平均信頼度', learning: '学習', acceptedSamples: '採用されたサンプル', ignoredOutcomes: '無視された結果', strategies: '戦略', recommendationConfidence: '推奨の信頼度',
    playbookStatus: 'プレイブックのステータス', trusted: '信頼済み', recommended: '推奨', candidate: '候補', deprecated: '非推奨', recentIncidentReferences: '最近のインシデント参照', noIncidentReferences: 'オペレーションインテリジェンスAPIからインシデント参照は返されませんでした。',
    openSummary: '未解決のインシデント', criticalSummary: '重大', awaitingVerification: '検証待ち', awaitingClosureApproval: 'クローズ承認待ち', stateGreen: '緑', stateYellow: '黄', stateRed: '赤',
  },
  ko: {
    eyebrow: '미션 003 · 경영진 대시보드', title: '운영 인텔리전스',
    description: '운영 인텔리전스 API의 읽기 전용 경영진 뷰입니다. 이곳에는 복구, 승인, 실행, 학습 제어가 노출되지 않습니다.',
    generated: '생성됨', executiveSummary: '경영진 요약', organization: '조직', operationalHealth: '운영 상태',
    criticalIncidents: '심각한 인시던트', openIncidents: '미해결 인시던트', verificationSuccess: '검증 성공률', learningConfidence: '학습 신뢰도', trustedPlaybooks: '신뢰할 수 있는 플레이북',
    totalOpenIncidents: '전체 미해결 인시던트', resolvedIncidents: '해결된 인시던트', verified: '검증됨', failed: '실패', verifiedLearningSamples: '검증된 학습 샘플', totalPlaybooks: '전체 플레이북',
    verification: '인증', completed: '완료됨', inconclusive: '결론 없음', averageConfidence: '평균 신뢰도', learning: '학습', acceptedSamples: '수락된 샘플', ignoredOutcomes: '무시된 결과', strategies: '전략', recommendationConfidence: '추천 신뢰도',
    playbookStatus: '플레이북 상태', trusted: '신뢰됨', recommended: '추천', candidate: '후보', deprecated: '지원 중단', recentIncidentReferences: '최근 인시던트 참조', noIncidentReferences: '운영 인텔리전스 API에서 반환된 인시던트 참조가 없습니다.',
    openSummary: '미해결 인시던트', criticalSummary: '심각', awaitingVerification: '검증 대기 중', awaitingClosureApproval: '종료 승인 대기 중', stateGreen: '녹색', stateYellow: '노란색', stateRed: '빨간색',
  },
  ar: {
    eyebrow: 'المهمة 003 · لوحة المعلومات التنفيذية', title: 'ذكاء العمليات',
    description: 'رؤية تنفيذية للقراءة فقط من واجهة API لذكاء العمليات. لا تُعرض هنا أي عناصر تحكم في الإصلاح أو الموافقة أو التنفيذ أو التعلّم.',
    generated: 'تم الإنشاء', executiveSummary: 'الملخص التنفيذي', organization: 'المؤسسة', operationalHealth: 'الصحة التشغيلية',
    criticalIncidents: 'الحوادث الحرجة', openIncidents: 'الحوادث المفتوحة', verificationSuccess: 'نجاح التحقق', learningConfidence: 'ثقة التعلّم', trustedPlaybooks: 'أدلة التشغيل الموثوقة',
    totalOpenIncidents: 'إجمالي الحوادث المفتوحة', resolvedIncidents: 'الحوادث المحلولة', verified: 'تم التحقق منها', failed: 'فشل', verifiedLearningSamples: 'عينات تعلّم تم التحقق منها', totalPlaybooks: 'إجمالي أدلة التشغيل',
    verification: 'التحقق', completed: 'مكتمل', inconclusive: 'غير حاسمة', averageConfidence: 'متوسط الثقة', learning: 'التعلّم', acceptedSamples: 'العينات المقبولة', ignoredOutcomes: 'النتائج المتجاهلة', strategies: 'الاستراتيجيات', recommendationConfidence: 'ثقة التوصيات',
    playbookStatus: 'حالة أدلة التشغيل', trusted: 'موثوقة', recommended: 'موصى بها', candidate: 'المرشح', deprecated: 'مُهمَل', recentIncidentReferences: 'مراجع الحوادث الأخيرة', noIncidentReferences: 'لم تُرجع واجهة API لذكاء العمليات أي مراجع للحوادث.',
    openSummary: 'الحوادث المفتوحة', criticalSummary: 'حرجة', awaitingVerification: 'بانتظار التحقق', awaitingClosureApproval: 'بانتظار الموافقة على الإغلاق', stateGreen: 'أخضر', stateYellow: 'أصفر', stateRed: 'أحمر',
  },
}

export function getOperationsDashboardCopy(locale: string): OperationsDashboardCopy {
  return operationsDashboardCopy[(locale in operationsDashboardCopy ? locale : 'en') as OperationsDashboardLocale]
}
