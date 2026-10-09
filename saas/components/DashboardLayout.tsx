'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
const LANGS: Lang[] = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']
function c(obj: Record<Lang, string>, lang: Lang): string {
  return obj[lang] ?? obj.en
}

type ToneId = 'friendly' | 'professional' | 'playful'

// Nav items: [copyKey, href, icon]. Labels resolve from COPY.nav[key].
const sidebarGroups: { titleKey: keyof typeof COPY['groups']; items: [keyof typeof COPY['nav'], string, string][] }[] = [
  {
    titleKey: 'create',
    items: [
      ['dashboard', '/dashboard', '⌁'],
      ['promote', '/dashboard/promote', '📣'],
      ['builder', '/dashboard/builder', '🌐'],
      ['reviews', '/dashboard/reviews', '⭐'],
      ['audio', '/dashboard/audio', '🎙️'],
      ['video', '/dashboard/video', '🎬'],
    ],
  },
  {
    titleKey: 'outreach',
    items: [
      ['cosa', '/dashboard/cosa', '🧠'],
      ['engine', '/dashboard/outreach/outreach', '🧠'],
      ['discovery', '/dashboard/outreach/discovery', '🔎'],
      ['pipeline', '/dashboard/outreach/pipeline', '🧭'],
      ['contacts', '/dashboard/outreach/contacts', '🤝'],
    ],
  },
  {
    titleKey: 'operate',
    items: [
      ['metrics', '/dashboard/metrics', '📊'],
      ['data', '/dashboard/data', '🗄️'],
      ['settings', '/dashboard/settings', '⚙️'],
    ],
  },
]

const TONES: { id: ToneId; labelKey: keyof typeof COPY['tone'] }[] = [
  { id: 'friendly', labelKey: 'friendly' },
  { id: 'professional', labelKey: 'professional' },
  { id: 'playful', labelKey: 'playful' },
]

