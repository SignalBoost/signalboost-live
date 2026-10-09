// saas/lib/cos-marketing-sales/audioPodcastPipeline.ts
// Organic content and audio pipeline stub.
// Produces structured JSON for a two-host casual tech dialogue before any
// external audio provider is called.

import type { CosLocale, PodcastInput, PodcastSequence, PodcastSegment } from './types.ts'

const HOST_NAMES: Record<CosLocale, { hostA: string; hostB: string; announcer: string }> = {
  en: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  es: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  'pt-BR': { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  pl: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  ru: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  de: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  fr: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  it: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  ja: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  ko: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
  ar: { hostA: 'Alex', hostB: 'Maya', announcer: 'SignalBoost' },
}

const COPY: Record<CosLocale, { title: string; intro: string; explain: string; ad: string; cta: string; outro: string }> = {
  en: {
    title: 'Five-minute tech brief',
    intro: 'Today we are looking at a practical business signal and what it means for growth.',
    explain: 'The important point is not just the finding, but what the owner can do next without wasting time.',
    ad: 'Mid-roll: SignalBoost helps small teams turn website signals, outreach ideas, and optimization findings into approved action plans.',
    cta: 'The next step is simple: review the signal, approve the best fix, and turn it into outreach or a customer-facing improvement.',
    outro: 'That is the quick brief. Keep the workflow practical, measurable, and owner-approved.',
  },
  es: {
    title: 'Resumen tecnológico de cinco minutos',
    intro: 'Hoy revisamos una señal práctica de negocio y lo que significa para el crecimiento.',
    explain: 'Lo importante no es solo el hallazgo, sino qué puede hacer el propietario después sin perder tiempo.',
    ad: 'Mid-roll: SignalBoost ayuda a equipos pequeños a convertir señales del sitio, ideas de outreach y hallazgos de optimización en planes aprobados.',
    cta: 'El siguiente paso es simple: revisar la señal, aprobar la mejor corrección y convertirla en outreach o mejora para el cliente.',
    outro: 'Ese fue el resumen rápido. Mantén el flujo práctico, medible y aprobado por el propietario.',
  },
  'pt-BR': {
    title: 'Resumo técnico de cinco minutos',
    intro: 'Hoje vamos analisar um sinal prático de negócio e o que ele significa para crescimento.',
    explain: 'O ponto importante não é apenas a constatação, mas o que o proprietário pode fazer depois sem perder tempo.',
    ad: 'Mid-roll: O SignalBoost ajuda equipes pequenas a transformar sinais do site, ideias de outreach e constatações de otimização em planos aprovados.',
    cta: 'O próximo passo é simples: revisar o sinal, aprovar a melhor correção e transformar isso em outreach ou melhoria para o cliente.',
    outro: 'Esse foi o resumo rápido. Mantenha o fluxo prático, mensurável e aprovado pelo proprietário.',
  },
  pl: {
    title: 'Pięciominutowy brief technologiczny',
    intro: 'Dzisiaj omawiamy praktyczny sygnał biznesowy i jego znaczenie dla wzrostu.',
    explain: 'Ważny jest nie tylko wynik, ale też to, co właściciel może zrobić dalej bez straty czasu.',
    ad: 'Mid-roll: SignalBoost pomaga małym zespołom zmieniać sygnały ze strony, pomysły outreach i wyniki optymalizacji w zatwierdzone plany działań.',
    cta: 'Następny krok jest prosty: sprawdzić sygnał, zatwierdzić najlepszą poprawkę i zamienić ją w outreach lub ulepszenie dla klienta.',
    outro: 'To był krótki brief. Proces powinien być praktyczny, mierzalny i zatwierdzany przez właściciela.',
  },
  ru: {
    title: 'Пятиминутный технологический бриф',
    intro: 'Сегодня мы рассматриваем практический бизнес-сигнал и его значение для роста.',
    explain: 'Важно не только само замечание, но и следующий шаг владельца без потери времени.',
    ad: 'Mid-roll: SignalBoost помогает небольшим командам превращать сигналы сайта, идеи outreach и результаты оптимизации в утверждённые планы действий.',
    cta: 'Следующий шаг простой: проверить сигнал, утвердить лучшее исправление и превратить его в outreach или улучшение для клиента.',
    outro: 'Это был короткий бриф. Рабочий процесс должен быть практичным, измеримым и утверждённым владельцем.',
  },
  de: {
    title: 'Fünf-Minuten-Tech-Briefing',
    intro: 'Heute betrachten wir ein praktisches Geschäftssignal und was es für das Wachstum bedeutet.',
    explain: 'Entscheidend ist nicht nur die Erkenntnis, sondern was der Inhaber als Nächstes tun kann, ohne Zeit zu verschwenden.',
    ad: 'Mid-Roll: SignalBoost hilft kleinen Teams, Website-Signale, Outreach-Ideen und Optimierungserkenntnisse in freigegebene Aktionspläne zu verwandeln.',
    cta: 'Der nächste Schritt ist einfach: Signal prüfen, die beste Korrektur freigeben und daraus Outreach oder eine kundenseitige Verbesserung machen.',
    outro: 'Das war das Kurzbriefing. Halten Sie den Workflow praxisnah, messbar und vom Inhaber freigegeben.',
  },
  fr: {
    title: 'Point tech en cinq minutes',
    intro: 'Aujourd’hui, nous examinons un signal business concret et ce qu’il signifie pour la croissance.',
    explain: 'L’essentiel n’est pas seulement le constat, mais ce que le dirigeant peut faire ensuite sans perdre de temps.',
    ad: 'Mid-roll : SignalBoost aide les petites équipes à transformer les signaux de leur site, leurs idées de prospection et leurs constats d’optimisation en plans d’action approuvés.',
    cta: 'L’étape suivante est simple : examiner le signal, approuver le meilleur correctif et le transformer en prospection ou en amélioration visible par le client.',
    outro: 'Voilà pour ce point rapide. Gardez un workflow concret, mesurable et approuvé par le dirigeant.',
  },
  it: {
    title: 'Brief tecnologico di cinque minuti',
    intro: 'Oggi analizziamo un segnale di business concreto e cosa significa per la crescita.',
    explain: 'L’aspetto importante non è solo la scoperta, ma cosa può fare il titolare subito dopo senza perdere tempo.',
    ad: 'Mid-roll: SignalBoost aiuta i piccoli team a trasformare segnali del sito, idee di outreach e risultati di ottimizzazione in piani d’azione approvati.',
    cta: 'Il passo successivo è semplice: esamina il segnale, approva la correzione migliore e trasformala in outreach o in un miglioramento per i clienti.',
    outro: 'Questo era il brief rapido. Mantieni il flusso di lavoro pratico, misurabile e approvato dal titolare.',
  },
  ja: {
    title: '5分間テックブリーフ',
    intro: '今日は、実用的なビジネスシグナルと、それが成長にとって何を意味するかを見ていきます。',
    explain: '重要なのは発見そのものだけでなく、オーナーが時間を無駄にせずに次に何ができるかです。',
    ad: 'ミッドロール：SignalBoostは、小規模チームがWebサイトのシグナル、アウトリーチのアイデア、最適化の知見を承認済みのアクションプランに変えられるよう支援します。',
    cta: '次のステップはシンプルです。シグナルを確認し、最適な修正を承認して、アウトリーチまたは顧客向けの改善につなげます。',
    outro: '以上、クイックブリーフでした。ワークフローは実用的で測定可能、かつオーナー承認済みのものにしましょう。',
  },
  ko: {
    title: '5분 기술 브리핑',
    intro: '오늘은 실질적인 비즈니스 신호와 그것이 성장에 어떤 의미가 있는지 살펴봅니다.',
    explain: '중요한 것은 발견 자체만이 아니라, 소유자가 시간을 낭비하지 않고 다음에 무엇을 할 수 있는가입니다.',
    ad: '미드롤: SignalBoost는 소규모 팀이 웹사이트 신호, 아웃리치 아이디어, 최적화 결과를 승인된 실행 계획으로 전환하도록 돕습니다.',
    cta: '다음 단계는 간단합니다. 신호를 검토하고, 최선의 수정안을 승인한 뒤, 이를 아웃리치나 고객 대상 개선으로 전환하세요.',
    outro: '빠른 브리핑이었습니다. 워크플로를 실용적이고 측정 가능하며 소유자가 승인한 상태로 유지하세요.',
  },
  ar: {
    title: 'موجز تقني في خمس دقائق',
    intro: 'نتناول اليوم مؤشرًا عمليًا في الأعمال وما يعنيه للنمو.',
    explain: 'المهم ليس الاكتشاف فحسب، بل ما يمكن للمالك فعله بعد ذلك دون إضاعة الوقت.',
    ad: 'فاصل إعلاني: يساعد SignalBoost الفرق الصغيرة على تحويل مؤشرات الموقع وأفكار التواصل ونتائج التحسين إلى خطط عمل معتمدة.',
    cta: 'الخطوة التالية بسيطة: راجع المؤشر، واعتمد أفضل إصلاح، وحوّله إلى تواصل أو تحسين يلمسه العملاء.',
    outro: 'كان هذا هو الموجز السريع. حافظ على سير عمل عملي وقابل للقياس ومعتمد من المالك.',
  },
}

function normalizeLocale(locale?: string): CosLocale {
  if (locale === 'es' || locale === 'pt-BR' || locale === 'pl' || locale === 'ru' || locale === 'de' || locale === 'fr' || locale === 'it' || locale === 'ja' || locale === 'ko' || locale === 'ar') return locale
  return 'en'
}

function shorten(input: string | undefined, fallback: string, max = 360) {
  const text = String(input || fallback).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function segment(type: PodcastSegment['type'], speaker: PodcastSegment['speaker'], durationSeconds: number, text: string): PodcastSegment {
  return { id: crypto.randomUUID(), type, speaker, durationSeconds, text }
}

export function buildPodcastSequence(input: PodcastInput): PodcastSequence {
  const locale = normalizeLocale(input.locale)
  const copy = COPY[locale]
  const hosts = HOST_NAMES[locale]
  const sourceBrief = shorten(input.securityBrief || input.rawText, copy.explain)
  const midRoll = shorten(input.midRollOffer, copy.ad, 220)
  const title = shorten(input.title, copy.title, 120)

  const segments: PodcastSegment[] = [
    segment('intro', 'host_a', 35, `${copy.intro} ${title}`),
    segment('host_dialogue', 'host_b', 55, sourceBrief),
    segment('explanation', 'host_a', 70, copy.explain),
    segment('mid_roll_ad', 'announcer', 30, midRoll),
    segment('host_dialogue', 'host_b', 65, copy.cta),
    segment('cta', 'host_a', 25, `Platform: ${input.platformName || '[YOUR COMPANY]'}.`),
    segment('outro', 'host_b', 20, copy.outro),
  ]

  return {
    id: crypto.randomUUID(),
    locale,
    durationSeconds: segments.reduce((sum, item) => sum + item.durationSeconds, 0),
    title,
    hosts: { hostA: hosts.hostA, hostB: hosts.hostB },
    segments,
    providerPlan: {
      provider: 'mock',
      voiceMode: 'two_host_conversation',
      requiresApiKey: false,
      externalDispatch: false,
    },
  }
}
