'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const COPY = {
  eyebrow:      { en: uiText('generatedUi.u_7b855b0f8767d64d'), es: 'Motor de prospección', pt: 'Motor de prospecção', pl: 'Silnik kontaktów', ru: 'Движок аутрича', de: 'Outreach-Engine', fr: 'Moteur de prospection', it: 'Motore di outreach', ja: 'アウトリーチエンジン', ko: '아웃리치 엔진', ar: 'محرك التواصل' },
  title:        { en: uiText('generatedUi.u_71cdc7678ac86ce2'), es: 'Convierte un prospecto en una campaña aprobada.', pt: 'Transforme um lead em uma campanha aprovada.', pl: 'Zamień lead w zatwierdzoną kampanię.', ru: 'Превратите лид в одобренную кампанию.', de: 'Verwandeln Sie einen Lead in eine genehmigte Kampagne.', fr: 'Transformez un prospect en campagne approuvée.', it: 'Trasforma un lead in una campagna approvata.', ja: 'リードを承認済みキャンペーンに変えましょう。', ko: '리드를 승인된 캠페인으로 전환하세요.', ar: 'حوّل عميلًا محتملًا إلى حملة معتمدة.' },
  subtitle:     { en: uiText('generatedUi.u_9075916896a1ca33'), es: 'La prospección es un proceso con revisión humana: analizar, aprobar, dar seguimiento. Empieza abajo o entra a cualquier paso.', pt: 'A prospecção é um processo com revisão humana: analisar, aprovar, acompanhar. Comece abaixo ou entre em qualquer etapa.', pl: 'Outreach to proces z ludzką weryfikacją: analizuj, zatwierdzaj, śledź. Zacznij poniżej lub przejdź do dowolnego kroku.', ru: 'Аутрич — это процесс с проверкой человеком: анализ, одобрение, отслеживание. Начните ниже или перейдите к любому шагу.', de: 'Outreach ist ein Ablauf mit menschlicher Prüfung: analysieren, freigeben, nachverfolgen. Beginnen Sie unten oder springen Sie zu einem beliebigen Schritt.', fr: 'La prospection suit un parcours de revue humaine : analyser, approuver, suivre. Commencez ci-dessous ou passez directement à n\'importe quelle étape.', it: 'L\'outreach è un percorso con revisione umana: analizza, approva, monitora. Inizia qui sotto o passa a qualsiasi fase.', ja: 'アウトリーチは人によるレビューの流れです：分析、承認、追跡。下から始めるか、任意のステップに移動してください。', ko: '아웃리치는 사람이 검토하는 과정입니다: 분석, 승인, 추적. 아래에서 시작하거나 원하는 단계로 이동하세요.', ar: 'التواصل رحلة مراجعة بشرية: التحليل ثم الموافقة ثم المتابعة. ابدأ أدناه أو انتقل إلى أي خطوة.' },
  openPipeline: { en: uiText('generatedUi.u_dd98b46fbee7d162'), es: 'Abrir pipeline', pt: 'Abrir pipeline', pl: 'Otwórz pipeline', ru: 'Открыть воронку', de: 'Pipeline öffnen', fr: 'Ouvrir le pipeline', it: 'Apri pipeline', ja: 'パイプラインを開く', ko: '파이프라인 열기', ar: 'فتح خط المعالجة' },
  start:        { en: uiText('generatedUi.u_2e6ede9026a934b7'), es: 'Empieza con un prospecto', pt: 'Comece com um lead', pl: 'Zacznij od leada', ru: 'Начните с лида', de: 'Mit einem Lead beginnen', fr: 'Commencer par un prospect', it: 'Inizia da un lead', ja: 'リードから始める', ko: '리드로 시작하기', ar: 'ابدأ بعميل محتمل' },
  placeholder:  { en: uiText('generatedUi.u_d5abfa385cc3e90a'), es: 'Pega el sitio web o perfil del negocio…', pt: 'Cole o site ou perfil do negócio…', pl: 'Wklej adres strony lub profilu firmy…', ru: 'Вставьте сайт или профиль бизнеса…', de: 'Fügen Sie eine Unternehmenswebsite oder Profil-URL ein…', fr: 'Collez le site web d’une entreprise ou l’URL d’un profil…', it: 'Incolla il sito web di un’azienda o l’URL di un profilo…', ja: '企業のウェブサイトまたはプロフィールの URL を貼り付け…', ko: '비즈니스 웹사이트 또는 프로필 URL 붙여넣기…', ar: 'الصق موقع ويب لنشاط تجاري أو عنوان URL لملف تعريفي…' },
  analyze:      { en: uiText('generatedUi.u_b9d33481edd84a6b'), es: 'Analizar prospecto', pt: 'Analisar lead', pl: 'Analizuj lead', ru: 'Анализировать лид', de: 'Lead analysieren', fr: 'Analyser le prospect', it: 'Analizza lead', ja: 'リードを分析', ko: '리드 분석', ar: 'تحليل العميل المحتمل' },
  help:         { en: uiText('generatedUi.u_90aa76568373385a'), es: 'Esto abre Discovery y ejecuta el análisis real sobre la URL que ingreses.', pt: 'Isso abre o Discovery e executa a análise real na URL que você inserir.', pl: 'Otwiera Discovery i uruchamia analizę podanego adresu URL.', ru: 'Откроется Discovery и запустится анализ введённого URL.', de: 'Dies öffnet Discovery und führt die echte Analyse für die von Ihnen eingegebene URL aus.', fr: 'Cela ouvre Discovery et lance l\'analyse réelle sur l\'URL que vous saisissez.', it: 'Questo apre Discovery ed esegue l\'analisi reale sull\'URL che inserisci.', ja: 'Discovery が開き、入力した URL に対して実際の分析を実行します。', ko: 'Discovery가 열리고 입력한 URL에 대해 실제 분석을 실행합니다.', ar: 'يؤدي هذا إلى فتح Discovery وتشغيل التحليل الفعلي على URL الذي تُدخله.' },
  step:         { en: uiText('generatedUi.u_78e75a25d80993a5'), es: 'PASO', pt: 'ETAPA', pl: 'KROK', ru: 'ШАГ', de: 'SCHRITT', fr: 'ÉTAPE', it: 'PASSO', ja: 'ステップ', ko: '단계', ar: 'الخطوة' },
  open:         { en: uiText('generatedUi.u_1d2902ca81b6d2db'), es: 'Abrir →', pt: 'Abrir →', pl: 'Otwórz →', ru: 'Открыть →', de: 'Öffnen →', fr: 'Ouvrir →', it: 'Apri →', ja: '開く →', ko: '열기 →', ar: 'فتح →' },
  s1title:      { en: uiText('generatedUi.u_b55bb5be20928223'), es: 'Analizador', pt: 'Analisador', pl: 'Analizator', ru: 'Анализатор', de: 'Analysator', fr: 'Analyseur', it: 'Analizzatore', ja: 'アナライザー', ko: '분석기', ar: 'المحلّل' },
  s1prompt:     { en: uiText('generatedUi.u_3307cd27f83d56ef'), es: '¿A quién debe entender SignalBoost primero?', pt: 'Quem o SignalBoost deve entender primeiro?', pl: 'Kogo SignalBoost powinien poznać najpierw?', ru: 'Кого SignalBoost должен изучить первым?', de: 'Wen soll SignalBoost zuerst verstehen?', fr: 'Qui SignalBoost doit-il comprendre en premier ?', it: 'Chi dovrebbe capire per primo SignalBoost?', ja: 'SignalBoost が最初に理解すべき相手は誰ですか？', ko: 'SignalBoost가 누구를 먼저 이해해야 할까요?', ar: 'مَن يجب أن يفهمه SignalBoost أولًا؟' },
  s1detail:     { en: uiText('generatedUi.u_c2d828605fe1262c'), es: 'Pega un sitio web público, perfil de Google o red social. La IA resume el negocio y el disparador humano a usar.', pt: 'Cole um site público, perfil do Google ou rede social. A IA resume o negócio e o gatilho humano a usar.', pl: 'Wklej publiczną stronę, profil Google lub social media. AI podsumuje biznes i ludzki wyzwalacz do użycia.', ru: 'Вставьте сайт, профиль Google или соцсеть. ИИ резюмирует бизнес и человеческий триггер для контакта.', de: 'Fügen Sie eine öffentliche Website, ein Google-Profil oder eine Social-Media-Seite ein. Die KI fasst das Unternehmen und den zu nutzenden menschlichen Auslöser zusammen.', fr: 'Collez un site web public, un profil Google ou une page de réseau social. L’IA résume l’entreprise et le déclencheur humain à utiliser.', it: 'Incolla un sito web pubblico, un profilo Google o una pagina social. L’AI riassume l’attività e la leva umana da usare.', ja: '公開ウェブサイト、Googleプロフィール、またはソーシャルページを貼り付けてください。AIがビジネスの概要と活用すべき人間的なトリガーをまとめます。', ko: '공개 웹사이트, Google 프로필 또는 소셜 페이지를 붙여 넣으세요. AI가 비즈니스와 활용할 인간적 트리거를 요약합니다.', ar: 'الصق موقعًا إلكترونيًا عامًا أو ملف Google أو صفحة على وسائل التواصل الاجتماعي. يلخّص الذكاء الاصطناعي النشاط التجاري والمحفّز البشري الواجب استخدامه.' },
  s2title:      { en: uiText('generatedUi.u_b450645debe2cf0a'), es: 'Contactos', pt: 'Contatos', pl: 'Kontakty', ru: 'Контакты', de: 'Kontakte', fr: 'Contacts', it: 'Contatti', ja: '連絡先', ko: '연락처', ar: 'جهات الاتصال' },
  s2prompt:     { en: uiText('generatedUi.u_afdbbdfe02e24523'), es: '¿Qué prospectos analizados valen la pena?', pt: 'Quais leads analisados valem a pena?', pl: 'Które przeanalizowane leady są warte uwagi?', ru: 'Какие проанализированные лиды стоят внимания?', de: 'Welche analysierten Leads lohnen sich?', fr: 'Quels prospects analysés valent la peine d\'être suivis ?', it: 'Quali lead analizzati vale la pena seguire?', ja: '分析済みのリードのうち、追うべきものはどれですか？', ko: '분석된 리드 중 추진할 가치가 있는 것은 무엇입니까?', ar: 'ما العملاء المحتملون الذين تم تحليلهم ويستحقون المتابعة؟' },
  s2detail:     { en: uiText('generatedUi.u_0eca8a25856ff5f7'), es: 'Revisa los prospectos preparados por IA y aprueba los que encajan antes de enviar cualquier mensaje.', pt: 'Revise os leads preparados pela IA e aprove os que se encaixam antes de qualquer envio.', pl: 'Przejrzyj leady przygotowane przez AI i zatwierdź pasujące, zanim cokolwiek zostanie wysłane.', ru: 'Проверьте подготовленные ИИ лиды и одобрите подходящие до любой отправки.', de: 'Prüfen Sie KI-vorbereitete Leads und geben Sie die passenden frei, bevor Outreach versendet wird.', fr: 'Examinez les prospects préparés par l\'IA et approuvez ceux qui conviennent avant tout envoi de prospection.', it: 'Rivedi i lead preparati dall\'AI e approva quelli adatti prima che parta qualsiasi outreach.', ja: 'AI が準備した見込み客を確認し、アウトリーチを送信する前に適切なものを承認してください。', ko: 'AI가 준비한 리드를 검토하고 아웃리치를 보내기 전에 적합한 리드를 승인하세요.', ar: 'راجع العملاء المحتملين الذين أعدّهم الذكاء الاصطناعي واعتمد المناسبين منهم قبل إرسال أي تواصل.' },
  s3title:      { en: uiText('generatedUi.u_37e1c775f452d695'), es: 'Pipeline', pt: 'Pipeline', pl: 'Pipeline', ru: 'Воронка', de: 'Pipeline', fr: 'Pipeline', it: 'Pipeline', ja: 'パイプライン', ko: '파이프라인', ar: 'مسار العمل' },
  s3prompt:     { en: uiText('generatedUi.u_c630f4909d4b4d70'), es: '¿En qué punto del recorrido está cada prospecto?', pt: 'Onde está cada prospect na jornada?', pl: 'Na jakim etapie jest każdy prospekt?', ru: 'На каком этапе находится каждый потенциальный клиент?', de: 'Wo befindet sich jeder Interessent in der Customer Journey?', fr: 'Où en est chaque prospect dans son parcours ?', it: 'A che punto del percorso si trova ogni potenziale cliente?', ja: '各見込み客はジャーニーのどの段階にいますか？', ko: '각 잠재 고객은 여정의 어느 단계에 있습니까?', ar: 'أين يقف كل عميل محتمل في رحلته؟' },
  s3detail:     { en: uiText('generatedUi.u_aac58400af3fc9c5'), es: 'Sigue a los prospectos por descubierto, contactado, respondió, agendado y cerrado.', pt: 'Acompanhe os prospects por descoberto, contatado, respondeu, agendado e fechado.', pl: 'Śledź prospekty: odkryty, skontaktowany, odpowiedział, umówiony, zamknięty.', ru: 'Отслеживайте этапы: найден, контакт, ответил, встреча, закрыт.', de: 'Verfolgen Sie Interessenten über die Phasen entdeckt, kontaktiert, geantwortet, gebucht und abgeschlossen.', fr: 'Suivez vos prospects aux étapes découvert, contacté, a répondu, réservé et conclu.', it: 'Segui i potenziali clienti nelle fasi scoperto, contattato, ha risposto, prenotato e chiuso.', ja: '見込み客を「発見」「連絡済み」「返信あり」「予約済み」「成約」の各段階で追跡します。', ko: '잠재 고객을 발견, 연락함, 회신함, 예약됨, 성사됨 단계별로 추적합니다.', ar: 'تتبّع العملاء المحتملين عبر مراحل: مُكتشَف، وتم التواصل، وردّ، ومحجوز، ومُغلَق.' },
  s4title:      { en: uiText('generatedUi.u_2fde89461213f512'), es: 'Centro de prospección', pt: 'Central de prospecção', pl: 'Centrum kontaktów', ru: 'Центр аутрича', de: 'Outreach-Hub', fr: 'Hub de prospection', it: 'Hub di outreach', ja: 'アウトリーチ Hub', ko: '아웃리치 Hub', ar: 'Hub التواصل' },
  s4prompt:     { en: uiText('generatedUi.u_c43b8c07cb2ddb73'), es: '¿Quieres la vista completa?', pt: 'Quer a visão completa?', pl: 'Chcesz pełny przegląd?', ru: 'Нужен полный обзор?', de: 'Möchten Sie den vollständigen Überblick?', fr: 'Vous voulez la vue d’ensemble complète ?', it: 'Vuoi la panoramica completa?', ja: '全体の概要をご覧になりますか？', ko: '전체 개요를 보시겠어요?', ar: 'هل تريد النظرة العامة الكاملة؟' },
  s4detail:     { en: uiText('generatedUi.u_8ed7dc9685408711'), es: 'Conteos, prospectos recientes y acceso rápido a todas las herramientas en un solo lugar.', pt: 'Contagens, leads recentes e acesso rápido a todas as ferramentas em um só lugar.', pl: 'Liczby, ostatnie leady i szybki dostęp do wszystkich narzędzi w jednym miejscu.', ru: 'Статистика, последние лиды и быстрый доступ ко всем инструментам в одном месте.', de: 'Kennzahlen, aktuelle Leads und schneller Zugriff auf alle Outreach-Tools an einem Ort.', fr: 'Statistiques, prospects récents et accès rapide à tous les outils de prospection, au même endroit.', it: 'Conteggi, lead recenti e accesso rapido a tutti gli strumenti di outreach in un unico posto.', ja: '件数、最近のリード、すべてのアウトリーチツールへのクイックアクセスを1か所にまとめています。', ko: '건수, 최근 리드, 모든 아웃리치 도구에 대한 빠른 액세스를 한곳에서 제공합니다.', ar: 'الأعداد والعملاء المحتملون الجدد ووصول سريع إلى جميع أدوات التواصل في مكان واحد.' },
}

