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
}

export function getChiefOfStaffBlindAcceptanceCopy(language:string):Copy {
  const key = language === 'pt-BR' ? 'pt' : language
  return COPY[key] ?? COPY.en
}