const COPY = {
  eyebrow: { en: uiText('generatedUi.u_ead331913b5ea9a1'), es: 'Tu centro de mando', pt: 'Seu centro de comando', pl: 'Twoje centrum dowodzenia', ru: 'Ваш командный центр', de: 'Ihre Kommandozentrale', fr: 'Votre centre de commande', it: 'Il tuo centro di comando', ja: 'あなたのコマンドセンター', ko: '나의 커맨드 센터', ar: 'مركز القيادة الخاص بك' },
  heading: { en: uiText('generatedUi.u_099f32145cf6503a'), es: '¿Qué hacemos crecer ahora?', pt: 'O que vamos crescer a seguir?', pl: 'Co rozwijamy dalej?', ru: 'Что будем развивать дальше?', de: 'Was sollen wir als Nächstes ausbauen?', fr: 'Que devrions-nous développer ensuite ?', it: 'Cosa dovremmo far crescere ora?', ja: '次に何を伸ばすべきでしょうか？', ko: '다음에는 무엇을 성장시켜야 할까요?', ar: 'ما الذي ينبغي أن ننمّيه بعد ذلك؟' },
  subhead: { en: uiText('generatedUi.u_41bf6e01005529c8'), es: 'Elige un espacio de trabajo enfocado. SignalBoost mantiene visible la siguiente mejor acción.', pt: 'Escolha um espaço de trabalho focado. O SignalBoost mantém a próxima melhor ação visível.', pl: 'Wybierz jedną skupioną przestrzeń roboczą. SignalBoost pokazuje następny najlepszy krok.', ru: 'Выберите один рабочий раздел. SignalBoost показывает следующее лучшее действие.', de: 'Wählen Sie einen fokussierten Arbeitsbereich. SignalBoost hält die nächstbeste Aktion sichtbar.', fr: 'Choisissez un espace de travail ciblé. SignalBoost garde la prochaine meilleure action visible.', it: 'Scegli un’area di lavoro mirata. SignalBoost mantiene visibile la prossima azione migliore.', ja: '集中するワークスペースを 1 つ選んでください。SignalBoost が次の最適なアクションを常に表示します。', ko: '집중할 작업 공간 하나를 선택하세요. SignalBoost가 다음 최선의 작업을 계속 표시합니다.', ar: 'اختر مساحة عمل واحدة مركّزة. يُبقي SignalBoost الإجراء الأفضل التالي ظاهرًا.' },
  livePreview: { en: uiText('generatedUi.u_f65ddc1ff37bb18e'), es: 'Vista previa en vivo', pt: 'Pré-visualização ao vivo', pl: 'Podgląd na żywo', ru: 'Живой предпросмотр', de: 'Live-Vorschau', fr: 'Aperçu en direct', it: 'Anteprima dal vivo', ja: 'ライブプレビュー', ko: '실시간 미리보기', ar: 'معاينة مباشرة' },
  guidance: { en: uiText('generatedUi.u_4902d3cefcfbc866'), es: 'Guía de IA antes de escribir', pt: 'Orientação de IA antes de digitar', pl: 'Wskazówki AI zanim zaczniesz pisać', ru: 'Подсказки ИИ ещё до ввода', de: 'KI-Hinweise, bevor Sie tippen', fr: 'Conseils de l’IA avant la saisie', it: 'Guida AI prima di scrivere', ja: '入力前の AI ガイダンス', ko: '입력 전 AI 안내', ar: 'إرشادات AI قبل الكتابة' },
  examplePrompt: {
    en: uiText('generatedUi.u_d0c52fa75707935a'),
    es: 'Prueba: «Encuentra compradores urgentes en mi ciudad, redacta una nota de contacto amable y pon la más fuerte en cola para aprobación.»',
    pt: 'Tente: “Encontre compradores urgentes na minha cidade, escreva uma nota de contato amigável e coloque a mais forte na fila para aprovação.”',
    pl: 'Spróbuj: „Znajdź pilnych kupujących w moim mieście, napisz przyjazną wiadomość i skieruj najlepszą do zatwierdzenia.”',
    ru: 'Попробуйте: «Найди срочных покупателей в моём городе, составь дружелюбное сообщение и поставь лучшее на одобрение.»',
    de: 'Probieren Sie: „Finde dringende Käufer in meiner Stadt, entwirf eine freundliche Outreach-Nachricht und reihe die stärkste zur Genehmigung ein.“',
    fr: 'Essayez : « Trouve des acheteurs pressés dans ma ville, rédige un message de prospection cordial et place le plus pertinent en file d’attente pour approbation. »',
    it: 'Prova: “Trova acquirenti urgenti nella mia città, scrivi un messaggio di outreach cordiale e metti in coda il più efficace per l’approvazione.”',
    ja: '例：「私の街で急ぎの購入者を見つけて、親しみやすいアウトリーチ文を下書きし、最も有力なものを承認待ちに入れて。」',
    ko: '예시: “우리 도시에서 급한 구매자를 찾아 친근한 아웃리치 메시지 초안을 작성하고, 가장 유력한 것을 승인 대기열에 넣어 줘.”',
    ar: 'جرّب: «ابحث عن مشترين عاجلين في مدينتي، واكتب مسودة رسالة تواصل ودّية، وضع أقواها في قائمة الانتظار للموافقة.»',
  },
  toneSelector: { en: uiText('generatedUi.u_06410c30f1872c0f'), es: 'Selector de tono', pt: 'Seletor de tom', pl: 'Wybór tonu', ru: 'Выбор тона', de: 'Tonauswahl', fr: 'Sélecteur de ton', it: 'Selettore del tono', ja: 'トーン選択', ko: '톤 선택기', ar: 'محدد النبرة' },
  aiFeedback: { en: uiText('generatedUi.u_d3be6e3c361f38a4'), es: 'Comentarios de IA', pt: 'Feedback da IA', pl: 'Opinia AI', ru: 'Обратная связь ИИ', de: 'KI-Feedback', fr: 'Retours de l’IA', it: 'Feedback dell’AI', ja: 'AI フィードバック', ko: 'AI 피드백', ar: 'ملاحظات الذكاء الاصطناعي' },
  groups: {
    create: { en: uiText('generatedUi.u_4759498ac2a719c6'), es: 'Crear', pt: 'Criar', pl: 'Twórz', ru: 'Создать', de: 'Erstellen', fr: 'Créer', it: 'Crea', ja: '作成', ko: '만들기', ar: 'إنشاء' },
    outreach: { en: uiText('generatedUi.u_a5803fdf10e57e66'), es: 'Alcance', pt: 'Alcance', pl: 'Kontakt', ru: 'Аутрич', de: 'Outreach', fr: 'Prospection', it: 'Outreach', ja: 'アウトリーチ', ko: '아웃리치', ar: 'التواصل' },
    operate: { en: uiText('generatedUi.u_58c3939c4ce986c8'), es: 'Operar', pt: 'Operar', pl: 'Zarządzaj', ru: 'Управление', de: 'Betreiben', fr: 'Exploiter', it: 'Gestisci', ja: '運用', ko: '운영', ar: 'تشغيل' },
  },
  nav: {
    dashboard: { en: uiText('generatedUi.u_67b696468610b879'), es: 'Panel', pt: 'Painel', pl: 'Panel', ru: 'Панель', de: 'Dashboard', fr: 'Tableau de bord', it: 'Dashboard', ja: 'ダッシュボード', ko: '대시보드', ar: 'لوحة المعلومات' },
    promote: { en: uiText('generatedUi.u_5834dab085442471'), es: 'Promocionar', pt: 'Promover', pl: 'Promuj', ru: 'Продвигать', de: 'Bewerben', fr: 'Promouvoir', it: 'Promuovi', ja: 'プロモーション', ko: '홍보', ar: 'ترويج' },
    builder: { en: uiText('generatedUi.u_090940e7325896cc'), es: 'Constructor', pt: 'Construtor', pl: 'Kreator', ru: 'Конструктор', de: 'Builder', fr: 'Créateur', it: 'Builder', ja: 'ビルダー', ko: '빌더', ar: 'المُنشئ' },
    reviews: { en: uiText('generatedUi.u_84cb7871b741c32e'), es: 'Reseñas', pt: 'Avaliações', pl: 'Opinie', ru: 'Отзывы', de: 'Bewertungen', fr: 'Avis', it: 'Recensioni', ja: 'レビュー', ko: '리뷰', ar: 'المراجعات' },
    audio: { en: uiText('generatedUi.u_bc1b88907d3b748a'), es: 'Audio', pt: 'Áudio', pl: 'Audio', ru: 'Аудио', de: 'Audio', fr: 'Audio', it: 'Audio', ja: 'オーディオ', ko: '오디오', ar: 'الصوت' },
    video: { en: uiText('generatedUi.u_d534be829e32196b'), es: 'Video', pt: 'Vídeo', pl: 'Wideo', ru: 'Видео', de: 'Video', fr: 'Vidéo', it: 'Video', ja: '動画', ko: '동영상', ar: 'فيديو' },
    cosa: { en: uiText('generatedUi.u_0fd2b25b2e05e978'), es: 'COSA Marketing y Ventas', pt: 'COSA Marketing e Vendas', pl: 'COSA Marketing i Sprzedaż', ru: 'COSA Маркетинг и продажи', de: 'Marketing & Vertrieb COSA', fr: 'COSA Marketing et Ventes', it: 'COSA Marketing e Vendite', ja: 'マーケティング＆セールス COSA', ko: '마케팅 및 영업 COSA', ar: 'COSA للتسويق والمبيعات' },
    engine: { en: uiText('generatedUi.u_8e75ebbdb21505d2'), es: 'Motor', pt: 'Motor', pl: 'Silnik', ru: 'Движок', de: 'Engine', fr: 'Moteur', it: 'Motore', ja: 'エンジン', ko: '엔진', ar: 'المحرك' },
    discovery: { en: uiText('generatedUi.u_80fc402133201fbe'), es: 'Descubrimiento', pt: 'Descoberta', pl: 'Odkrywanie', ru: 'Поиск', de: 'Erkundung', fr: 'Découverte', it: 'Scoperta', ja: 'ディスカバリー', ko: '탐색', ar: 'الاستكشاف' },
    pipeline: { en: uiText('generatedUi.u_37e1c775f452d695'), es: 'Embudo', pt: 'Funil', pl: 'Lejek', ru: 'Воронка', de: 'Pipeline', fr: 'Pipeline', it: 'Pipeline', ja: 'パイプライン', ko: '파이프라인', ar: 'مسار العمل' },
    contacts: { en: uiText('generatedUi.u_b450645debe2cf0a'), es: 'Contactos', pt: 'Contatos', pl: 'Kontakty', ru: 'Контакты', de: 'Kontakte', fr: 'Contacts', it: 'Contatti', ja: '連絡先', ko: '연락처', ar: 'جهات الاتصال' },
    metrics: { en: uiText('generatedUi.u_a58da793c7250f1b'), es: 'Métricas', pt: 'Métricas', pl: 'Metryki', ru: 'Метрики', de: 'Kennzahlen', fr: 'Métriques', it: 'Metriche', ja: 'メトリクス', ko: '지표', ar: 'المقاييس' },
    data: { en: uiText('generatedUi.u_cec3a9b89b2e3913'), es: 'Datos', pt: 'Dados', pl: 'Dane', ru: 'Данные', de: 'Daten', fr: 'Données', it: 'Dati', ja: 'データ', ko: '데이터', ar: 'البيانات' },
    settings: { en: uiText('generatedUi.u_74a883a037bc227f'), es: 'Ajustes', pt: 'Configurações', pl: 'Ustawienia', ru: 'Настройки', de: 'Einstellungen', fr: 'Paramètres', it: 'Impostazioni', ja: '設定', ko: '설정', ar: 'الإعدادات' },
  },
  tone: {
    friendly: { en: uiText('generatedUi.u_397423500c32c55a'), es: 'Amigable', pt: 'Amigável', pl: 'Przyjazny', ru: 'Дружелюбный', de: 'Freundlich', fr: 'Amical', it: 'Cordiale', ja: 'フレンドリー', ko: '친근함', ar: 'ودّي' },
    professional: { en: uiText('generatedUi.u_19c73a5cdf346d96'), es: 'Profesional', pt: 'Profissional', pl: 'Profesjonalny', ru: 'Профессиональный', de: 'Professional', fr: 'Professionnel', it: 'Professional', ja: 'プロフェッショナル', ko: '프로페셔널', ar: 'احترافي' },
    playful: { en: uiText('generatedUi.u_dde9ac29785b19e6'), es: 'Divertido', pt: 'Descontraído', pl: 'Żartobliwy', ru: 'Игривый', de: 'Verspielt', fr: 'Ludique', it: 'Giocoso', ja: '遊び心のある', ko: '장난스러운', ar: 'مرِح' },
  },
  feedback: {
    friendly: {
      en: uiText('generatedUi.u_8fba0a7decf6a63c'),
      es: 'Esta campaña se siente cálida y cercana: añade un testimonio breve para generar aún más confianza.',
      pt: 'Esta campanha parece calorosa e acessível — adicione um depoimento curto para gerar ainda mais confiança.',
      pl: 'Ta kampania jest ciepła i przyjazna — dodaj krótką opinię, aby zbudować jeszcze większe zaufanie.',
      ru: 'Эта кампания тёплая и располагающая — добавьте короткий отзыв, чтобы вызвать ещё больше доверия.',
      de: 'Diese Kampagne wirkt herzlich und zugänglich – fügen Sie ein kurzes Kundenzitat hinzu, um noch mehr Vertrauen aufzubauen.',
      fr: 'Cette campagne paraît chaleureuse et accessible — ajoutez un court témoignage pour renforcer encore la confiance.',
      it: 'Questa campagna risulta calorosa e accessibile: aggiungi una breve testimonianza per creare ancora più fiducia.',
      ja: 'このキャンペーンは温かく親しみやすい印象です。短いお客様の声を加えると、さらに信頼感が高まります。',
      ko: '이 캠페인은 따뜻하고 친근한 느낌을 줍니다. 짧은 고객 후기를 추가하면 신뢰를 더욱 높일 수 있습니다.',
      ar: 'تبدو هذه الحملة دافئة وودودة — أضف شهادة قصيرة لبناء مزيد من الثقة.',
    },
    professional: {
      en: uiText('generatedUi.u_60e04693289843e5'),
      es: 'Esta campaña resulta creíble y clara: ajusta la llamada a la acción para aumentar las conversiones.',
      pt: 'Esta campanha parece crível e clara — refine a chamada para ação para aumentar as conversões.',
      pl: 'Ta kampania jest wiarygodna i klarowna — dopracuj wezwanie do działania, aby zwiększyć konwersję.',
      ru: 'Эта кампания выглядит убедительно и ясно — усильте призыв к действию, чтобы повысить конверсию.',
      de: 'Diese Kampagne wirkt glaubwürdig und klar – schärfen Sie den Call-to-Action, um die Conversions zu steigern.',
      fr: 'Cette campagne paraît crédible et claire — affinez l’appel à l’action pour augmenter les conversions.',
      it: 'Questa campagna risulta credibile e chiara — rendi più incisiva la call to action per aumentare le conversioni.',
      ja: 'このキャンペーンは信頼性が高く明確です — コンバージョンを高めるため、CTA を引き締めましょう。',
      ko: '이 캠페인은 신뢰감 있고 명확합니다 — 전환율을 높이려면 CTA를 더 다듬으세요.',
      ar: 'تبدو هذه الحملة موثوقة وواضحة — أحكم دعوة الإجراء لزيادة التحويلات.',
    },
    playful: {
      en: uiText('generatedUi.u_18183ca0427adcda'),
      es: 'Esta campaña es divertida y enérgica: mantén un beneficio concreto al frente para que el mensaje funcione.',
      pt: 'Esta campanha é divertida e enérgica — mantenha um benefício concreto em destaque para a mensagem funcionar.',
      pl: 'Ta kampania jest zabawna i energiczna — zostaw jeden konkretny atut na początku, aby przekaz trafił.',
      ru: 'Эта кампания весёлая и энергичная — оставьте одну конкретную выгоду на виду, чтобы сообщение сработало.',
      de: 'Diese Kampagne wirkt unterhaltsam und energiegeladen – stellen Sie einen konkreten Vorteil an den Anfang, damit die Botschaft trotzdem ankommt.',
      fr: 'Cette campagne est ludique et dynamique : mettez un avantage concret en avant pour que le message porte toujours.',
      it: 'Questa campagna risulta divertente ed energica: metti in primo piano un vantaggio concreto, così il messaggio arriva comunque.',
      ja: 'このキャンペーンは楽しくエネルギッシュな印象です。メッセージがしっかり伝わるよう、具体的なメリットを 1 つ冒頭に置きましょう。',
      ko: '이 캠페인은 재미있고 활기찬 느낌입니다. 메시지가 확실히 전달되도록 구체적인 혜택 하나를 앞부분에 두세요.',
      ar: 'تبدو هذه الحملة ممتعة ومفعمة بالحيوية؛ أبقِ فائدة ملموسة واحدة في المقدمة حتى تظل الرسالة مؤثرة.',
    },
  },
} as const

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { lang: rawLang } = useI18n()
  const lang: Lang = (LANGS as string[]).includes(rawLang) ? (rawLang as Lang) : 'en'
  const [tone, setTone] = useState<ToneId>('friendly')

  return (
    <div className="sb-dashboard-shell">
      <aside className="sb-sidebar" aria-label={uiText('generatedUi.u_653ff8fb00079b82')}>
        <div className="sb-sidebar__header">
          <span className="sb-eyebrow">{c(COPY.eyebrow, lang)}</span>
          <h2>{c(COPY.heading, lang)}</h2>
          <p>{c(COPY.subhead, lang)}</p>
        </div>

        <nav className="sb-sidebar__nav">
          {sidebarGroups.map(group => (
            <section key={group.titleKey} className="sb-sidebar__group">
              <p>{c(COPY.groups[group.titleKey], lang)}</p>
              {group.items.map(([key, href, icon]) => (
                <Link key={href} href={href} className="sb-sidebar__link">
                  <span>{icon}</span>
                  {c(COPY.nav[key], lang)}
                </Link>
              ))}
            </section>
          ))}
        </nav>
      </aside>

      <main className="sb-dashboard-main">{children}</main>

      <aside className="sb-live-preview" aria-label={uiText('generatedUi.u_66cdc081694b3f0b')}>
        <span className="sb-eyebrow">{c(COPY.livePreview, lang)}</span>
        <h3>{c(COPY.guidance, lang)}</h3>
        <p>{c(COPY.examplePrompt, lang)}</p>
        <div className="sb-tone-card">
          <span>{c(COPY.toneSelector, lang)}</span>
          <div role="group" aria-label={c(COPY.toneSelector, lang)}>
            {TONES.map(({ id, labelKey }) => {
              const active = tone === id
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTone(id)}
                  style={
                    active
                      ? { borderColor: '#ffc300', color: '#ffc300', background: 'rgba(255,195,0,.12)' }
                      : undefined
                  }
                >
                  {c(COPY.tone[labelKey], lang)}
                </button>
              )
            })}
          </div>
        </div>
        <div className="sb-ai-feedback">
          <strong>{c(COPY.aiFeedback, lang)}</strong>
          <p>{c(COPY.feedback[tone], lang)}</p>
        </div>
      </aside>
    </div>
  )
}
