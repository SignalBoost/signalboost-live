'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import OrchestrationPanel from '@/components/orchestration/OrchestrationPanel'
import { useI18n } from '@/components/i18n/I18nProvider'
import { supabase } from '@/utils/supabase/client'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
type ItLevel = 'beginner' | 'intermediate' | 'advanced'
type WorkshopProfile = { it_level: ItLevel | null; role: string | null; tone_preference: string | null }

const COPY = {
  eyebrow:        { en: uiText('generatedUi.u_dbda3b1dfdc32198'), es: 'Taller Aprendiz', pt: 'Oficina Aprendiz', pl: 'Warsztat Adepta', ru: 'Мастерская', de: 'Werkstattlehrling', fr: 'Apprenti d’atelier', it: 'Apprendista di bottega', ja: '工房の見習い', ko: '공방 견습생', ar: 'متدرّب الورشة' },
  title:          { en: uiText('generatedUi.u_dbda3b1dfdc32198'), es: 'Taller Aprendiz', pt: 'Oficina Aprendiz', pl: 'Warsztat Adepta', ru: 'Мастерская стажёра', de: 'Werkstattlehrling', fr: 'Apprenti d’atelier', it: 'Apprendista di bottega', ja: '工房の見習い', ko: '공방 견습생', ar: 'متدرّب الورشة' },
  toneLabel:      { en: uiText('generatedUi.u_c2c8b72e302ec730'), es: 'Tono', pt: 'Tom', pl: 'Ton', ru: 'Тон', de: 'Tonalität', fr: 'Ton', it: 'Tono', ja: 'トーン', ko: '톤', ar: 'النبرة' },
  roleLabel:      { en: uiText('generatedUi.u_14736a2eb9f4159f'), es: 'Rol', pt: 'Função', pl: 'Rola', ru: 'Роль', de: 'Rolle', fr: 'Rôle', it: 'Ruolo', ja: 'ロール', ko: '역할', ar: 'الدور' },
  notSet:         { en: uiText('generatedUi.u_1aef939917215ce7'), es: 'no definido', pt: 'não definido', pl: 'nie ustawiono', ru: 'не задано', de: 'nicht festgelegt', fr: 'non défini', it: 'non impostato', ja: '未設定', ko: '설정되지 않음', ar: 'غير محدد' },
  tutorialsTitle: { en: uiText('generatedUi.u_9f535c687e1b91f5'), es: 'Tutoriales de nuevos servicios', pt: 'Tutoriais de novos serviços', pl: 'Nowe samouczki usług', ru: 'Обучающие материалы', de: 'Neue Service-Tutorials', fr: 'Nouveaux tutoriels de service', it: 'Nuovi tutorial sui servizi', ja: '新しいサービスチュートリアル', ko: '새 서비스 튜토리얼', ar: 'دروس تعليمية جديدة للخدمات' },
  startTutorial:  { en: uiText('generatedUi.u_0dfe20f03e454830'), es: 'Iniciar tutorial', pt: 'Iniciar tutorial', pl: 'Rozpocznij samouczek', ru: 'Начать обучение', de: 'Tutorial starten', fr: 'Démarrer le tutoriel', it: 'Avvia tutorial', ja: 'チュートリアルを開始', ko: '튜토리얼 시작', ar: 'بدء البرنامج التعليمي' },
  visualExamples: { en: uiText('generatedUi.u_18fd23dd54ed3725'), es: 'Ejemplos visuales', pt: 'Exemplos visuais', pl: 'Przykłady wizualne', ru: 'Визуальные примеры', de: 'Visuelle Beispiele', fr: 'Exemples visuels', it: 'Esempi visivi', ja: 'ビジュアル例', ko: '시각적 예시', ar: 'أمثلة مرئية' },
  modules: {
    website:       { en: uiText('generatedUi.u_74e13bcbc1c16774'), es: 'Constructor de sitios', pt: 'Construtor de sites', pl: 'Kreator stron', ru: 'Конструктор сайтов', de: 'Website-Builder', fr: 'Créateur de sites web', it: 'Creatore di siti web', ja: 'ウェブサイトビルダー', ko: '웹사이트 빌더', ar: 'منشئ المواقع الإلكترونية' },
    podcast:       { en: uiText('generatedUi.u_27a723d62938b468'), es: 'Podcast', pt: 'Podcast', pl: 'Podcast', ru: 'Подкаст', de: 'Podcast', fr: 'Podcast', it: 'Podcast', ja: 'ポッドキャスト', ko: '팟캐스트', ar: 'بودكاست' },
    outreach:      { en: uiText('generatedUi.u_a5803fdf10e57e66'), es: 'Prospección', pt: 'Prospecção', pl: 'Outreach', ru: 'Аутрич', de: 'Outreach', fr: 'Prospection', it: 'Outreach', ja: 'アウトリーチ', ko: '아웃리치', ar: 'التواصل' },
    reviews:       { en: uiText('generatedUi.u_84cb7871b741c32e'), es: 'Reseñas', pt: 'Avaliações', pl: 'Opinie', ru: 'Отзывы', de: 'Bewertungen', fr: 'Avis', it: 'Recensioni', ja: 'レビュー', ko: '리뷰', ar: 'المراجعات' },
    video:         { en: uiText('generatedUi.u_d534be829e32196b'), es: 'Video', pt: 'Vídeo', pl: 'Wideo', ru: 'Видео', de: 'Video', fr: 'Vidéo', it: 'Video', ja: '動画', ko: '동영상', ar: 'فيديو' },
    improve:       { en: uiText('generatedUi.u_6e4835632d59210b'), es: 'Mejorar sitio', pt: 'Melhorar site', pl: 'Ulepsz stronę', ru: 'Улучшить сайт', de: 'Website verbessern', fr: 'Améliorer le site web', it: 'Migliora sito web', ja: 'ウェブサイトを改善', ko: '웹사이트 개선', ar: 'تحسين الموقع الإلكتروني' },
    podcastStudio: { en: uiText('generatedUi.u_170d86d7a92db466'), es: 'Optimizar Podcast Studio', pt: 'Otimizar Podcast Studio', pl: 'Optymalizuj Podcast Studio', ru: 'Оптимизация студии', de: 'Podcast Studio optimieren', fr: 'Optimiser Podcast Studio', it: 'Ottimizza Podcast Studio', ja: 'Podcast Studio を最適化', ko: 'Podcast Studio 최적화', ar: 'تحسين Podcast Studio' },
  },
  levels: {
    beginner: {
      badge:    { en: uiText('generatedUi.u_4aa4bd5b9bf1feee'), es: 'Ruta guiada para principiantes', pt: 'Caminho guiado para iniciantes', pl: 'Ścieżka dla początkujących', ru: 'Путь для начинающих', de: 'Geführter Einsteigerpfad', fr: 'Parcours guidé pour débutants', it: 'Percorso guidato per principianti', ja: '初心者向けガイド付きパス', ko: '초보자용 안내 경로', ar: 'مسار إرشادي للمبتدئين' },
      subtitle: { en: uiText('generatedUi.u_5a0931af8c6fa890'), es: 'Cada módulo incluye definiciones simples, valores seguros y un paso a la vez.', pt: 'Cada módulo inclui definições simples, padrões seguros e um passo de cada vez.', pl: 'Każdy moduł zawiera proste definicje, bezpieczne ustawienia i jeden krok na raz.', ru: 'Каждый модуль содержит простые определения, безопасные настройки и пошаговые инструкции.', de: 'Jedes Modul enthält verständliche Definitionen, sichere Standardwerte und führt Schritt für Schritt vor.', fr: 'Chaque module comprend des définitions en langage clair, des valeurs par défaut sûres et une étape à la fois.', it: 'Ogni modulo include definizioni in linguaggio semplice, impostazioni predefinite sicure e un passo alla volta.', ja: '各モジュールには、平易な言葉での定義、安全なデフォルト設定、一度に一つずつのステップが含まれています。', ko: '모든 모듈에는 쉬운 말로 된 정의, 안전한 기본값, 한 번에 한 단계씩 진행하는 방식이 포함되어 있습니다.', ar: 'تتضمن كل وحدة تعريفات بلغة بسيطة، وإعدادات افتراضية آمنة، وخطوة واحدة في كل مرة.' },
      tasks: {
        t1: { en: uiText('generatedUi.u_f8cd427fb753b841'), es: 'Comienza con la lista de lanzamiento', pt: 'Comece com a lista de lançamento', pl: 'Zacznij od listy startowej', ru: 'Начните со списка запуска', de: 'Beginnen Sie mit der Launch-Checkliste', fr: 'Commencez par la checklist de lancement', it: 'Inizia con la checklist di lancio', ja: 'ローンチチェックリストから始める', ko: '출시 체크리스트로 시작하기', ar: 'ابدأ بقائمة التحقق الخاصة بالإطلاق' },
        t2: { en: uiText('generatedUi.u_2a09af57e900b770'), es: 'Usa plantillas antes de configuraciones avanzadas', pt: 'Use modelos antes das configurações avançadas', pl: 'Używaj szablonów przed zaawansowanymi ustawieniami', ru: 'Используйте шаблоны перед расширенными настройками', de: 'Vorlagen vor erweiterten Einstellungen verwenden', fr: 'Utiliser les modèles avant les paramètres avancés', it: 'Usa i modelli prima delle impostazioni avanzate', ja: '詳細設定の前にテンプレートを使用', ko: '고급 설정 전에 템플릿 사용', ar: 'استخدم القوالب قبل الإعدادات المتقدمة' },
        t3: { en: uiText('generatedUi.u_83c0faafdc0ac00f'), es: 'Revisa cada recomendación antes de publicar', pt: 'Revise cada recomendação antes de publicar', pl: 'Przejrzyj każdą rekomendację przed publikacją', ru: 'Проверяйте каждую рекомендацию перед публикацией', de: 'Prüfen Sie jede Empfehlung vor der Veröffentlichung', fr: 'Vérifiez chaque recommandation avant publication', it: 'Rivedi ogni raccomandazione prima di pubblicarla', ja: '公開前に各推奨事項を確認してください', ko: '게시 전에 각 권장 사항을 검토하세요', ar: 'راجع كل توصية قبل النشر' },
      },
    },
    intermediate: {
      badge:    { en: uiText('generatedUi.u_58deb260712d4df5'), es: 'Ruta equilibrada de construcción', pt: 'Caminho equilibrado de construção', pl: 'Zrównoważona ścieżka budowania', ru: 'Сбалансированный путь', de: 'Ausgewogener Builder-Pfad', fr: 'Parcours de création équilibré', it: 'Percorso di costruzione bilanciato', ja: 'バランス型ビルダーパス', ko: '균형 잡힌 빌더 경로', ar: 'مسار بناء متوازن' },
      subtitle: { en: uiText('generatedUi.u_e19040817f7523b7'), es: 'Los módulos combinan explicaciones guiadas con atajos prácticos y flujos configurables.', pt: 'Os módulos combinam explicações guiadas com atalhos práticos e fluxos configuráveis.', pl: 'Moduły łączą wyjaśnienia z praktycznymi skrótami i konfigurowalnymi przepływami.', ru: 'Модули сочетают пошаговые объяснения с практическими ярлыками и настраиваемыми процессами.', de: 'Module verbinden geführte Erklärungen mit praktischen Abkürzungen und konfigurierbaren Workflows.', fr: 'Les modules associent des explications guidées à des raccourcis pratiques et des workflows configurables.', it: 'I moduli uniscono spiegazioni guidate a scorciatoie pratiche e flussi di lavoro configurabili.', ja: 'モジュールは、ガイド付きの説明と実用的なショートカット、設定可能なワークフローを組み合わせています。', ko: '모듈은 안내식 설명과 실용적인 바로가기, 구성 가능한 워크플로를 결합합니다.', ar: 'تمزج الوحدات بين الشروح الموجّهة والاختصارات العملية وسير العمل القابل للتهيئة.' },
      tasks: {
        t1: { en: uiText('generatedUi.u_7fe4e92898489699'), es: 'Compara las configuraciones recomendadas', pt: 'Compare as configurações recomendadas', pl: 'Porównaj zalecane ustawienia', ru: 'Сравните рекомендуемые настройки', de: 'Empfohlene Einstellungen vergleichen', fr: 'Comparer les paramètres recommandés', it: 'Confronta le impostazioni consigliate', ja: '推奨設定を比較', ko: '권장 설정 비교', ar: 'مقارنة الإعدادات الموصى بها' },
        t2: { en: uiText('generatedUi.u_e1ea6803e8585518'), es: 'Personaliza las reglas de automatización', pt: 'Personalize as regras de automação', pl: 'Dostosuj reguły automatyzacji', ru: 'Настройте правила автоматизации', de: 'Automatisierungsregeln anpassen', fr: 'Personnaliser les règles d’automatisation', it: 'Personalizza le regole di automazione', ja: '自動化ルールをカスタマイズ', ko: '자동화 규칙 사용자 지정', ar: 'تخصيص قواعد الأتمتة' },
        t3: { en: uiText('generatedUi.u_599ad3b4ed5d1263'), es: 'Revisa los análisis después de cada lanzamiento', pt: 'Revise as análises após cada lançamento', pl: 'Przeglądaj analizy po każdym uruchomieniu', ru: 'Анализируйте результаты после каждого запуска', de: 'Analysen nach jedem Launch prüfen', fr: 'Examiner les analyses après chaque lancement', it: 'Rivedi le analisi dopo ogni lancio', ja: '各ローンチ後に分析を確認', ko: '각 출시 후 분석 검토', ar: 'مراجعة التحليلات بعد كل إطلاق' },
      },
    },
    advanced: {
      badge:    { en: uiText('generatedUi.u_89387721d28b0a5f'), es: 'Ruta de operador avanzado', pt: 'Caminho de operador avançado', pl: 'Ścieżka zaawansowanego operatora', ru: 'Расширенный путь оператора', de: 'Erweiterter Operator-Pfad', fr: 'Parcours opérateur avancé', it: 'Percorso operatore avanzato', ja: '上級オペレーター向けパス', ko: '고급 운영자 경로', ar: 'مسار المشغّل المتقدم' },
      subtitle: { en: uiText('generatedUi.u_2e717bfdc31538fb'), es: 'Los módulos enfatizan diagnósticos, verificaciones de despliegue, registros, integraciones y ejecución rápida.', pt: 'Os módulos enfatizam diagnósticos, verificações de implantação, logs, integrações e execução rápida.', pl: 'Moduły kładą nacisk na diagnostykę, sprawdzanie wdrożeń, logi, integracje i szybkie wykonanie.', ru: 'Модули акцентируют диагностику, проверки развёртывания, логи, интеграции и быстрое выполнение.', de: 'Die Module legen den Schwerpunkt auf Diagnose, Bereitstellungsprüfungen, Protokolle, Integrationen und schnelle Ausführung.', fr: 'Les modules mettent l\'accent sur les diagnostics, les vérifications de déploiement, les journaux, les intégrations et l\'exécution rapide.', it: 'I moduli privilegiano diagnostica, controlli di distribuzione, log, integrazioni ed esecuzione rapida.', ja: 'モジュールは診断、デプロイチェック、ログ、連携、迅速な実行に重点を置いています。', ko: '모듈은 진단, 배포 점검, 로그, 통합, 빠른 실행에 중점을 둡니다.', ar: 'تركّز الوحدات على التشخيص وفحوصات النشر والسجلات والتكاملات والتنفيذ السريع.' },
      tasks: {
        t1: { en: uiText('generatedUi.u_a58d8b4fcd17e9f8'), es: 'Inspecciona los registros de despliegue y API', pt: 'Inspecione logs de implantação e API', pl: 'Sprawdzaj logi wdrożeń i API', ru: 'Проверяйте логи развёртывания и API', de: 'Deployment- und API-Protokolle prüfen', fr: 'Inspecter les journaux de déploiement et d’API', it: 'Ispeziona i log di deployment e API', ja: 'デプロイと API のログを確認', ko: '배포 및 API 로그 검사', ar: 'فحص سجلات النشر وAPI' },
        t2: { en: uiText('generatedUi.u_241cd000df0f4b51'), es: 'Ajusta integraciones y fuentes de datos', pt: 'Ajuste integrações e fontes de dados', pl: 'Dostrajaj integracje i źródła danych', ru: 'Настройте интеграции и источники данных', de: 'Integrationen und Datenquellen abstimmen', fr: 'Ajuster les intégrations et les sources de données', it: 'Regola integrazioni e fonti dati', ja: '連携とデータソースを調整', ko: '통합 및 데이터 소스 조정', ar: 'ضبط عمليات التكامل ومصادر البيانات' },
        t3: { en: uiText('generatedUi.u_51607e5cb0fb16f9'), es: 'Valida los presupuestos de rendimiento antes del lanzamiento', pt: 'Valide os orçamentos de desempenho antes do lançamento', pl: 'Sprawdzaj budżety wydajności przed wydaniem', ru: 'Проверяйте бюджеты производительности перед релизом', de: 'Performance-Budgets vor dem Release validieren', fr: 'Valider les budgets de performance avant la mise en production', it: 'Convalida i budget di prestazioni prima del rilascio', ja: 'リリース前にパフォーマンス予算を検証', ko: '릴리스 전 성능 예산 검증', ar: 'التحقق من ميزانيات الأداء قبل الإصدار' },
      },
    },
  },
  tutorials: {
    improve: {
      title: { en: uiText('generatedUi.u_6e4835632d59210b'), es: 'Mejorar sitio web', pt: 'Melhorar site', pl: 'Ulepsz stronę', ru: 'Улучшить сайт', de: 'Website verbessern', fr: 'Améliorer le site web', it: 'Migliora sito web', ja: 'ウェブサイトを改善', ko: '웹사이트 개선', ar: 'تحسين الموقع الإلكتروني' },
      step1: { en: uiText('generatedUi.u_9adafb416c5c146c'), es: 'Pega la URL del sitio e identifica el objetivo de conversión principal.', pt: 'Cole a URL do site e identifique o objetivo de conversão principal.', pl: 'Wklej URL strony i zidentyfikuj główny cel konwersji.', ru: 'Вставьте URL сайта и определите основную цель конверсии.', de: 'Fügen Sie die Website-URL ein und bestimmen Sie das primäre Konversionsziel.', fr: 'Collez l\'URL du site web et identifiez l\'objectif de conversion principal.', it: 'Incolla l\'URL del sito web e identifica l\'obiettivo di conversione principale.', ja: 'ウェブサイトの URL を貼り付け、主なコンバージョン目標を特定してください。', ko: '웹사이트 URL을 붙여 넣고 주요 전환 목표를 지정하세요.', ar: 'الصق URL الموقع الإلكتروني وحدّد هدف التحويل الأساسي.' },
      step2: { en: uiText('generatedUi.u_ea36583a41b28cb2'), es: 'Revisa ejemplos visuales para hero, CTA, SEO, accesibilidad y velocidad.', pt: 'Revise exemplos visuais para hero, CTA, SEO, acessibilidade e velocidade.', pl: 'Przejrzyj przykłady wizualne dla hero, CTA, SEO, dostępności i szybkości.', ru: 'Изучите визуальные примеры для hero, CTA, SEO, доступности и скорости.', de: 'Sehen Sie sich visuelle Beispiele für Hero-, CTA-, SEO-, Barrierefreiheits- und Geschwindigkeitskorrekturen an.', fr: 'Consultez des exemples visuels de corrections pour la section hero, les CTA, le SEO, l’accessibilité et la vitesse.', it: 'Esamina esempi visivi di correzioni per hero, CTA, SEO, accessibilità e velocità.', ja: 'ヒーロー、CTA、SEO、アクセシビリティ、速度の修正例をビジュアルで確認できます。', ko: '히어로, CTA, SEO, 접근성 및 속도 개선의 시각적 예시를 검토하세요.', ar: 'راجع أمثلة مرئية لإصلاحات القسم الرئيسي وCTA وSEO وإمكانية الوصول والسرعة.' },
      step3: { en: uiText('generatedUi.u_7a50e421ef0647b9'), es: 'Aplica la lista priorizada y abre el módulo de optimización.', pt: 'Aplique a lista priorizada e abra o módulo de otimização.', pl: 'Zastosuj priorytetową listę i otwórz moduł optymalizacji.', ru: 'Примените приоритетный список и откройте модуль оптимизации.', de: 'Wenden Sie die priorisierte Checkliste an und öffnen Sie das Optimierungsmodul.', fr: 'Appliquez la liste de contrôle priorisée et ouvrez le module d\'optimisation.', it: 'Applica la checklist prioritizzata e apri il modulo di ottimizzazione.', ja: '優先順位付けされたチェックリストを適用し、最適化モジュールを開きます。', ko: '우선순위가 지정된 체크리스트를 적용하고 최적화 모듈을 여세요.', ar: 'طبّق قائمة التحقق ذات الأولوية وافتح وحدة التحسين.' },
    },
    podcastStudio: {
      title: { en: uiText('generatedUi.u_170d86d7a92db466'), es: 'Optimizar Podcast Studio', pt: 'Otimizar Podcast Studio', pl: 'Optymalizuj Podcast Studio', ru: 'Оптимизация студии подкастов', de: 'Podcast Studio optimieren', fr: 'Optimiser Podcast Studio', it: 'Ottimizza Podcast Studio', ja: 'Podcast Studio を最適化', ko: 'Podcast Studio 최적화', ar: 'تحسين Podcast Studio' },
      step1: { en: uiText('generatedUi.u_aed457cd7d7bd7d8'), es: 'Sube o enlaza un episodio y confirma el objetivo del programa.', pt: 'Faça upload ou vincule um episódio e confirme o objetivo do programa.', pl: 'Prześlij lub podlinkuj odcinek i potwierdź cel programu.', ru: 'Загрузите или свяжите эпизод и подтвердите цель шоу.', de: 'Laden Sie eine Episode hoch oder verlinken Sie sie, und bestätigen Sie das Ziel der Sendung.', fr: 'Importez ou liez un épisode et confirmez l\'objectif de l\'émission.', it: 'Carica o collega un episodio e conferma l\'obiettivo dello show.', ja: 'エピソードをアップロードまたはリンクし、番組の目標を確認してください。', ko: '에피소드를 업로드하거나 연결하고 프로그램 목표를 확인하세요.', ar: 'ارفع حلقة أو اربطها وأكّد هدف البرنامج.' },
      step2: { en: uiText('generatedUi.u_46d9a374eca8bcd4'), es: 'Revisa ejemplos visuales para limpieza de transcripción, clips cortos, títulos y metadatos.', pt: 'Revise exemplos visuais para limpeza de transcrição, clipes curtos, títulos e metadados.', pl: 'Przejrzyj przykłady wizualne dla czyszczenia transkryptów, krótkich klipów, tytułów i metadanych.', ru: 'Изучите визуальные примеры для очистки транскриптов, коротких клипов, заголовков и метаданных.', de: 'Sehen Sie sich visuelle Beispiele für Transkriptbereinigung, kurze Clips, Titel und Metadaten an.', fr: 'Consultez des exemples visuels de nettoyage de transcription, de clips courts, de titres et de métadonnées.', it: 'Esamina esempi visivi di pulizia delle trascrizioni, clip brevi, titoli e metadati.', ja: '文字起こしのクリーンアップ、ショートクリップ、タイトル、メタデータの視覚的な例を確認します。', ko: '스크립트 정리, 짧은 클립, 제목 및 메타데이터의 시각적 예시를 검토하세요.', ar: 'راجع أمثلة مرئية لتنظيف النصوص المفرّغة والمقاطع القصيرة والعناوين والبيانات الوصفية.' },
      step3: { en: uiText('generatedUi.u_f922e1c78dcaed62'), es: 'Aprueba la lista de distribución y abre el optimizador del estudio de podcast.', pt: 'Aprove a lista de distribuição e abra o otimizador do estúdio de podcast.', pl: 'Zatwierdź listę dystrybucji i otwórz optymalizator studia podcastów.', ru: 'Утвердите список распространения и откройте оптимизатор студии подкастов.', de: 'Genehmigen Sie die Verteilungscheckliste und öffnen Sie den Podcast-Studio-Optimierer.', fr: 'Approuvez la checklist de diffusion et ouvrez l\'optimiseur du studio podcast.', it: 'Approva la checklist di distribuzione e apri l\'ottimizzatore dello studio podcast.', ja: '配信チェックリストを承認し、ポッドキャストスタジオのオプティマイザーを開きます。', ko: '배포 체크리스트를 승인하고 팟캐스트 스튜디오 최적화 도구를 여세요.', ar: 'وافق على قائمة التحقق الخاصة بالتوزيع وافتح أداة تحسين استوديو البودكاست.' },
    },
  },
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

export default function ApprenticeWorkshopPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang

  const [profile, setProfile] = useState<WorkshopProfile>({ it_level: 'beginner', role: null, tone_preference: 'friendly' })

  useEffect(() => {
    async function loadProfile() {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return
      const { data } = await supabase.from('user_profile').select('it_level,role,tone_preference').eq('user_id', auth.user.id).maybeSingle()
      if (data) setProfile(data as WorkshopProfile)
    }
    loadProfile()
  }, [])

  const level = profile.it_level || 'beginner'
  const levelData = COPY.levels[level]

  const moduleItems = useMemo(() => [
    { href: '/dashboard/builder',           key: 'website',       depth: level === 'advanced' ? 'Deployment, DNS, and performance checks' : 'Guided website setup' },
    { href: '/podcasters',                  key: 'podcast',       depth: level === 'beginner' ? 'Script templates and publishing basics' : 'Multilingual show workflow' },
    { href: '/dashboard/outreach/discovery',key: 'outreach',      depth: level === 'advanced' ? 'Pipeline rules and data diagnostics' : 'Audience discovery walkthrough' },
    { href: '/dashboard/reviews',           key: 'reviews',       depth: level === 'intermediate' ? 'Review automations and response tuning' : 'Trust-building review collection' },
    { href: '/dashboard/video',             key: 'video',         depth: level === 'advanced' ? 'Generation settings and render status' : 'Social video starter flow' },
    { href: '/dashboard/improve',           key: 'improve',       depth: level === 'advanced' ? 'SEO, accessibility, conversion, and speed audit' : 'Website improvement walkthrough' },
    { href: '/dashboard/podcast/studio',    key: 'podcastStudio', depth: level === 'beginner' ? 'Upload, transcript, clips, titles, and publishing checklist' : 'Studio optimization, metadata, and multilingual distribution' },
  ], [level])

  const LEVEL_ACCENT: Record<ItLevel, string> = {
    beginner: '#7dd3fc', intermediate: '#c4b5fd', advanced: '#1af0ff',
  }
  const accent = LEVEL_ACCENT[level]

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', color: 'var(--text-primary)', display: 'grid', gap: 22 }}>

      <div style={{ minHeight: 'calc(100vh - 125px)', display: 'grid', gap: 22, alignContent: 'start' }}>
      {/* Header */}
      <header className="sb-console" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <span className="sb-eyebrow">🛠️ {c(COPY.eyebrow, l)}</span>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: accent, background: `${accent}18`, border: `1px solid ${accent}44`, borderRadius: 999, padding: '4px 10px' }}>{c(levelData.badge, l)}</span>
        </div>
        <h1>{c(COPY.title, l)}</h1>
        <p className="sb-body">{c(levelData.subtitle, l)}</p>
        <div className="sb-telemetry">
          <div><b className="gold" style={{ fontSize: 14, textTransform: 'capitalize' }}>{level}</b><span>{c(levelData.badge, l)}</span></div>
          <div><b style={{ fontSize: 14, textTransform: 'capitalize' }}>{profile.tone_preference || uiText('generatedUi.u_4c448a406dcdf064')}</b><span>{c(COPY.toneLabel, l)}</span></div>
          <div><b style={{ fontSize: 14 }}>{profile.role || c(COPY.notSet, l)}</b><span>{c(COPY.roleLabel, l)}</span></div>
          <div><b>{moduleItems.length}</b><span>{c(COPY.tutorialsTitle, l)}</span></div>
        </div>
      </header>

      {/* Tasks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignContent: 'start' }}>
        {(['t1', 't2', 't3'] as const).map((tk, i) => (
          <div key={tk} style={{ borderTop: '1px solid rgba(255,255,255,.07)', padding: '14px 0', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ width: 24, height: 24, borderRadius: 999, background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontWeight: 900, fontSize: 12, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
            <span style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,.8)' }}>{c((levelData.tasks as any)[tk], l)}</span>
          </div>
        ))}
      </div>

      {/* Module grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {moduleItems.map(item => (
          <Link key={item.key} href={item.href} style={{ color: '#fff', textDecoration: 'none', borderTop: '1px solid rgba(255,255,255,.07)', borderLeft: `2px solid ${accent}55`, padding: '14px 0 14px 14px', display: 'block' }}>
            <strong style={{ fontSize: 14, fontWeight: 800, display: 'block', marginBottom: 6 }}>{c((COPY.modules as any)[item.key], l)}</strong>
            <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{item.depth}</p>
          </Link>
        ))}
      </div>

      </div>

      {/* Tutorials — starts on the second screen */}
      <div>
        <h2 style={{ fontSize: 'clamp(18px,3vw,26px)', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 16px' }}>{c(COPY.tutorialsTitle, l)}</h2>
        <div style={{ display: 'grid', gap: 16 }}>
          {(["improve", "podcastStudio"] as const).map(key => {
            const tut = COPY.tutorials[key]
            const href = key === 'improve' ? '/dashboard/improve' : '/dashboard/podcast/studio'
            return (
              <article key={key} style={{ borderTop: '1px solid rgba(255,195,0,.25)', padding: '18px 0 4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <strong style={{ fontSize: 16, fontWeight: 800, display: 'block', marginBottom: 12 }}>{c(tut.title, l)}</strong>
                    <ol style={{ color: 'rgba(255,255,255,.7)', lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
                      <li style={{ fontSize: 13 }}>{c(tut.step1, l)}</li>
                      <li style={{ fontSize: 13 }}>{c(tut.step2, l)}</li>
                      <li style={{ fontSize: 13 }}>{c(tut.step3, l)}</li>
                    </ol>
                  </div>
                  <Link className="sb-button-primary" href={href} style={{ alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>{c(COPY.startTutorial, l)}</Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(80px, 1fr))', gap: 10 }} aria-label={c(COPY.visualExamples, l)}>
                  {['01', '02', '03'].map(label => (
                    <div key={label} style={{ minHeight: 70, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'linear-gradient(135deg, rgba(56,189,248,.14), rgba(255,255,255,.04))', display: 'grid', placeItems: 'center', color: '#fde68a', fontWeight: 900, fontSize: 18 }}>{label}</div>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <OrchestrationPanel module="apprentice" compact />
    </div>
  )
}
