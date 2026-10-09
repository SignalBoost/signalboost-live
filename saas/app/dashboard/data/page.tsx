'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const COPY = {
  eyebrow:       { en: uiText('generatedUi.u_cec3a9b89b2e3913'), es: 'Datos', pt: 'Dados', pl: 'Dane', ru: 'Данные', de: 'Daten', fr: 'Données', it: 'Dati', ja: 'データ', ko: '데이터', ar: 'البيانات' },
  title:         { en: uiText('generatedUi.u_610b2a8f2072b5a0'), es: 'Conector universal de datos', pt: 'Conector universal de dados', pl: 'Uniwersalny łącznik danych', ru: 'Универсальный коннектор данных', de: 'Universeller Datenkonnektor', fr: 'Connecteur de données universel', it: 'Connettore dati universale', ja: 'ユニバーサルデータコネクタ', ko: '범용 데이터 커넥터', ar: 'موصل البيانات الشامل' },
  subtitle:      { en: uiText('generatedUi.u_a0363f054c9959d1'), es: 'Importa tu catálogo a SignalBoost desde un CSV, una API en vivo o un scraper — y reutilízalo en sitios, reseñas y prospección.', pt: 'Traga seu catálogo para o SignalBoost via CSV, API ao vivo ou scraper — e reutilize em sites, avaliações e prospecção.', pl: 'Wprowadź swój katalog do SignalBoost z CSV, API lub scrapera — i używaj go na stronach, w opiniach i outreachu.', ru: 'Импортируйте каталог в SignalBoost из CSV, API или скрейпера — и используйте его на сайтах, в отзывах и аутриче.', de: 'Bringen Sie Ihren Katalog per CSV, Live-API oder Scraper-Ausgabe in SignalBoost – und nutzen Sie ihn dann für Websites, Bewertungen und Outreach.', fr: 'Importez votre catalogue dans SignalBoost depuis un CSV, une API en direct ou une sortie de scraper, puis réutilisez-le pour vos sites, avis et actions de prospection.', it: 'Porta il tuo catalogo in SignalBoost da un CSV, un’API live o l’output di uno scraper, poi riutilizzalo su siti, recensioni e outreach.', ja: 'CSV、ライブ API、またはスクレイパー出力からカタログを SignalBoost に取り込み、サイト、レビュー、アウトリーチ全体で再利用できます。', ko: 'CSV, 라이브 API 또는 스크레이퍼 출력에서 카탈로그를 SignalBoost로 가져온 다음 사이트, 리뷰, 아웃리치 전반에서 재사용하세요.', ar: 'استورد كتالوجك إلى SignalBoost من ملف CSV أو API مباشر أو مخرجات أداة استخراج البيانات، ثم أعد استخدامه عبر المواقع والمراجعات وحملات التواصل.' },
  tItems:        { en: uiText('generatedUi.u_e460ce46b91863d5'), es: 'Elementos importados', pt: 'Itens importados', pl: 'Zaimportowane', ru: 'Импортировано', de: 'Importierte Elemente', fr: 'Éléments importés', it: 'Elementi importati', ja: 'インポートされた項目', ko: '가져온 항목', ar: 'العناصر المستوردة' },
  tCategories:   { en: uiText('generatedUi.u_b8b1d894c6837252'), es: 'Categorías', pt: 'Categorias', pl: 'Kategorie', ru: 'Категории', de: 'Kategorien', fr: 'Catégories', it: 'Categorie', ja: 'カテゴリ', ko: '카테고리', ar: 'الفئات' },
  tSources:      { en: uiText('generatedUi.u_caf85b0888d78f1f'), es: 'Fuentes', pt: 'Fontes', pl: 'Źródła', ru: 'Источники', de: 'Quellen', fr: 'Sources', it: 'Fonti', ja: 'ソース', ko: '출처', ar: 'المصادر' },
  /* ── Drop zone ── */
  dropTitle:     { en: uiText('generatedUi.u_8a9c3bce8ccdcb42'), es: 'Suelta archivos o una carpeta aquí', pt: 'Solte arquivos ou uma pasta aqui', pl: 'Upuść pliki lub folder tutaj', ru: 'Перетащите файлы или папку сюда', de: 'Dateien oder einen Ordner hier ablegen', fr: 'Déposez des fichiers ou un dossier ici', it: 'Trascina qui file o una cartella', ja: 'ここにファイルまたはフォルダーをドロップ', ko: '여기에 파일 또는 폴더를 놓으세요', ar: 'أفلت الملفات أو مجلدًا هنا' },
  dropSub:       { en: uiText('generatedUi.u_7beb1153a2eae0b0'), es: 'Archivos CSV y JSON · o haz clic para explorar', pt: 'Arquivos CSV e JSON · ou clique para procurar', pl: 'Pliki CSV i JSON · lub kliknij, aby przeglądać', ru: 'Файлы CSV и JSON · или нажмите для выбора', de: 'CSV- und JSON-Dateien werden unterstützt · oder zum Durchsuchen klicken', fr: 'Fichiers CSV et JSON pris en charge · ou cliquez pour parcourir', it: 'File CSV e JSON supportati · oppure fai clic per sfogliare', ja: 'CSV および JSON ファイルに対応 · またはクリックして参照', ko: 'CSV 및 JSON 파일 지원 · 또는 클릭하여 찾아보기', ar: 'ملفات CSV وJSON مدعومة · أو انقر للاستعراض' },
  dropFolder:    { en: uiText('generatedUi.u_e35182e61b2e15ae'), es: 'Subir carpeta', pt: 'Enviar pasta', pl: 'Prześlij folder', ru: 'Загрузить папку', de: 'Ordner hochladen', fr: 'Téléverser un dossier', it: 'Carica cartella', ja: 'フォルダーをアップロード', ko: '폴더 업로드', ar: 'رفع مجلد' },
  dropFiles:     { en: uiText('generatedUi.u_4118deee6e13aa90'), es: 'Subir archivos', pt: 'Enviar arquivos', pl: 'Prześlij pliki', ru: 'Загрузить файлы', de: 'Dateien hochladen', fr: 'Importer des fichiers', it: 'Carica file', ja: 'ファイルをアップロード', ko: '파일 업로드', ar: 'رفع الملفات' },
  queueTitle:    { en: uiText('generatedUi.u_a1194c5f512a6d94'), es: 'Cola de carga', pt: 'Fila de envio', pl: 'Kolejka przesyłania', ru: 'Очередь загрузки', de: 'Upload-Warteschlange', fr: 'File d’envoi', it: 'Coda di caricamento', ja: 'アップロードキュー', ko: '업로드 대기열', ar: 'قائمة انتظار الرفع' },
  queueClear:    { en: uiText('generatedUi.u_9848701bbc2c66ba'), es: 'Limpiar completados', pt: 'Limpar concluídos', pl: 'Wyczyść gotowe', ru: 'Очистить завершённые', de: 'Erledigte entfernen', fr: 'Effacer les terminés', it: 'Cancella completati', ja: '完了済みをクリア', ko: '완료 항목 지우기', ar: 'مسح المكتمل' },
  queueImportAll:{ en: uiText('generatedUi.u_7149c22b59fae9fd'), es: 'Importar todos pendientes', pt: 'Importar todos pendentes', pl: 'Importuj wszystkie oczekujące', ru: 'Импортировать все ожидающие', de: 'Alle ausstehenden importieren', fr: 'Importer tous les éléments en attente', it: 'Importa tutti in sospeso', ja: '保留中をすべてインポート', ko: '대기 중인 항목 모두 가져오기', ar: 'استيراد جميع العناصر المعلّقة' },
  queueEmpty:    { en: uiText('generatedUi.u_e70ca510ec619e33'), es: 'No hay archivos en cola — arrastra archivos o una carpeta arriba.', pt: 'Nenhum arquivo na fila — arraste arquivos ou uma pasta acima.', pl: 'Brak plików w kolejce — przeciągnij pliki lub folder powyżej.', ru: 'Очередь пуста — перетащите файлы или папку выше.', de: 'Noch keine Dateien in der Warteschlange – ziehen Sie Dateien oder einen Ordner nach oben.', fr: 'Aucun fichier en file d’attente — faites glisser des fichiers ou un dossier ci-dessus.', it: 'Nessun file in coda: trascina file o una cartella qui sopra.', ja: 'キューにファイルはまだありません。上にファイルまたはフォルダーをドラッグしてください。', ko: '아직 대기열에 파일이 없습니다. 위로 파일이나 폴더를 끌어다 놓으세요.', ar: 'لا توجد ملفات في قائمة الانتظار بعد — اسحب ملفات أو مجلدًا إلى الأعلى.' },
  statusPending: { en: uiText('generatedUi.u_331551b0de4157c9'), es: 'Pendiente', pt: 'Pendente', pl: 'Oczekuje', ru: 'Ожидает', de: 'Ausstehend', fr: 'En attente', it: 'In sospeso', ja: '保留中', ko: '대기 중', ar: 'قيد الانتظار' },
  statusImporting:{ en: uiText('generatedUi.u_c01c4324f1fa14fc'), es: 'Importando…', pt: 'Importando…', pl: 'Importowanie…', ru: 'Импорт…', de: 'Wird importiert…', fr: 'Importation…', it: 'Importazione…', ja: 'インポート中…', ko: '가져오는 중…', ar: 'جارٍ الاستيراد…' },
  statusDone:    { en: uiText('generatedUi.u_11a6767d5674c7e4'), es: 'Listo', pt: 'Pronto', pl: 'Gotowe', ru: 'Готово', de: 'Fertig', fr: 'Terminé', it: 'Fatto', ja: '完了', ko: '완료', ar: 'تم' },
  statusError:   { en: uiText('generatedUi.u_54a0e8c17ebb21a1'), es: 'Error', pt: 'Erro', pl: 'Błąd', ru: 'Ошибка', de: 'Fehler', fr: 'Erreur', it: 'Errore', ja: 'エラー', ko: '오류', ar: 'خطأ' },
  unsupported:   { en: uiText('generatedUi.u_c113398f26149331'), es: 'Solo se admiten archivos .csv y .json.', pt: 'Apenas arquivos .csv e .json são suportados.', pl: 'Obsługiwane są tylko pliki .csv i .json.', ru: 'Поддерживаются только файлы .csv и .json.', de: 'Nur .csv- und .json-Dateien werden unterstützt.', fr: 'Seuls les fichiers .csv et .json sont pris en charge.', it: 'Sono supportati solo file .csv e .json.', ja: '.csv と .json ファイルのみサポートされています。', ko: '.csv 및 .json 파일만 지원됩니다.', ar: 'يتم دعم ملفات ‎.csv و‎.json فقط.' },
  /* ── CSV panel ── */
  csvTitle:      { en: uiText('generatedUi.u_a98dd755ce89c4bf'), es: 'Subir CSV', pt: 'Enviar CSV', pl: 'Prześlij CSV', ru: 'Загрузить CSV', de: 'CSV hochladen', fr: 'Importer un CSV', it: 'Carica CSV', ja: 'CSV をアップロード', ko: 'CSV 업로드', ar: 'رفع ملف CSV' },
  csvHint:       { en: uiText('generatedUi.u_0092a99ed676ec25'), es: 'Fila de encabezado + un elemento por línea', pt: 'Linha de cabeçalho + um item por linha', pl: 'Wiersz nagłówka + jeden element na linię', ru: 'Строка заголовка + один элемент на строку', de: 'Kopfzeile + ein Eintrag pro Zeile', fr: 'Ligne d\'en-tête + un élément par ligne', it: 'Riga di intestazione + un elemento per riga', ja: 'ヘッダー行 + 1 行に 1 項目', ko: '헤더 행 + 한 줄에 항목 하나', ar: 'صف العناوين + عنصر واحد في كل سطر' },
  csvLabel:      { en: uiText('generatedUi.u_af497e28dbf2d507'), es: 'Contenido CSV', pt: 'Conteúdo CSV', pl: 'Zawartość CSV', ru: 'Содержимое CSV', de: 'CSV-Inhalt', fr: 'Contenu CSV', it: 'Contenuto CSV', ja: 'CSVの内容', ko: 'CSV 내용', ar: 'محتوى CSV' },
  csvBtn:        { en: uiText('generatedUi.u_9982ac26053cd1b7'), es: 'Importar CSV', pt: 'Importar CSV', pl: 'Importuj CSV', ru: 'Импорт CSV', de: 'CSV importieren', fr: 'Importer un CSV', it: 'Importa CSV', ja: 'CSV をインポート', ko: 'CSV 가져오기', ar: 'استيراد CSV' },
  /* ── API panel ── */
  apiTitle:      { en: uiText('generatedUi.u_2af141e782533424'), es: 'Conector API', pt: 'Conector API', pl: 'Łącznik API', ru: 'API-коннектор', de: 'API-Connector', fr: 'Connecteur API', it: 'Connettore API', ja: 'API コネクター', ko: 'API 커넥터', ar: 'موصّل API' },
  apiHint:       { en: uiText('generatedUi.u_622d29d35cb87932'), es: 'Obtén elementos de un endpoint en vivo', pt: 'Busque itens de um endpoint ao vivo', pl: 'Pobieraj elementy z endpointu', ru: 'Получайте элементы из эндпоинта', de: 'Elemente von einem Live-Endpunkt abrufen', fr: 'Récupérer des éléments depuis un point de terminaison en direct', it: 'Recupera elementi da un endpoint live', ja: 'ライブエンドポイントから項目を取得', ko: '실시간 엔드포인트에서 항목 가져오기', ar: 'جلب العناصر من نقطة نهاية مباشرة' },
  apiEndpoint:   { en: uiText('generatedUi.u_2578179d177903e1'), es: 'URL del endpoint', pt: 'URL do endpoint', pl: 'Adres endpointu', ru: 'URL эндпоинта', de: 'Endpunkt-URL', fr: 'URL du point de terminaison', it: 'URL dell\'endpoint', ja: 'エンドポイント URL', ko: '엔드포인트 URL', ar: 'عنوان URL لنقطة النهاية' },
  apiMapping:    { en: uiText('generatedUi.u_8e3be22ada6dd0cd'), es: 'Mapeo de campos (JSON)', pt: 'Mapeamento de campos (JSON)', pl: 'Mapowanie pól (JSON)', ru: 'Сопоставление полей (JSON)', de: 'Feldzuordnung (JSON)', fr: 'Mappage des champs (JSON)', it: 'Mappatura dei campi (JSON)', ja: 'フィールドマッピング (JSON)', ko: '필드 매핑(JSON)', ar: 'تعيين الحقول (JSON)' },
  apiBtn:        { en: uiText('generatedUi.u_05f0ff58f0701c71'), es: 'Ejecutar importación API', pt: 'Executar importação API', pl: 'Uruchom import API', ru: 'Запустить импорт API', de: 'API-Import ausführen', fr: 'Lancer l\'import API', it: 'Esegui importazione API', ja: 'API インポートを実行', ko: 'API 가져오기 실행', ar: 'تشغيل استيراد API' },
  /* ── Scraper panel ── */
  scrTitle:      { en: uiText('generatedUi.u_4fdd270672a45fd9'), es: 'Conector de scraper', pt: 'Conector de scraper', pl: 'Łącznik scrapera', ru: 'Скрейпер-коннектор', de: 'Scraper-Connector', fr: 'Connecteur de scraping', it: 'Connettore scraper', ja: 'スクレイパーコネクター', ko: '스크레이퍼 커넥터', ar: 'موصل الاستخلاص' },
  scrHint:       { en: uiText('generatedUi.u_f5c97e330fce2e4a'), es: 'Pega la salida estructurada del scraper', pt: 'Cole a saída estruturada do scraper', pl: 'Wklej dane wyjściowe scrapera', ru: 'Вставьте структурированный вывод скрейпера', de: 'Strukturierte Scraper-Ausgabe einfügen', fr: 'Coller la sortie structurée du scraper', it: 'Incolla l\'output strutturato dello scraper', ja: '構造化されたスクレイパー出力を貼り付け', ko: '구조화된 스크레이퍼 출력 붙여넣기', ar: 'لصق مخرجات أداة الاستخلاص المنظّمة' },
  scrLabel:      { en: uiText('generatedUi.u_580339e71c0d85a3'), es: 'Elementos (arreglo JSON)', pt: 'Itens (array JSON)', pl: 'Elementy (tablica JSON)', ru: 'Элементы (JSON-массив)', de: 'Elemente (JSON-Array)', fr: 'Éléments (tableau JSON)', it: 'Elementi (array JSON)', ja: '項目（JSON 配列）', ko: '항목(JSON 배열)', ar: 'العناصر (مصفوفة JSON)' },
  scrBtn:        { en: uiText('generatedUi.u_fe8e643cff057793'), es: 'Ejecutar importación', pt: 'Executar importação', pl: 'Uruchom import', ru: 'Запустить импорт', de: 'Scraper-Import ausführen', fr: 'Lancer l’import du scraper', it: 'Esegui importazione scraper', ja: 'スクレイパーのインポートを実行', ko: '스크레이퍼 가져오기 실행', ar: 'تشغيل استيراد أداة الكشط' },
  /* ── shared ── */
  importing:     { en: uiText('generatedUi.u_c01c4324f1fa14fc'), es: 'Importando…', pt: 'Importando…', pl: 'Importowanie…', ru: 'Импорт…', de: 'Wird importiert…', fr: 'Importation…', it: 'Importazione…', ja: 'インポート中…', ko: '가져오는 중…', ar: 'جارٍ الاستيراد…' },
  done:          { en: uiText('generatedUi.u_5eca82edc3594428'), es: 'Listo — {count} elemento(s) insertado(s)', pt: 'Pronto — {count} item(ns) inserido(s)', pl: 'Gotowe — {count} element(ów) dodano', ru: 'Готово — добавлено {count} элемент(ов)', de: 'Fertig – {count} Element(e) eingefügt', fr: 'Terminé — {count} élément(s) inséré(s)', it: 'Fatto — {count} elemento/i inserito/i', ja: '完了 — {count} 件の項目を挿入しました', ko: '완료 — 항목 {count}개 삽입됨', ar: 'تم — أُدرج {count} عنصر' },
  invalidJson:   { en: uiText('generatedUi.u_a64d8bd77dc86ddd'), es: 'No se pudo analizar el JSON — revisa la sintaxis e inténtalo de nuevo.', pt: 'Não foi possível analisar o JSON — verifique a sintaxe e tente novamente.', pl: 'Nie udało się przetworzyć JSON — sprawdź składnię i spróbuj ponownie.', ru: 'Не удалось разобрать JSON — проверьте синтаксис и повторите.', de: 'Dieses JSON konnte nicht geparst werden – prüfen Sie die Syntax und versuchen Sie es erneut.', fr: 'Ce JSON n’a pas pu être analysé — vérifiez la syntaxe et réessayez.', it: 'Impossibile analizzare questo JSON: controlla la sintassi e riprova.', ja: 'この JSON を解析できませんでした。構文を確認してもう一度お試しください。', ko: '이 JSON을 구문 분석할 수 없습니다. 구문을 확인하고 다시 시도하세요.', ar: 'تعذّر تحليل JSON هذا — تحقّق من الصياغة وحاول مرة أخرى.' },
  failed:        { en: uiText('generatedUi.u_6133684153fb74ef'), es: 'Importación fallida: {error}', pt: 'Falha na importação: {error}', pl: 'Import nieudany: {error}', ru: 'Импорт не удался: {error}', de: 'Import fehlgeschlagen: {error}', fr: 'Échec de l’importation : {error}', it: 'Importazione non riuscita: {error}', ja: 'インポートに失敗しました: {error}', ko: '가져오기 실패: {error}', ar: 'فشل الاستيراد: {error}' },
  itemsTitle:    { en: uiText('generatedUi.u_55898be3b990f9f2'), es: 'Elementos importados por categoría', pt: 'Itens importados por categoria', pl: 'Zaimportowane elementy wg kategorii', ru: 'Импортированные элементы по категориям', de: 'Importierte Elemente nach Kategorie', fr: 'Éléments importés par catégorie', it: 'Elementi importati per categoria', ja: 'カテゴリ別のインポート項目', ko: '카테고리별 가져온 항목', ar: 'العناصر المستوردة حسب الفئة' },
  itemsEmpty:    { en: uiText('generatedUi.u_9f08b6571a441b65'), es: 'Aún no hay importaciones. Ejecuta un conector arriba y tus elementos aparecerán aquí, agrupados por categoría.', pt: 'Nada importado ainda. Execute um conector acima e seus itens aparecerão aqui, agrupados por categoria.', pl: 'Jeszcze nic nie zaimportowano. Uruchom łącznik powyżej, a elementy pojawią się tutaj pogrupowane.', ru: 'Пока ничего не импортировано. Запустите коннектор выше — элементы появятся здесь по категориям.', de: 'Noch nichts importiert. Führen Sie oben einen beliebigen Connector aus, und Ihre Elemente erscheinen hier, nach Kategorie gruppiert.', fr: 'Rien n\'a encore été importé. Exécutez n\'importe quel connecteur ci-dessus et vos éléments apparaîtront ici, regroupés par catégorie.', it: 'Ancora nulla di importato. Esegui uno qualsiasi dei connettori qui sopra e i tuoi elementi appariranno qui, raggruppati per categoria.', ja: 'まだ何もインポートされていません。上のいずれかのコネクターを実行すると、項目がカテゴリ別にここに表示されます。', ko: '아직 가져온 항목이 없습니다. 위의 커넥터를 실행하면 항목이 카테고리별로 그룹화되어 여기에 표시됩니다.', ar: 'لم يتم استيراد أي شيء بعد. شغّل أي موصل أعلاه وستظهر عناصرك هنا مجمّعة حسب الفئة.' },
  srcTitle:      { en: uiText('generatedUi.u_6ab00906ce510d2d'), es: 'Historial de fuentes', pt: 'Histórico de fontes', pl: 'Historia źródeł', ru: 'История источников', de: 'Quellverlauf', fr: 'Historique des sources', it: 'Cronologia delle fonti', ja: 'ソース履歴', ko: '소스 기록', ar: 'سجل المصادر' },
  srcEmpty:      { en: uiText('generatedUi.u_878835d313ea8601'), es: 'Sin fuentes aún — cada importación se registra aquí con su tipo y hora.', pt: 'Sem fontes ainda — cada importação é registrada aqui com tipo e hora.', pl: 'Brak źródeł — każdy import jest tu rejestrowany z typem i czasem.', ru: 'Источников пока нет — каждый импорт фиксируется здесь с типом и временем.', de: 'Noch keine Quellen – jeder Import wird hier mit Typ und Uhrzeit protokolliert.', fr: 'Aucune source pour l’instant — chaque import est consigné ici avec son type et son heure.', it: 'Ancora nessuna fonte: ogni importazione viene registrata qui con tipo e orario.', ja: 'ソースはまだありません — 各インポートは種類と時刻とともにここに記録されます。', ko: '아직 소스가 없습니다 — 각 가져오기는 유형 및 시간과 함께 여기에 기록됩니다.', ar: 'لا توجد مصادر بعد — يُسجَّل كل استيراد هنا مع نوعه ووقته.' },
  loading:       { en: uiText('generatedUi.u_44e5b40374955bc3'), es: 'Cargando tus importaciones…', pt: 'Carregando suas importações…', pl: 'Ładowanie importów…', ru: 'Загрузка импортов…', de: 'Ihre Importe werden geladen…', fr: 'Chargement de vos importations…', it: 'Caricamento delle tue importazioni…', ja: 'インポートを読み込み中…', ko: '가져오기 로드 중…', ar: 'جارٍ تحميل عمليات الاستيراد…' },
}

