type Copy = Readonly<{
  title:string; subtitle:string; run:string; running:string; refresh:string; pass:string; fail:string
  none:string; cases:string; evidence:string; status:string; back:string; milliseconds:string
  seed:string; frozen:string; nav:string; network:string
}>

const COPY:Record<string,Copy> = {
  en: {
    title:'COS Chief of Staff Blind Generalization',
    subtitle:'Fresh facts, names, numbers, and wording on every run. The original acceptance scorer remains frozen.',
    run:'Run blind four-case cycle', running:'Running blind cases…', refresh:'Refresh', pass:'PASS', fail:'FAIL',
    none:'No blind generalization cycle has run yet.', cases:'Observed cases', evidence:'Fresh evidence', status:'Status',
    back:'Fixed acceptance', milliseconds:'ms', seed:'Variant seed', frozen:'Frozen scorer + generated holdout facts',
    nav:'Blind generalization', network:'A network interruption occurred. Safe retries reuse the same run and case evidence.',
  },
  es: {
    title:'Generalización ciega del Jefe de Gabinete COS',
    subtitle:'Hechos, nombres, números y redacción nuevos en cada ejecución. El evaluador original permanece congelado.',
    run:'Ejecutar ciclo ciego de cuatro casos', running:'Ejecutando casos ciegos…', refresh:'Actualizar', pass:'APROBADO', fail:'FALLÓ',
    none:'Aún no se ejecutó ningún ciclo ciego.', cases:'Casos observados', evidence:'Evidencia nueva', status:'Estado',
    back:'Aceptación fija', milliseconds:'ms', seed:'Semilla de variante', frozen:'Evaluador congelado + hechos de reserva generados',
    nav:'Generalización ciega', network:'Hubo una interrupción de red. Los reintentos seguros reutilizan la misma ejecución y evidencia.',
  },
  pt: {
    title:'Generalização cega do Chefe de Gabinete COS',
    subtitle:'Fatos, nomes, números e redação novos em cada execução. O avaliador original permanece congelado.',
    run:'Executar ciclo cego de quatro casos', running:'Executando casos cegos…', refresh:'Atualizar', pass:'APROVADO', fail:'FALHOU',
    none:'Nenhum ciclo cego foi executado ainda.', cases:'Casos observados', evidence:'Evidência nova', status:'Status',
    back:'Aceitação fixa', milliseconds:'ms', seed:'Semente da variante', frozen:'Avaliador congelado + fatos de holdout gerados',
    nav:'Generalização cega', network:'Ocorreu uma interrupção de rede. Tentativas seguras reutilizam a mesma execução e evidência.',
  },
  pl: {
    title:'Ślepy test uogólniania COS jako Szefa Sztabu',
    subtitle:'Nowe fakty, nazwy, liczby i sformułowania przy każdym uruchomieniu. Pierwotny system oceniania pozostaje zamrożony.',
    run:'Uruchom ślepy cykl czterech przypadków', running:'Uruchamianie ślepych przypadków…', refresh:'Odśwież', pass:'ZALICZONE', fail:'NIEZALICZONE',
    none:'Nie uruchomiono jeszcze ślepego cyklu.', cases:'Zaobserwowane przypadki', evidence:'Świeże dowody', status:'Stan',
    back:'Stała akceptacja', milliseconds:'ms', seed:'Ziarno wariantu', frozen:'Zamrożony oceniający + generowane fakty holdout',
    nav:'Ślepe uogólnianie', network:'Wystąpiła przerwa sieciowa. Bezpieczne ponowienia używają tej samej próby i dowodów.',
  },
  ru: {
    title:'Слепая проверка обобщения COS как руководителя аппарата',
    subtitle:'Новые факты, имена, числа и формулировки при каждом запуске. Исходный оценщик остаётся замороженным.',
    run:'Запустить слепой цикл из четырёх тестов', running:'Выполняются слепые тесты…', refresh:'Обновить', pass:'ПРОЙДЕНО', fail:'НЕ ПРОЙДЕНО',
    none:'Слепой цикл ещё не запускался.', cases:'Проверено случаев', evidence:'Свежие доказательства', status:'Статус',
    back:'Фиксированная приёмка', milliseconds:'мс', seed:'Семя варианта', frozen:'Замороженный оценщик + сгенерированные контрольные факты',
    nav:'Слепое обобщение', network:'Произошёл сетевой сбой. Безопасные повторы используют тот же запуск и те же доказательства.',
  },
  de: {
    title:'Blinde Generalisierung des COS-Stabschefs',
    subtitle:'Neue Fakten, Namen, Zahlen und Formulierungen bei jedem Durchlauf. Der ursprüngliche Abnahme-Bewerter bleibt eingefroren.',
    run:'Blinden Zyklus mit vier Fällen ausführen', running:'Blinde Fälle werden ausgeführt…', refresh:'Aktualisieren', pass:'BESTANDEN', fail:'FEHLER',
    none:'Es wurde noch kein Zyklus zur blinden Generalisierung ausgeführt.', cases:'Beobachtete Fälle', evidence:'Neue Nachweise', status:'Status',
    back:'Feste Abnahme', milliseconds:'ms', seed:'Varianten-Seed', frozen:'Eingefrorener Bewerter + generierte Holdout-Fakten',
    nav:'Blinde Generalisierung', network:'Es ist eine Netzwerkunterbrechung aufgetreten. Sichere Wiederholungen verwenden denselben Durchlauf und dieselben Fallnachweise.',
  },
  fr: {
    title:'Généralisation à l\'aveugle du directeur de cabinet COS',
    subtitle:'Nouveaux faits, noms, chiffres et formulations à chaque exécution. L\'évaluateur de recette d\'origine reste figé.',
    run:'Lancer le cycle à l\'aveugle à quatre cas', running:'Exécution des cas à l\'aveugle…', refresh:'Actualiser', pass:'RÉUSSI', fail:'ÉCHEC',
    none:'Aucun cycle de généralisation à l\'aveugle n\'a encore été exécuté.', cases:'Cas observés', evidence:'Nouvelles preuves', status:'Statut',
    back:'Recette fixe', milliseconds:'ms', seed:'Graine de variante', frozen:'Évaluateur figé + faits de réserve générés',
    nav:'Généralisation à l\'aveugle', network:'Une interruption réseau s\'est produite. Les nouvelles tentatives sécurisées réutilisent la même exécution et les mêmes preuves de cas.',
  },
  it: {
    title:'Generalizzazione alla cieca del capo di gabinetto COS',
    subtitle:'Fatti, nomi, numeri e formulazioni nuovi a ogni esecuzione. Il valutatore di collaudo originale resta congelato.',
    run:'Esegui il ciclo alla cieca a quattro casi', running:'Esecuzione dei casi alla cieca…', refresh:'Aggiorna', pass:'SUPERATO', fail:'NON RIUSCITO',
    none:'Non è stato ancora eseguito alcun ciclo di generalizzazione alla cieca.', cases:'Casi osservati', evidence:'Nuove evidenze', status:'Stato',
    back:'Collaudo fisso', milliseconds:'ms', seed:'Seed della variante', frozen:'Valutatore congelato + fatti di holdout generati',
    nav:'Generalizzazione alla cieca', network:'Si è verificata un\'interruzione di rete. I tentativi sicuri riutilizzano la stessa esecuzione e le stesse evidenze dei casi.',
  },
  ja: {
    title:'COS 首席補佐官のブラインド汎化テスト',
    subtitle:'実行ごとに新しい事実、名前、数値、表現を使用します。元の受け入れ採点器は固定されたままです。',
    run:'4 ケースのブラインドサイクルを実行', running:'ブラインドケースを実行中…', refresh:'更新', pass:'合格', fail:'失敗',
    none:'ブラインド汎化サイクルはまだ実行されていません。', cases:'観測されたケース', evidence:'新しい証拠', status:'ステータス',
    back:'固定の受け入れテスト', milliseconds:'ミリ秒', seed:'バリアントシード', frozen:'固定採点器 + 生成されたホールドアウト事実',
    nav:'ブラインド汎化', network:'ネットワークの中断が発生しました。安全な再試行では、同じ実行とケースの証拠が再利用されます。',
  },
  ko: {
    title:'COS 비서실장 블라인드 일반화',
    subtitle:'실행할 때마다 새로운 사실, 이름, 숫자, 문구를 사용합니다. 원래 인수 채점기는 고정된 상태로 유지됩니다.',
    run:'4개 사례 블라인드 사이클 실행', running:'블라인드 사례 실행 중…', refresh:'새로 고침', pass:'통과', fail:'실패',
    none:'아직 실행된 블라인드 일반화 사이클이 없습니다.', cases:'관찰된 사례', evidence:'새 증거', status:'상태',
    back:'고정 인수 테스트', milliseconds:'ms', seed:'변형 시드', frozen:'고정 채점기 + 생성된 홀드아웃 사실',
    nav:'블라인드 일반화', network:'네트워크 중단이 발생했습니다. 안전한 재시도는 동일한 실행과 사례 증거를 재사용합니다.',
  },
  ar: {
    title:'التعميم الأعمى لرئيس الديوان COS',
    subtitle:'حقائق وأسماء وأرقام وصياغات جديدة في كل تشغيل. يبقى مُقيِّم القبول الأصلي مجمّدًا.',
    run:'تشغيل الدورة العمياء ذات الحالات الأربع', running:'جارٍ تشغيل الحالات العمياء…', refresh:'تحديث', pass:'ناجح', fail:'فشل',
    none:'لم يتم تشغيل أي دورة تعميم أعمى بعد.', cases:'الحالات المرصودة', evidence:'أدلة جديدة', status:'الحالة',
    back:'قبول ثابت', milliseconds:'مللي ثانية', seed:'بذرة المتغير', frozen:'مُقيِّم مجمّد + حقائق احتياطية مُولَّدة',
    nav:'التعميم الأعمى', network:'حدث انقطاع في الشبكة. تعيد المحاولات الآمنة استخدام التشغيل نفسه وأدلة الحالات نفسها.',
  },
}

export function getChiefOfStaffBlindAcceptanceCopy(language:string):Copy {
  const key = language === 'pt-BR' ? 'pt' : language
  return COPY[key] ?? COPY.en
}
