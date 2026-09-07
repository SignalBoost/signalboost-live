type Copy = Readonly<{
  title:string; subtitle:string; run:string; running:string; refresh:string; pass:string; fail:string
  none:string; cases:string; evidence:string; status:string; back:string; milliseconds:string
}>

const COPY:Record<string,Copy> = {
  en: { title:'COS Chief of Staff Acceptance', subtitle:'Four fresh owner-COS executions scored from host evidence—not model self-report.', run:'Run four-case acceptance cycle', running:'Running four live cases…', refresh:'Refresh', pass:'PASS', fail:'FAIL', none:'No acceptance cycle has run yet.', cases:'Observed cases', evidence:'Fresh evidence', status:'Status', back:'Capability benchmark', milliseconds:'ms' },
  es: { title:'Aceptación del Jefe de Gabinete COS', subtitle:'Cuatro ejecuciones nuevas de COS evaluadas con evidencia del host, no con autoevaluación del modelo.', run:'Ejecutar ciclo de cuatro casos', running:'Ejecutando cuatro casos reales…', refresh:'Actualizar', pass:'APROBADO', fail:'FALLÓ', none:'Aún no se ejecutó ningún ciclo.', cases:'Casos observados', evidence:'Evidencia nueva', status:'Estado', back:'Prueba de capacidad', milliseconds:'ms' },
  pt: { title:'Aceitação do Chefe de Gabinete COS', subtitle:'Quatro execuções novas do COS avaliadas por evidência do host, não por autoavaliação do modelo.', run:'Executar ciclo de quatro casos', running:'Executando quatro casos reais…', refresh:'Atualizar', pass:'APROVADO', fail:'FALHOU', none:'Nenhum ciclo foi executado ainda.', cases:'Casos observados', evidence:'Evidência nova', status:'Status', back:'Benchmark de capacidade', milliseconds:'ms' },
  pl: { title:'Akceptacja COS jako Szefa Sztabu', subtitle:'Cztery nowe wykonania COS oceniane na podstawie dowodów hosta, nie samooceny modelu.', run:'Uruchom cykl czterech przypadków', running:'Uruchamianie czterech przypadków…', refresh:'Odśwież', pass:'ZALICZONE', fail:'NIEZALICZONE', none:'Nie uruchomiono jeszcze cyklu.', cases:'Zaobserwowane przypadki', evidence:'Świeże dowody', status:'Stan', back:'Test możliwości', milliseconds:'ms' },
  ru: { title:'Приёмка COS как руководителя аппарата', subtitle:'Четыре новых запуска COS оцениваются по данным хоста, а не по самооценке модели.', run:'Запустить цикл из четырёх тестов', running:'Выполняются четыре реальных теста…', refresh:'Обновить', pass:'ПРОЙДЕНО', fail:'НЕ ПРОЙДЕНО', none:'Цикл приёмки ещё не запускался.', cases:'Проверено случаев', evidence:'Свежие доказательства', status:'Статус', back:'Тест возможностей', milliseconds:'мс' },
}

export function getChiefOfStaffAcceptanceCopy(language:string):Copy {
  const key = language === 'pt-BR' ? 'pt' : language
  return COPY[key] ?? COPY.en
}