function c(key: string, lang: string): string {
  return (COPY as any)[key]?.[lang as Lang] ?? (COPY as any)[key]?.en ?? key
}

const stages = [
  { key: 's1', accent: 'var(--gold)', href: '/dashboard/outreach/discovery' },
  { key: 's2', accent: '#1af0ff', href: '/dashboard/outreach/contacts' },
  { key: 's3', accent: '#7dd3fc', href: '/dashboard/outreach/pipeline' },
  { key: 's4', accent: '#86efac', href: '/dashboard/outreach' },
]

export default function OutreachEnginePage() {
  const router = useRouter()
  const { lang } = useI18n()
  const [url, setUrl] = useState('')

  function analyze() {
    const value = url.trim()
    if (!value) { router.push('/dashboard/outreach/discovery'); return }
    // Hand off to the real Discovery analyzer with the URL prefilled.
    router.push(`/dashboard/outreach/discovery?url=${encodeURIComponent(value)}`)
  }

  return (
    <main className="sb-glass" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <span className="sb-eyebrow">{c('eyebrow', lang)}</span>
          <h1 className="sb-h2" style={{ marginTop: 10 }}>{c('title', lang)}</h1>
          <p className="sb-body" style={{ maxWidth: 680 }}>{c('subtitle', lang)}</p>
        </div>
        <Link className="sb-button-primary" href="/dashboard/outreach/pipeline">{c('openPipeline', lang)}</Link>
      </div>

      <section className="sb-card" style={{ padding: 20, marginBottom: 24 }}>
        <label className="sb-eyebrow" htmlFor="lead-url">{c('start', lang)}</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, marginTop: 12 }}>
          <input
            id="lead-url"
            className="sb-input"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') analyze() }}
            placeholder={c('placeholder', lang)}
            style={{ borderRadius: 16, padding: 14 }}
          />
          <button className="sb-button-primary" type="button" onClick={analyze}>{c('analyze', lang)}</button>
        </div>
        <p className="sb-caption" style={{ marginTop: 10 }}>{c('help', lang)}</p>
      </section>

      <section style={{ display: 'grid', gap: 16 }} aria-label={uiText('generatedUi.u_d9160601a53130b4')}>
        {stages.map((stage, index) => (
          <Link key={stage.key} href={stage.href} className="sb-card" style={{ padding: 20, display: 'grid', gridTemplateColumns: '72px minmax(0,1fr) auto', gap: 16, alignItems: 'center', textDecoration: 'none' }}>
            <div style={{ color: stage.accent, fontSize: 13, fontWeight: 950, letterSpacing: '.12em' }}>{c('step', lang)} {index + 1}</div>
            <div>
              <h2 className="sb-h3">{c(`${stage.key}title`, lang)}</h2>
              <p style={{ color: '#fff', fontWeight: 800, margin: '10px 0 4px' }}>{c(`${stage.key}prompt`, lang)}</p>
              <p className="sb-body" style={{ fontSize: 14, margin: 0 }}>{c(`${stage.key}detail`, lang)}</p>
            </div>
            <span style={{ color: stage.accent, fontWeight: 800 }}>{c('open', lang)}</span>
          </Link>
        ))}
      </section>
    </main>
  )
}