function c(obj: Record<Lang, string>, lang: Lang): string {
  return obj?.[lang] ?? obj?.en ?? ''
}

type QueueItem = {
  id: string
  name: string
  ext: 'csv' | 'json'
  content: string
  status: 'pending' | 'importing' | 'done' | 'error'
  message: string
}

type HistoryPayload = {
  groupedItems: Record<string, Array<{ id: string; name: string; description?: string; source_url?: string }>>
  sources: Array<{ id: string; type: string; config: Record<string, unknown>; created_at: string }>
}

function statusColor(s: QueueItem['status']): string {
  if (s === 'done') return '#1af0ff'
  if (s === 'error') return '#ff4d4d'
  if (s === 'importing') return '#ffc300'
  return 'rgba(255,255,255,.45)'
}

function statusDot(s: QueueItem['status']): string {
  if (s === 'done') return '✓'
  if (s === 'error') return '✕'
  if (s === 'importing') return '⟳'
  return '○'
}

export default function DataConnectorsPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang

  /* ── existing connector state ── */
  const [csvText, setCsvText] = useState('name,category,description,image_url,source_url\nFC Barcelona,Football Teams,Spanish football club,https://example.com/barca.jpg,https://www.fcbarcelona.com')
  const [apiEndpoint, setApiEndpoint] = useState('https://example.com/api/items')
  const [apiMapping, setApiMapping] = useState('{"name":"name","category":"category","description":"description","image_url":"image","source_url":"url"}')
  const [scraperJson, setScraperJson] = useState('[{"name":"Louvre Museum","category":"Museums","description":"Museum in Paris","image_url":"https://example.com/louvre.jpg","source_url":"https://www.louvre.fr"}]')
  const [history, setHistory] = useState<HistoryPayload>({ groupedItems: {}, sources: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'err'; text: string }>({ kind: 'idle', text: '' })

  /* ── drag-drop / upload queue state ── */
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [queueBusy, setQueueBusy] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  async function refresh() {
    try {
      const res = await fetch('/api/data-connectors/history')
      const data = await res.json()
      setHistory(data)
    } catch { } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  /* ── existing connectors submit ── */
  async function submit(payload: Record<string, unknown>) {
    if (busy) return
    setBusy(true)
    setStatus({ kind: 'busy', text: c(COPY.importing, l) })
    try {
      const res = await fetch('/api/data-connectors/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus({ kind: 'ok', text: c(COPY.done, l).replace('{count}', String(data.inserted ?? 0)) })
        refresh()
      } else {
        setStatus({ kind: 'err', text: c(COPY.failed, l).replace('{error}', String(data.error)) })
      }
    } catch (e) {
      setStatus({ kind: 'err', text: c(COPY.failed, l).replace('{error}', e instanceof Error ? e.message : 'network') })
    } finally {
      setBusy(false)
    }
  }

  function runApi() {
    try {
      const mapping = JSON.parse(apiMapping)
      submit({ mode: 'api', endpoint: apiEndpoint, mapping, config: { label: uiText('generatedUi.u_e00ca7355d52d330') } })
    } catch {
      setStatus({ kind: 'err', text: c(COPY.invalidJson, l) })
    }
  }

  function runScraper() {
    try {
      const json = JSON.parse(scraperJson)
      submit({ mode: 'scraper', json, config: { script: 'custom scraper output' } })
    } catch {
      setStatus({ kind: 'err', text: c(COPY.invalidJson, l) })
    }
  }

  /* ── file reading helper ── */
  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('File read error'))
      reader.readAsText(file)
    })
  }

  /* ── enqueue files ── */
  const enqueueFiles = useCallback(async (files: File[]) => {
    const supported = files.filter(f => f.name.endsWith('.csv') || f.name.endsWith('.json'))
    if (supported.length === 0) {
      setStatus({ kind: 'err', text: c(COPY.unsupported, l) })
      return
    }
    const newItems: QueueItem[] = await Promise.all(
      supported.map(async (file) => {
        const content = await readFileAsText(file)
        const ext = file.name.endsWith('.json') ? 'json' : 'csv'
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          ext,
          content,
          status: 'pending' as const,
          message: '',
        }
      })
    )
    setQueue(prev => [...prev, ...newItems])
  }, [l])

  /* ── drag events ── */
  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    setDragging(true)
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setDragging(false)

    const items = Array.from(e.dataTransfer.items)
    const files: File[] = []

    async function traverseEntry(entry: FileSystemEntry): Promise<void> {
      if (entry.isFile) {
        await new Promise<void>((resolve) => {
          (entry as FileSystemFileEntry).file((f) => { files.push(f); resolve() })
        })
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader()
        await new Promise<void>((resolve) => {
          reader.readEntries(async (entries) => {
            for (const child of entries) {
              await traverseEntry(child)
            }
            resolve()
          })
        })
      }
    }

    const traversals: Promise<void>[] = []
    for (const item of items) {
      const entry = item.webkitGetAsEntry()
      if (entry) traversals.push(traverseEntry(entry))
    }
    await Promise.all(traversals)

    if (files.length > 0) {
      await enqueueFiles(files)
    }
  }

  /* ── file input change ── */
  async function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) await enqueueFiles(files)
    e.target.value = ''
  }

  /* ── import a single queue item ── */
  async function importQueueItem(id: string) {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'importing', message: '' } : item))
    const item = queue.find(q => q.id === id)
    if (!item) return

    try {
      let payload: Record<string, unknown>
      if (item.ext === 'csv') {
        payload = { mode: 'csv', csvText: item.content, fileName: item.name }
      } else {
        let json: unknown
        try { json = JSON.parse(item.content) } catch {
          throw new Error('Invalid JSON')
        }
        payload = { mode: 'scraper', json, config: { script: item.name } }
      }

      const res = await fetch('/api/data-connectors/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'done', message: `${data.inserted ?? 0} items` } : q))
        refresh()
      } else {
        setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'error', message: String(data.error) } : q))
      }
    } catch (e) {
      setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'error', message: e instanceof Error ? e.message : 'unknown' } : q))
    }
  }

  /* ── import all pending ── */
  async function importAllPending() {
    if (queueBusy) return
    setQueueBusy(true)
    const pending = queue.filter(q => q.status === 'pending')
    for (const item of pending) {
      await importQueueItem(item.id)
    }
    setQueueBusy(false)
  }

  function clearDone() {
    setQueue(prev => prev.filter(q => q.status !== 'done'))
  }

  const itemCount = Object.values(history.groupedItems).reduce((n, arr) => n + arr.length, 0)
  const categoryCount = Object.keys(history.groupedItems).length
  const pendingCount = queue.filter(q => q.status === 'pending').length

  return (
    <div style={{ color: 'var(--text-primary)' }}>

      {/* ── header ── */}
      <header className="sb-console" style={{ paddingBottom: 12 }}>
        <div className="sb-console__row">
          <div style={{ minWidth: 0 }}>
            <span className="sb-eyebrow">🗄️ {c(COPY.eyebrow, l)}</span>
            <h1 style={{ fontSize: 22, margin: '4px 0' }}>{c(COPY.title, l)}</h1>
          </div>
          <div className="sb-telemetry" style={{ marginTop: 0, borderTop: 0 }}>
            <div style={{ paddingTop: 0 }}><b className="gold">{itemCount}</b><span>{c(COPY.tItems, l)}</span></div>
            <div style={{ paddingTop: 0 }}><b>{categoryCount}</b><span>{c(COPY.tCategories, l)}</span></div>
            <div style={{ paddingTop: 0 }}><b>{history.sources.length}</b><span>{c(COPY.tSources, l)}</span></div>
          </div>
        </div>
      </header>

      {/* ── global status chip ── */}
      {status.kind !== 'idle' && (
        <p style={{ marginBottom: 16 }}>
          <span className={`sb-chip ${status.kind === 'ok' ? 'sb-chip--ok' : status.kind === 'err' ? 'sb-chip--err' : 'sb-chip--gold'}`}>{status.text}</span>
        </p>
      )}

      {/* ══════════════════════════════════════════════════
          DRAG & DROP UPLOAD ZONE
      ══════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 20 }}>
        {/* drop zone */}
        <div
          ref={dropRef}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            position: 'relative',
            border: `2px dashed ${dragging ? '#ffc300' : 'rgba(255,255,255,.18)'}`,
            borderRadius: 20,
            padding: '36px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color .2s, background .2s',
            background: dragging
              ? 'linear-gradient(160deg, rgba(255,195,0,.08), rgba(26,240,255,.06))'
              : 'linear-gradient(160deg, rgba(15,23,42,.7), rgba(3,7,18,.8))',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: dragging ? '0 0 0 4px rgba(255,195,0,.18), 0 24px 70px rgba(0,0,0,.5)' : '0 24px 70px rgba(0,0,0,.4)',
            userSelect: 'none',
          }}
        >
          {/* icon */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: dragging ? 'rgba(255,195,0,.15)' : 'rgba(255,255,255,.06)',
            border: `1px solid ${dragging ? 'rgba(255,195,0,.4)' : 'rgba(255,255,255,.1)'}`,
            fontSize: 28, transition: 'all .2s',
          }}>
            {dragging ? '📂' : '📁'}
          </div>

          <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px', color: dragging ? '#ffc300' : '#fff' }}>
            {c(COPY.dropTitle, l)}
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', margin: 0 }}>
            {c(COPY.dropSub, l)}
          </p>

          {/* overlay pulse ring when dragging */}
          {dragging && (
            <div style={{
              position: 'absolute', inset: -2, borderRadius: 22,
              border: '2px solid rgba(255,195,0,.35)',
              pointerEvents: 'none',
              animation: 'none',
            }} />
          )}
        </div>

        {/* hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json"
          multiple
          style={{ display: 'none' }}
          onChange={onFileInputChange}
        />
        <input
          ref={folderInputRef}
          type="file"
          /* @ts-ignore — webkitdirectory is non-standard but widely supported */
          webkitdirectory=""
          multiple
          style={{ display: 'none' }}
          onChange={onFileInputChange}
        />

        {/* action buttons below drop zone */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            className="sb-button-secondary"
            style={{ border: '1px solid rgba(255,255,255,.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
          >
            📄 {c(COPY.dropFiles, l)}
          </button>
          <button
            className="sb-button-secondary"
            style={{ border: '1px solid rgba(255,255,255,.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click() }}
          >
            📂 {c(COPY.dropFolder, l)}
          </button>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          UPLOAD QUEUE
      ══════════════════════════════════════════════════ */}
      {queue.length > 0 && (
        <section className="sb-panel" style={{ marginBottom: 20, borderTop: 0, paddingTop: 8 }}>
          <div className="sb-panel__head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0 }}>📋 {c(COPY.queueTitle, l)}</h2>
              {pendingCount > 0 && <span className="sb-chip sb-chip--gold">{pendingCount}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {queue.some(q => q.status === 'done') && (
                <button
                  className="sb-button-secondary"
                  style={{ fontSize: 12, padding: '4px 12px', border: '1px solid rgba(255,255,255,.12)', cursor: 'pointer' }}
                  onClick={clearDone}
                >
                  {c(COPY.queueClear, l)}
                </button>
              )}
              {pendingCount > 0 && (
                <button
                  className="sb-button-primary"
                  style={{ fontSize: 12, padding: '4px 14px', border: 'none', cursor: queueBusy ? 'wait' : 'pointer', opacity: queueBusy ? .6 : 1 }}
                  disabled={queueBusy}
                  onClick={importAllPending}
                >
                  ⚡ {c(COPY.queueImportAll, l)}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
            {queue.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  border: `1px solid ${item.status === 'error' ? 'rgba(255,77,77,.25)' : item.status === 'done' ? 'rgba(26,240,255,.18)' : 'rgba(255,255,255,.09)'}`,
                  borderRadius: 14, padding: '10px 14px',
                  background: item.status === 'error' ? 'rgba(255,77,77,.05)' : item.status === 'done' ? 'rgba(26,240,255,.04)' : 'rgba(255,255,255,.03)',
                  transition: 'all .2s',
                }}
              >
                {/* status dot */}
                <span style={{ fontSize: 16, color: statusColor(item.status), minWidth: 20, textAlign: 'center', fontWeight: 700 }}>
                  {statusDot(item.status)}
                </span>

                {/* file type badge */}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                  background: item.ext === 'csv' ? 'rgba(255,195,0,.15)' : 'rgba(26,240,255,.12)',
                  color: item.ext === 'csv' ? '#ffc300' : '#1af0ff',
                  border: `1px solid ${item.ext === 'csv' ? 'rgba(255,195,0,.3)' : 'rgba(26,240,255,.25)'}`,
                  textTransform: 'uppercase',
                }}>
                  {item.ext}
                </span>

                {/* file name */}
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </span>

                {/* status label */}
                <span style={{ fontSize: 12, color: statusColor(item.status), whiteSpace: 'nowrap' }}>
                  {item.status === 'pending' && c(COPY.statusPending, l)}
                  {item.status === 'importing' && c(COPY.statusImporting, l)}
                  {item.status === 'done' && `${c(COPY.statusDone, l)} · ${item.message}`}
                  {item.status === 'error' && `${c(COPY.statusError, l)}: ${item.message}`}
                </span>

                {/* per-item import button (pending only) */}
                {item.status === 'pending' && (
                  <button
                    className="sb-button-primary"
                    style={{ fontSize: 11, padding: '3px 12px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    onClick={() => importQueueItem(item.id)}
                  >{uiText('generatedUi.u_2cff9baabf56ca00')}</button>
                )}

                {/* remove button */}
                {(item.status === 'pending' || item.status === 'error' || item.status === 'done') && (
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.35)', fontSize: 16, padding: '0 2px', lineHeight: 1 }}
                    onClick={() => setQueue(prev => prev.filter(q => q.id !== item.id))}
                    title={uiText('generatedUi.u_c3812fc4acb861d5')}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          EXISTING CONNECTORS
      ══════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
        {/* CSV text connector */}
        <section className="sb-panel" style={{ marginBottom: 0, borderTop: 0, paddingTop: 8 }}>
          <div className="sb-panel__head"><h2>📄 {c(COPY.csvTitle, l)}</h2><span className="sb-caption">{c(COPY.csvHint, l)}</span></div>
          <label className="sb-field"><span>{c(COPY.csvLabel, l)}</span>
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} style={{ minHeight: 84 }} />
          </label>
          <button className="sb-button-primary" style={{ width: '100%', border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }} disabled={busy} onClick={() => submit({ mode: 'csv', csvText, fileName: 'manual.csv' })}>{c(COPY.csvBtn, l)}</button>
        </section>

        {/* API connector */}
        <section className="sb-panel" style={{ marginBottom: 0, borderTop: 0, paddingTop: 8 }}>
          <div className="sb-panel__head"><h2>🔌 {c(COPY.apiTitle, l)}</h2><span className="sb-caption">{c(COPY.apiHint, l)}</span></div>
          <label className="sb-field"><span>{c(COPY.apiEndpoint, l)}</span>
            <input value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} />
          </label>
          <label className="sb-field"><span>{c(COPY.apiMapping, l)}</span>
            <textarea value={apiMapping} onChange={(e) => setApiMapping(e.target.value)} style={{ minHeight: 80 }} />
          </label>
          <button className="sb-button-primary" style={{ width: '100%', border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }} disabled={busy} onClick={runApi}>{c(COPY.apiBtn, l)}</button>
        </section>

        {/* Scraper connector */}
        <section className="sb-panel" style={{ marginBottom: 0, borderTop: 0, paddingTop: 8 }}>
          <div className="sb-panel__head"><h2>🕸️ {c(COPY.scrTitle, l)}</h2><span className="sb-caption">{c(COPY.scrHint, l)}</span></div>
          <label className="sb-field"><span>{c(COPY.scrLabel, l)}</span>
            <textarea value={scraperJson} onChange={(e) => setScraperJson(e.target.value)} style={{ minHeight: 84 }} />
          </label>
          <button className="sb-button-primary" style={{ width: '100%', border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }} disabled={busy} onClick={runScraper}>{c(COPY.scrBtn, l)}</button>
        </section>
      </div>

      {/* ── imported items ── */}
      <section className="sb-panel">
        <div className="sb-panel__head"><h2>📦 {c(COPY.itemsTitle, l)}</h2><span className="sb-caption">{itemCount} · {categoryCount}</span></div>
        {loading ? (
          <p className="sb-body" style={{ fontSize: 13 }}>{c(COPY.loading, l)}</p>
        ) : itemCount === 0 ? (
          <div className="sb-empty">{c(COPY.itemsEmpty, l)}</div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {Object.entries(history.groupedItems).map(([category, items]) => (
              <div key={category}>
                <p style={{ margin: '0 0 8px' }}><span className="sb-chip sb-chip--gold">{category}</span> <span className="sb-caption">{items.length}</span></p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                  {items.map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(255,255,255,.09)', borderRadius: 14, padding: '12px 14px', background: 'rgba(255,255,255,.03)' }}>
                      <strong style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>{item.name}</strong>
                      {item.description ? <span className="sb-caption" style={{ display: 'block' }}>{item.description}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── source history ── */}
      <section className="sb-panel">
        <div className="sb-panel__head"><h2>🧾 {c(COPY.srcTitle, l)}</h2><span className="sb-caption">{history.sources.length}</span></div>
        {loading ? (
          <p className="sb-body" style={{ fontSize: 13 }}>{c(COPY.loading, l)}</p>
        ) : history.sources.length === 0 ? (
          <div className="sb-empty">{c(COPY.srcEmpty, l)}</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {history.sources.map((source) => (
              <div key={source.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '10px 14px', background: 'rgba(255,255,255,.02)' }}>
                <span className="sb-chip">{source.type}</span>
                <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{new Date(source.created_at).toLocaleString()}</span>
                <span className="sb-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>{JSON.stringify(source.config)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}
