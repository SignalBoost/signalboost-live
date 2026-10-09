// saas/components/hub/pages/KeyVaultPage.tsx
'use client'

// saas/components/hub/pages/KeyVaultPage.tsx
// Console Page 2 — Key Vault. Dynamic retrieval + safe + drawer + timeline.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { PageProps, Lang, c, TONES, Tone, cardStyle, bodyStyle, labelStyle, rowStyle, monoStyle, Band, Status } from '../shared.tsx'
import { uiText } from '@/lib/i18n/uiText'

const V: Record<string, Record<Lang, string>> = {
  mySafe:      { en: 'My Safe', es: 'Mi Caja Fuerte', pt: 'Meu Cofre', pl: 'Mój Sejf', ru: 'Мой сейф', de: 'Mein Tresor', fr: 'Mon coffre-fort', it: 'La mia cassaforte', ja: 'マイ金庫', ko: '내 금고', ar: 'خزنتي' },
  safeSub:     { en: 'Your encrypted key storage. Paste a key once — retrieve it whenever you need it.', es: 'Tu almacenamiento cifrado de claves. Pega una clave una vez — recupérala cuando la necesites.', pt: 'Seu armazenamento criptografado de chaves. Cole uma chave uma vez — recupere quando precisar.', pl: 'Twoje zaszyfrowane klucze. Wklej klucz raz — odzyskaj go, gdy będzie potrzebny.', ru: 'Ваше зашифрованное хранилище ключей. Вставьте ключ один раз — получите его, когда нужно.', de: 'Ihr verschlüsselter Schlüsselspeicher. Fügen Sie einen Schlüssel einmal ein – rufen Sie ihn ab, wann immer Sie ihn brauchen.', fr: 'Votre stockage de clés chiffré. Collez une clé une fois — récupérez-la quand vous en avez besoin.', it: 'Il tuo archivio di chiavi cifrato. Incolla una chiave una volta — recuperala quando ti serve.', ja: '暗号化されたキーの保管庫です。キーを一度貼り付ければ、必要なときにいつでも取り出せます。', ko: '암호화된 키 저장소입니다. 키를 한 번 붙여넣으면 필요할 때마다 가져올 수 있습니다.', ar: 'مخزن مفاتيحك المشفّر. الصق المفتاح مرة واحدة — واسترجعه متى احتجت إليه.' },
  addKey:      { en: '+ Add key', es: '+ Agregar clave', pt: '+ Adicionar chave', pl: '+ Dodaj klucz', ru: '+ Добавить ключ', de: '+ Schlüssel hinzufügen', fr: '+ Ajouter une clé', it: '+ Aggiungi chiave', ja: '+ キーを追加', ko: '+ 키 추가', ar: '+ إضافة مفتاح' },
  provider:    { en: 'Provider', es: 'Proveedor', pt: 'Provedor', pl: 'Dostawca', ru: 'Провайдер', de: 'Anbieter', fr: 'Fournisseur', it: 'Provider', ja: 'プロバイダー', ko: '제공업체', ar: 'المزوّد' },
  labelF:      { en: 'Name / label', es: 'Nombre / etiqueta', pt: 'Nome / rótulo', pl: 'Nazwa / etykieta', ru: 'Имя / метка', de: 'Name / Bezeichnung', fr: 'Nom / libellé', it: 'Nome / etichetta', ja: '名前 / ラベル', ko: '이름 / 레이블', ar: 'الاسم / التسمية' },
  valueF:      { en: 'Secret value', es: 'Valor secreto', pt: 'Valor secreto', pl: 'Wartość sekretna', ru: 'Секретное значение', de: 'Geheimer Wert', fr: 'Valeur secrète', it: 'Valore segreto', ja: 'シークレット値', ko: '비밀 값', ar: 'القيمة السرية' },
  save:        { en: 'Save to safe', es: 'Guardar en la caja', pt: 'Salvar no cofre', pl: 'Zapisz w sejfie', ru: 'Сохранить в сейф', de: 'Im Tresor speichern', fr: 'Enregistrer dans le coffre', it: 'Salva nella cassaforte', ja: '金庫に保存', ko: '금고에 저장', ar: 'حفظ في الخزنة' },
  saving:      { en: 'Encrypting…', es: 'Cifrando…', pt: 'Criptografando…', pl: 'Szyfrowanie…', ru: 'Шифрование…', de: 'Verschlüsseln…', fr: 'Chiffrement…', it: 'Cifratura…', ja: '暗号化中…', ko: '암호화 중…', ar: 'جارٍ التشفير…' },
  cancel:      { en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', pl: 'Anuluj', ru: 'Отмена', de: 'Abbrechen', fr: 'Annuler', it: 'Annulla', ja: 'キャンセル', ko: '취소', ar: 'إلغاء' },
  copyBtn:     { en: 'Copy', es: 'Copiar', pt: 'Copiar', pl: 'Kopiuj', ru: 'Копировать', de: 'Kopieren', fr: 'Copier', it: 'Copia', ja: 'コピー', ko: '복사', ar: 'نسخ' },
  copied:      { en: 'Copied ✓', es: 'Copiado ✓', pt: 'Copiado ✓', pl: 'Skopiowano ✓', ru: 'Скопировано ✓', de: 'Kopiert ✓', fr: 'Copié ✓', it: 'Copiato ✓', ja: 'コピーしました ✓', ko: '복사됨 ✓', ar: 'تم النسخ ✓' },
  deleteBtn:   { en: 'Delete', es: 'Eliminar', pt: 'Excluir', pl: 'Usuń', ru: 'Удалить', de: 'Löschen', fr: 'Supprimer', it: 'Elimina', ja: '削除', ko: '삭제', ar: 'حذف' },
  confirmTitle:{ en: 'Delete this key?', es: '¿Eliminar esta clave?', pt: 'Excluir esta chave?', pl: 'Usunąć ten klucz?', ru: 'Удалить этот ключ?', de: 'Diesen Schlüssel löschen?', fr: 'Supprimer cette clé ?', it: 'Eliminare questa chiave?', ja: 'このキーを削除しますか？', ko: '이 키를 삭제하시겠습니까?', ar: 'حذف هذا المفتاح؟' },
  confirmBody: { en: 'This permanently removes it from the safe. The provider key itself is not affected.', es: 'Esto la elimina permanentemente de la caja. La clave del proveedor no se ve afectada.', pt: 'Isso a remove permanentemente do cofre. A chave do provedor não é afetada.', pl: 'To trwale usuwa go z sejfu. Sam klucz dostawcy nie jest naruszony.', ru: 'Это навсегда удалит его из сейфа. Сам ключ провайдера не затрагивается.', de: 'Dadurch wird er dauerhaft aus dem Tresor entfernt. Der Schlüssel beim Anbieter selbst ist nicht betroffen.', fr: 'Elle sera définitivement supprimée du coffre. La clé chez le fournisseur n\'est pas affectée.', it: 'La chiave viene rimossa definitivamente dalla cassaforte. La chiave del provider non viene toccata.', ja: '金庫から完全に削除されます。プロバイダー側のキー自体には影響しません。', ko: '금고에서 영구적으로 삭제됩니다. 공급자 측 키 자체에는 영향이 없습니다.', ar: 'سيؤدي هذا إلى إزالته نهائيًا من الخزنة. لا يتأثر مفتاح المزوّد نفسه.' },
  lastUsed:    { en: 'Last revealed', es: 'Última revelación', pt: 'Última revelação', pl: 'Ostatnio ujawniono', ru: 'Последний просмотр', de: 'Zuletzt angezeigt', fr: 'Dernière révélation', it: 'Ultima visualizzazione', ja: '最終表示', ko: '마지막 표시', ar: 'آخر كشف' },
  never:       { en: 'never', es: 'nunca', pt: 'nunca', pl: 'nigdy', ru: 'никогда', de: 'nie', fr: 'jamais', it: 'mai', ja: 'なし', ko: '없음', ar: 'أبدًا' },
  platformKeys:{ en: 'Platform keys (Vercel mirror, read-only)', es: 'Claves de la plataforma (espejo de Vercel, solo lectura)', pt: 'Chaves da plataforma (espelho da Vercel, somente leitura)', pl: 'Klucze platformy (lustro Vercel, tylko odczyt)', ru: 'Ключи платформы (зеркало Vercel, только чтение)', de: 'Plattformschlüssel (Vercel-Spiegel, schreibgeschützt)', fr: 'Clés de la plateforme (miroir Vercel, lecture seule)', it: 'Chiavi della piattaforma (mirror Vercel, sola lettura)', ja: 'プラットフォームキー（Vercel ミラー、読み取り専用）', ko: '플랫폼 키(Vercel 미러, 읽기 전용)', ar: 'مفاتيح المنصة (نسخة مطابقة من Vercel، للقراءة فقط)' },
  hidesSoon:   { en: 'hides automatically in 15s', es: 'se oculta automáticamente en 15s', pt: 'oculta automaticamente em 15s', pl: 'ukryje się automatycznie za 15s', ru: 'скроется автоматически через 15с', de: 'wird nach 15 s automatisch ausgeblendet', fr: 'se masque automatiquement après 15 s', it: 'si nasconde automaticamente dopo 15 s', ja: '15秒後に自動的に非表示', ko: '15초 후 자동으로 숨겨짐', ar: 'يُخفى تلقائيًا بعد 15 ث' },
  clipClears:  { en: 'clipboard clears in 10s', es: 'el portapapeles se borra en 10s', pt: 'a área de transferência limpa em 10s', pl: 'schowek wyczyści się za 10s', ru: 'буфер очистится через 10с', de: 'Zwischenablage wird nach 10 s geleert', fr: 'le presse-papiers est vidé après 10 s', it: 'gli appunti si svuotano dopo 10 s', ja: 'クリップボードは10秒後に消去', ko: '클립보드는 10초 후 지워짐', ar: 'تُمسح الحافظة بعد 10 ث' },
  expiresF:    { en: 'Expiration date (optional)', es: 'Fecha de expiración (opcional)', pt: 'Data de expiração (opcional)', pl: 'Data wygaśnięcia (opcjonalnie)', ru: 'Срок действия (необязательно)', de: 'Ablaufdatum (optional)', fr: 'Date d\'expiration (facultatif)', it: 'Data di scadenza (facoltativa)', ja: '有効期限（任意）', ko: '만료일(선택 사항)', ar: 'تاريخ الانتهاء (اختياري)' },
  expires:     { en: 'Expires', es: 'Expira', pt: 'Expira', pl: 'Wygasa', ru: 'Истекает', de: 'Läuft ab', fr: 'Expire', it: 'Scade', ja: '有効期限', ko: '만료', ar: 'تنتهي الصلاحية' },
  expired:     { en: 'EXPIRED', es: 'EXPIRADA', pt: 'EXPIRADA', pl: 'WYGASŁ', ru: 'ИСТЁК', de: 'ABGELAUFEN', fr: 'EXPIRÉE', it: 'SCADUTA', ja: '期限切れ', ko: '만료됨', ar: 'منتهي الصلاحية' },
  expSoon:     { en: 'expiring soon', es: 'expira pronto', pt: 'expirando em breve', pl: 'wkrótce wygaśnie', ru: 'скоро истекает', de: 'läuft bald ab', fr: 'expire bientôt', it: 'in scadenza', ja: 'まもなく期限切れ', ko: '곧 만료', ar: 'تنتهي صلاحيته قريبًا' },
  expBannerRed:{ en: 'key(s) have EXPIRED — replace them.', es: 'clave(s) han EXPIRADO — reemplázalas.', pt: 'chave(s) EXPIRARAM — substitua-as.', pl: 'klucz(e) WYGASŁY — wymień je.', ru: 'ключ(и) ИСТЕКЛИ — замените их.', de: 'Schlüssel sind ABGELAUFEN – ersetzen Sie sie.', fr: 'clé(s) ont EXPIRÉ — remplacez-les.', it: 'chiave/i SCADUTA/E — sostituiscile.', ja: '件のキーが期限切れです。交換してください。', ko: '개의 키가 만료되었습니다. 교체하세요.', ar: 'مفتاح (مفاتيح) انتهت صلاحيتها — استبدلها.' },
  expBannerYel:{ en: 'key(s) expiring within 14 days.', es: 'clave(s) expiran en 14 días.', pt: 'chave(s) expiram em 14 dias.', pl: 'klucz(e) wygasają w ciągu 14 dni.', ru: 'ключ(и) истекают в течение 14 дней.', de: 'Schlüssel laufen innerhalb von 14 Tagen ab.', fr: 'clé(s) expirent d\'ici 14 jours.', it: 'chiave/i in scadenza entro 14 giorni.', ja: '件のキーが14日以内に期限切れになります。', ko: '개의 키가 14일 이내에 만료됩니다.', ar: 'مفتاح (مفاتيح) تنتهي صلاحيتها خلال 14 يومًا.' },
  formatWarn:  { en: 'This does not look like a typical key for this provider. Double-check before saving.', es: 'No parece una clave típica de este proveedor. Verifica antes de guardar.', pt: 'Não parece uma chave típica deste provedor. Verifique antes de salvar.', pl: 'To nie wygląda jak typowy klucz tego dostawcy. Sprawdź przed zapisaniem.', ru: 'Это не похоже на типичный ключ этого провайдера. Проверьте перед сохранением.', de: 'Dies sieht nicht wie ein typischer Schlüssel für diesen Anbieter aus. Bitte vor dem Speichern prüfen.', fr: 'Cela ne ressemble pas à une clé typique de ce fournisseur. Vérifiez avant d\'enregistrer.', it: 'Non sembra una chiave tipica di questo provider. Controlla prima di salvare.', ja: 'このプロバイダーの一般的なキーの形式ではないようです。保存前に確認してください。', ko: '이 공급자의 일반적인 키 형식이 아닌 것 같습니다. 저장하기 전에 다시 확인하세요.', ar: 'لا يبدو هذا مفتاحًا معتادًا لهذا المزوّد. تحقّق قبل الحفظ.' },
  timelineT:   { en: 'Activity timeline', es: 'Línea de actividad', pt: 'Linha de atividade', pl: 'Oś aktywności', ru: 'Лента активности', de: 'Aktivitätsverlauf', fr: 'Chronologie des activités', it: 'Cronologia attività', ja: 'アクティビティタイムライン', ko: '활동 타임라인', ar: 'المخطط الزمني للنشاط' },
  tlAll:       { en: 'All', es: 'Todas', pt: 'Todas', pl: 'Wszystkie', ru: 'Все', de: 'Alle', fr: 'Tous', it: 'Tutti', ja: 'すべて', ko: '전체', ar: 'الكل' },
  suggest:     { en: 'Suggestions', es: 'Sugerencias', pt: 'Sugestões', pl: 'Sugestie', ru: 'Подсказки', de: 'Vorschläge', fr: 'Suggestions', it: 'Suggerimenti', ja: '提案', ko: '제안', ar: 'اقتراحات' },
  detailsT:    { en: 'Key details', es: 'Detalles de la clave', pt: 'Detalhes da chave', pl: 'Szczegóły klucza', ru: 'Детали ключа', de: 'Schlüsseldetails', fr: 'Détails de la clé', it: 'Dettagli chiave', ja: 'キーの詳細', ko: '키 세부 정보', ar: 'تفاصيل المفتاح' },
  createdT:    { en: 'Created', es: 'Creada', pt: 'Criada', pl: 'Utworzono', ru: 'Создан', de: 'Erstellt', fr: 'Créé', it: 'Creato', ja: '作成日', ko: '생성됨', ar: 'تاريخ الإنشاء' },
  historyT:    { en: 'History of this key', es: 'Historial de esta clave', pt: 'Histórico desta chave', pl: 'Historia tego klucza', ru: 'История этого ключа', de: 'Verlauf dieses Schlüssels', fr: 'Historique de cette clé', it: 'Cronologia di questa chiave', ja: 'このキーの履歴', ko: '이 키의 기록', ar: 'سجل هذا المفتاح' },
  openDash:    { en: 'Open provider dashboard', es: 'Abrir panel del proveedor', pt: 'Abrir painel do provedor', pl: 'Otwórz panel dostawcy', ru: 'Открыть панель провайдера', de: 'Anbieter-Dashboard öffnen', fr: 'Ouvrir le tableau de bord du fournisseur', it: 'Apri dashboard del provider', ja: 'プロバイダーのダッシュボードを開く', ko: '공급자 대시보드 열기', ar: 'فتح لوحة تحكم المزوّد' },
  noHistory:   { en: 'No recorded actions yet.', es: 'Aún no hay acciones registradas.', pt: 'Ainda não há ações registradas.', pl: 'Brak zarejestrowanych działań.', ru: 'Действий пока не записано.', de: 'Noch keine Aktionen aufgezeichnet.', fr: 'Aucune action enregistrée pour l\'instant.', it: 'Nessuna azione registrata finora.', ja: '記録された操作はまだありません。', ko: '아직 기록된 작업이 없습니다.', ar: 'لا توجد إجراءات مسجّلة بعد.' },
  pickProv:    { en: 'Select a provider to retrieve its keys…', es: 'Selecciona un proveedor para recuperar sus claves…', pt: 'Selecione um provedor para recuperar suas chaves…', pl: 'Wybierz dostawcę, aby pobrać jego klucze…', ru: 'Выберите провайдера, чтобы получить его ключи…', de: 'Wählen Sie einen Anbieter, um seine Schlüssel abzurufen…', fr: 'Sélectionnez un fournisseur pour récupérer ses clés…', it: 'Seleziona un provider per recuperarne le chiavi…', ja: 'キーを取得するプロバイダーを選択してください…', ko: '키를 가져올 공급자를 선택하세요…', ar: 'اختر مزوّدًا لاسترجاع مفاتيحه…' },
  retrieving:  { en: 'Retrieving keys…', es: 'Recuperando claves…', pt: 'Recuperando chaves…', pl: 'Pobieranie kluczy…', ru: 'Получение ключей…', de: 'Schlüssel werden abgerufen…', fr: 'Récupération des clés…', it: 'Recupero delle chiavi…', ja: 'キーを取得中…', ko: '키를 가져오는 중…', ar: 'جارٍ استرجاع المفاتيح…' },
  noProviders: { en: 'The safe is empty. Add your first key — it will be encrypted before it is stored.', es: 'La caja está vacía. Agrega tu primera clave — se cifrará antes de guardarse.', pt: 'O cofre está vazio. Adicione sua primeira chave — ela será criptografada antes de ser armazenada.', pl: 'Sejf jest pusty. Dodaj pierwszy klucz — zostanie zaszyfrowany przed zapisaniem.', ru: 'Сейф пуст. Добавьте первый ключ — он будет зашифрован перед сохранением.', de: 'Der Tresor ist leer. Fügen Sie Ihren ersten Schlüssel hinzu – er wird vor dem Speichern verschlüsselt.', fr: 'Le coffre est vide. Ajoutez votre première clé — elle sera chiffrée avant d\'être stockée.', it: 'La cassaforte è vuota. Aggiungi la tua prima chiave — verrà cifrata prima di essere salvata.', ja: '金庫は空です。最初のキーを追加してください。保存前に暗号化されます。', ko: '금고가 비어 있습니다. 첫 번째 키를 추가하세요. 저장 전에 암호화됩니다.', ar: 'الخزنة فارغة. أضف مفتاحك الأول — سيُشفَّر قبل تخزينه.' },
  refreshed:   { en: '✓ Updated', es: '✓ Actualizado', pt: '✓ Atualizado', pl: '✓ Zaktualizowano', ru: '✓ Обновлено', de: '✓ Aktualisiert', fr: '✓ Mis à jour', it: '✓ Aggiornato', ja: '✓ 更新しました', ko: '✓ 업데이트됨', ar: '✓ تم التحديث' },
  refreshBtn:  { en: '↻ Refresh', es: '↻ Actualizar', pt: '↻ Atualizar', pl: '↻ Odśwież', ru: '↻ Обновить', de: '↻ Aktualisieren', fr: '↻ Actualiser', it: '↻ Aggiorna', ja: '↻ 更新', ko: '↻ 새로 고침', ar: '↻ تحديث' },
}
function v(key: string, lang: Lang): string { const e = V[key]; return e ? (e[lang] || e.en) : key }

type VaultItem = { id: string; provider: string; label: string; last4: string; created_at: string; last_accessed_at: string | null; expires_at: string | null }

const PROVIDER_TONES: Record<string, Tone> = { supabase: TONES.green, stripe: TONES.blue, vercel: TONES.purple, openai: TONES.cyan, github: TONES.gray }
function toneFor(provider: string): Tone { return PROVIDER_TONES[provider.toLowerCase()] || TONES.gold }

type ProviderGroup = { key: string; title: string; icon: string; tone: Tone; prefixes: string[] }
const GROUPS: ProviderGroup[] = [
  { key: 'supabase', title: uiText('generatedUi.u_fe7ceb7816ed0e35'), icon: '🗄️', tone: TONES.green,  prefixes: ['SUPABASE', 'NEXT_PUBLIC_SUPABASE'] },
  { key: 'stripe',   title: uiText('generatedUi.u_961a6062ba1ba2d8'),   icon: '💳', tone: TONES.blue,   prefixes: ['STRIPE'] },
  { key: 'vercel',   title: uiText('generatedUi.u_68edc75c015e2e10'),   icon: '🌐', tone: TONES.purple, prefixes: ['VERCEL'] },
  { key: 'openai',   title: uiText('generatedUi.u_8b7d1a3187ab355d'),   icon: '🤖', tone: TONES.cyan,   prefixes: ['OPENAI'] },
  { key: 'github',   title: uiText('generatedUi.u_f911e414cf6bdfc5'),   icon: '🐙', tone: TONES.gray,   prefixes: ['GITHUB'] },
  { key: 'other',    title: '',         icon: '🧩', tone: TONES.gold,   prefixes: [] },
]
function groupFor(name: string): string {
  for (const g of GROUPS) { if (g.prefixes.some(p => name.startsWith(p))) return g.key }
  return 'other'
}

type CatalogEntry = { name: string; icon: string; labels: string[] }
const PROVIDERS: CatalogEntry[] = [
  { name: 'Stripe', icon: '💳', labels: ['Production API Key', 'Test API Key', 'Webhook Secret', 'Publishable Key'] },
  { name: 'Supabase', icon: '🗄️', labels: ['Service Role Key', 'Anon Public Key', 'Database Password'] },
  { name: 'Vercel', icon: '🌐', labels: ['API Token'] },
  { name: 'OpenAI', icon: '🤖', labels: ['Production Key', 'Test Key'] },
  { name: 'Anthropic', icon: '🧠', labels: ['Production Key'] },
  { name: 'GitHub', icon: '🐙', labels: ['Write Token', 'Read Token', 'Personal Access Token'] },
  { name: 'ElevenLabs', icon: '🎙️', labels: ['Production Key'] },
  { name: 'AssemblyAI', icon: '📝', labels: ['API Key'] },
  { name: 'Google Cloud', icon: '☁️', labels: ['API Key', 'Service Account JSON'] },
  { name: 'AWS', icon: '🟧', labels: ['Access Key ID', 'Secret Access Key'] },
  { name: 'Azure', icon: '🔷', labels: ['API Key', 'Connection String'] },
  { name: 'Cloudflare', icon: '🛡️', labels: ['API Token', 'Zone API Key'] },
  { name: 'Resend', icon: '✉️', labels: ['API Key'] },
  { name: 'SendGrid', icon: '📧', labels: ['API Key'] },
  { name: 'Mailgun', icon: '📮', labels: ['API Key', 'SMTP Password'] },
  { name: 'Twilio', icon: '📞', labels: ['Account SID', 'Auth Token'] },
  { name: 'Slack', icon: '💬', labels: ['Bot Token', 'Webhook URL'] },
  { name: 'Discord', icon: '🎮', labels: ['Bot Token', 'Webhook URL'] },
  { name: 'Telegram', icon: '✈️', labels: ['Bot Token'] },
  { name: 'Notion', icon: '📓', labels: ['Integration Token'] },
  { name: 'Airtable', icon: '📊', labels: ['API Key', 'Personal Access Token'] },
  { name: 'Shopify', icon: '🛍️', labels: ['Admin API Token', 'Storefront Token'] },
  { name: 'PayPal', icon: '💰', labels: ['Client ID', 'Client Secret'] },
  { name: 'Meta', icon: '📘', labels: ['App Secret', 'Access Token'] },
  { name: 'X / Twitter', icon: '🐦', labels: ['API Key', 'Bearer Token'] },
  { name: 'LinkedIn', icon: '💼', labels: ['Client ID', 'Client Secret'] },
  { name: 'TikTok', icon: '🎵', labels: ['Client Key', 'Client Secret'] },
  { name: 'YouTube', icon: '▶️', labels: ['API Key'] },
  { name: 'MongoDB', icon: '🍃', labels: ['Connection String'] },
  { name: 'Neon', icon: '⚡', labels: ['Connection String', 'API Key'] },
  { name: 'Upstash', icon: '🔺', labels: ['REST Token', 'Redis URL'] },
  { name: 'Firebase', icon: '🔥', labels: ['API Key', 'Service Account JSON'] },
  { name: 'Netlify', icon: '🌊', labels: ['Personal Access Token'] },
  { name: 'DigitalOcean', icon: '🌀', labels: ['API Token'] },
  { name: 'Algolia', icon: '🔍', labels: ['Admin API Key', 'Search-Only Key'] },
  { name: 'Pinecone', icon: '🌲', labels: ['API Key'] },
  { name: 'Hugging Face', icon: '🤗', labels: ['Access Token'] },
  { name: 'Replicate', icon: '🔁', labels: ['API Token'] },
  { name: 'Sentry', icon: '🚨', labels: ['Auth Token', 'DSN'] },
  { name: 'Mapbox', icon: '🗺️', labels: ['Access Token'] },
  { name: 'Unsplash', icon: '📷', labels: ['Access Key', 'Secret Key'] },
  { name: 'Brave Search', icon: '🦁', labels: ['API Key'] },
]

const CATEGORY: Record<string, string> = {
  'Stripe': 'Payments', 'PayPal': 'Payments', 'Shopify': 'Payments',
  'Supabase': 'Data', 'MongoDB': 'Data', 'Neon': 'Data', 'Upstash': 'Data', 'Firebase': 'Data', 'Airtable': 'Data', 'Algolia': 'Data', 'Pinecone': 'Data',
  'OpenAI': 'AI', 'Anthropic': 'AI', 'ElevenLabs': 'AI', 'AssemblyAI': 'AI', 'Hugging Face': 'AI', 'Replicate': 'AI',
  'Vercel': 'Infrastructure', 'GitHub': 'Infrastructure', 'Google Cloud': 'Infrastructure', 'AWS': 'Infrastructure', 'Azure': 'Infrastructure', 'Cloudflare': 'Infrastructure', 'Netlify': 'Infrastructure', 'DigitalOcean': 'Infrastructure', 'Sentry': 'Infrastructure', 'Mapbox': 'Infrastructure',
  'Resend': 'Communication', 'SendGrid': 'Communication', 'Mailgun': 'Communication', 'Twilio': 'Communication', 'Slack': 'Communication', 'Discord': 'Communication', 'Telegram': 'Communication',
}
const CAT_ORDER = ['Payments', 'Data', 'AI', 'Infrastructure', 'Communication', 'Other']

const PROVIDER_DASH: Record<string, string> = {
  'Stripe': 'https://dashboard.stripe.com/apikeys',
  'Supabase': 'https://supabase.com/dashboard',
  'Vercel': 'https://vercel.com/account/settings/tokens',
  'OpenAI': 'https://platform.openai.com/api-keys',
  'Anthropic': 'https://console.anthropic.com/settings/keys',
  'GitHub': 'https://github.com/settings/tokens',
  'ElevenLabs': 'https://elevenlabs.io/app/settings/api-keys',
  'AssemblyAI': 'https://www.assemblyai.com/app',
  'Google Cloud': 'https://console.cloud.google.com/apis/credentials',
  'AWS': 'https://console.aws.amazon.com/iam/home',
  'Cloudflare': 'https://dash.cloudflare.com/profile/api-tokens',
  'Resend': 'https://resend.com/api-keys',
  'SendGrid': 'https://app.sendgrid.com/settings/api_keys',
  'Twilio': 'https://console.twilio.com',
  'Slack': 'https://api.slack.com/apps',
  'Shopify': 'https://admin.shopify.com',
  'Firebase': 'https://console.firebase.google.com',
}

function formatLooksOff(provider: string, value: string): boolean {
  if (!value) return false
  const p = provider.toLowerCase()
  if (p.includes('stripe')) return !value.startsWith('sk_') && !value.startsWith('pk_') && !value.startsWith('whsec_') && !value.startsWith('price_')
  if (p.includes('openai')) return !value.startsWith('sk-')
  if (p.includes('aws')) return !value.startsWith('AKIA')
  if (p.includes('github')) return !(value.startsWith('ghp_') || value.startsWith('github_pat_'))
  if (p.includes('supabase')) return !(value.startsWith('eyJ') || value.startsWith('sb'))
  return false
}

type AuditEntry = { id: string; actor: string; action: string; provider: string; label: string; created_at: string }
const DAY = 86400000
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 13.5, outline: 'none' }

export default function KeyVaultPage({ lang, data, loading }: PageProps) {
  const router = useRouter()
  const [items, setItems] = useState<VaultItem[]>([])
  const [safeLoading, setSafeLoading] = useState(true)
  const [safeError, setSafeError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [fProvider, setFProvider] = useState('')
  const [fLabel, setFLabel] = useState('')
  const [fValue, setFValue] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [fExpires, setFExpires] = useState('')
  const [pSearch, setPSearch] = useState('')
  const [customP, setCustomP] = useState(false)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [tlFilter, setTlFilter] = useState('all')
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [provList, setProvList] = useState<{ provider: string; count: number }[]>([])
  const [selProvider, setSelProvider] = useState<string | null>(null)
  const [ddOpen, setDdOpen] = useState(false)
  const [refreshFlash, setRefreshFlash] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const clipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadProviders = async () => {
    setSafeLoading(true)
    setSafeError(null)
    try {
      const res = await fetch('/api/hub/vault?providers=1&t=' + Date.now(), { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || String(res.status))
      setProvList(json.providers || [])
    } catch (err: any) {
      setSafeError(err?.message || 'Failed to load safe')
    } finally {
      setSafeLoading(false)
    }
  }

  const retrieveKeys = async (provider: string) => {
    setSelProvider(provider)
    setDdOpen(false)
    setItems([])
    setSafeLoading(true)
    setSafeError(null)
    try {
      const res = await fetch('/api/hub/vault?provider=' + encodeURIComponent(provider) + '&t=' + Date.now(), { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || String(res.status))
      setItems(json.items || [])
    } catch (err: any) {
      setSafeError(err?.message || 'Failed to retrieve keys')
    } finally {
      setSafeLoading(false)
    }
  }

  const refreshNow = async () => {
    const provider = selProvider
    if (!provider || refreshing) return

    setRefreshing(true)
    setSafeError(null)
    try {
      // Refresh the selected safe provider.
      await retrieveKeys(provider)

      // Refresh provider counts and audit timeline.
      await loadProviders()
      await loadAudit()

      // Refresh parent/server data too. This is required for the
      // Platform keys / Vercel mirror section because it comes from props.
      router.refresh()

      setRefreshFlash(true)
      setTimeout(() => setRefreshFlash(false), 1600)
    } catch (err: any) {
      setSafeError(err?.message || 'Refresh failed')
      console.error('[Vault Refresh]', err)
    } finally {
      setRefreshing(false)
    }
  }

  const loadAudit = async () => {
    try {
      const res = await fetch('/api/hub/vault?audit=1&t=' + Date.now(), { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) setAudit(json.audit || [])
    } catch {}
  }
  useEffect(() => { loadProviders(); loadAudit() }, [])
  useEffect(() => () => { Object.values(timersRef.current).forEach(clearTimeout) }, [])

  const addKey = async () => {
    if (!fProvider.trim() || !fLabel.trim() || !fValue) return
    setSavingKey(true)
    setSafeError(null)
    try {
      const res = await fetch('/api/hub/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: fProvider, label: fLabel, value: fValue, expiresAt: fExpires ? new Date(fExpires).toISOString() : null }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || String(res.status))
      setShowAdd(false)
      const addedProvider = fProvider
      setFProvider(''); setFLabel(''); setFValue(''); setFExpires(''); setPSearch(''); setCustomP(false)
      loadProviders()
      retrieveKeys(addedProvider)
      loadAudit()
    } catch (err: any) {
      setSafeError(err?.message || 'Failed to save key')
    } finally {
      setSavingKey(false)
    }
  }

  const revealKey = async (id: string) => {
    try {
      const res = await fetch('/api/hub/vault', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || String(res.status))
      setRevealed(prev => ({ ...prev, [id]: json.value }))
      setItems(prev => prev.map(i => i.id === id ? { ...i, last_accessed_at: new Date().toISOString() } : i))
      if (timersRef.current[id]) clearTimeout(timersRef.current[id])
      timersRef.current[id] = setTimeout(() => {
        setRevealed(prev => { const next = { ...prev }; delete next[id]; return next })
      }, 15000)
      loadAudit()
    } catch (err: any) {
      setSafeError(err?.message || 'Reveal failed')
    }
  }

  const hideKey = (id: string) => {
    if (timersRef.current[id]) clearTimeout(timersRef.current[id])
    setRevealed(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  const copyKey = async (id: string) => {
    const value = revealed[id]
    if (!value) return
    const item = items.find(i => i.id === id)
    try {
      await navigator.clipboard.writeText(value)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1800)
      if (clipTimerRef.current) clearTimeout(clipTimerRef.current)
      clipTimerRef.current = setTimeout(async () => {
        try { if (document.hasFocus()) await navigator.clipboard.writeText('') } catch {}
      }, 10000)
      fetch('/api/hub/vault', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'copy', provider: item?.provider, label: item?.label }) }).then(() => loadAudit()).catch(() => {})
    } catch {}
  }

  const deleteKey = async (id: string) => {
    setConfirmId(null)
    try {
      const res = await fetch('/api/hub/vault', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || String(res.status))
      hideKey(id)
      setItems(prev => prev.filter(i => i.id !== id))
      setDrawerId(null)
      loadProviders()
      loadAudit()
    } catch (err: any) {
      setSafeError(err?.message || 'Delete failed')
    }
  }
// ── Platform keys (Vercel mirror) ──
  const configured = !!data?.vercel.configured
  const scopes = data?.vercel.scopes || []
  const inventory = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const s of scopes) { for (const n of s.names) { if (!map.has(n)) map.set(n, new Set()); map.get(n)!.add(s.scope) } }
    const byGroup: Record<string, { name: string; envs: Set<string> }[]> = {}
    for (const [name, envs] of map.entries()) {
      const g = groupFor(name)
      if (!byGroup[g]) byGroup[g] = []
      byGroup[g].push({ name, envs })
    }
    for (const g of Object.keys(byGroup)) byGroup[g].sort((a, b) => a.name.localeCompare(b.name))
    return byGroup
  }, [scopes])
  const allScopeNames = scopes.map(s => s.scope)
  const coreNames = allScopeNames.filter(s => s !== 'Development')
  const [openGroup, setOpenGroup] = useState<Record<string, boolean>>({})

  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : v('never', lang)

  return (
    <div className="hub-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 14, overflowY: 'auto', paddingRight: 4 }}>

      {/* ── SECTION 1: My Safe ─────────────────────────────────────── */}
      <section style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>🔐 {v("mySafe", lang)}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.55)', maxWidth: 720 }}>{v("safeSub", lang)}</div>
          </div>
          <button onClick={() => setShowAdd(true)} className="hub-btn" style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid rgba(255,195,0,.5)', background: 'rgba(255,195,0,.12)', color: '#ffc300', fontSize: 13, fontWeight: 800 }}>{v("addKey", lang)}</button>
        </div>

        {safeError && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 11, border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.09)', fontSize: 12.5, marginBottom: 8 }}><span>⚠️</span><span style={{ flex: 1 }}>{safeError}</span><button onClick={() => setSafeError(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', cursor: 'pointer' }}>×</button></div>}

        {/* Provider dropdown: grouped by category; keys retrieved on selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 440 }}>
            <button onClick={() => setDdOpen(o => !o)} className="hub-chip" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', borderRadius: 11, fontSize: 13.5, fontWeight: 700, background: 'rgba(255,255,255,.05)', border: ddOpen ? '1px solid rgba(26,240,255,.5)' : '1px solid rgba(255,255,255,.16)', color: selProvider ? '#fff' : 'rgba(255,255,255,.5)', textAlign: 'left' }}>
              <span style={{ fontSize: 16 }}>{selProvider ? (PROVIDERS.find(p => p.name === selProvider)?.icon || '🧩') : '🗂️'}</span>
              <span style={{ flex: 1 }}>{selProvider || v("pickProv", lang)}</span>
              <span style={{ color: 'rgba(255,255,255,.45)' }}>{ddOpen ? '▴' : '▾'}</span>
            </button>
            {ddOpen && (
              <div className="hub-panel" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, maxHeight: 280, overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(26,240,255,.35)', background: 'linear-gradient(180deg, rgba(15,23,42,.99), rgba(3,7,18,1))', boxShadow: '0 24px 60px rgba(0,0,0,.6)', padding: 8 }}>
                {provList.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'rgba(255,255,255,.5)' }}>{v("noProviders", lang)}</div>}
                {CAT_ORDER.map(cat => {
                  const inCat = provList.filter(p => (CATEGORY[p.provider] || 'Other') === cat)
                  if (inCat.length === 0) return null
                  return (
                    <div key={cat} style={{ marginBottom: 6 }}>
                      <div style={{ ...labelStyle, padding: '5px 8px 3px' }}>{cat}</div>
                      {inCat.map(p => (
                        <button key={p.provider} onClick={() => retrieveKeys(p.provider)} className="hub-chip" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: selProvider === p.provider ? 'rgba(255,195,0,.12)' : 'transparent', border: '1px solid transparent', color: selProvider === p.provider ? '#ffc300' : 'rgba(255,255,255,.78)', textAlign: 'left' }}>
                          <span style={{ fontSize: 15 }}>{PROVIDERS.find(x => x.name === p.provider)?.icon || '🧩'}</span>
                          <span style={{ flex: 1 }}>{p.provider}</span>
                          <span style={{ ...monoStyle, color: 'rgba(255,255,255,.4)' }}>{p.count}</span>
                        </button>
                      ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {selProvider && (
          <button onClick={refreshNow} disabled={safeLoading || refreshing} className="hub-btn" title={v('refreshBtn', lang)} style={{ padding: '11px 14px', borderRadius: 11, border: '1px solid rgba(26,240,255,.4)', background: 'rgba(26,240,255,.08)', color: refreshFlash ? '#86efac' : '#1af0ff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: safeLoading || refreshing ? 'wait' : 'pointer', opacity: safeLoading || refreshing ? 0.6 : 1 }}>
            {safeLoading || refreshing ? '⏳' : refreshFlash ? v("refreshed", lang) : v("refreshBtn", lang)}
          </button>
        )}
        </div>

        {safeLoading && <div className="hub-loading" style={{ padding: '10px 13px', borderRadius: 11, border: '1px solid rgba(26,240,255,.3)', background: 'rgba(26,240,255,.05)', fontSize: 12.5, color: '#1af0ff', marginBottom: 8 }}>⏳ {v("retrieving", lang)}</div>}

        {(() => {
          const now = Date.now()
          const nExpired = items.filter(i => i.expires_at && new Date(i.expires_at).getTime() < now).length
          const nSoon = items.filter(i => i.expires_at && new Date(i.expires_at).getTime() >= now && new Date(i.expires_at).getTime() < now + 14 * DAY).length
          return (
            <>
              {nExpired > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 11, border: '1px solid rgba(239,68,68,.5)', background: 'rgba(239,68,68,.1)', fontSize: 12.5, marginBottom: 8 }}><span>⛔</span>{nExpired} {v("expBannerRed", lang)}</div>}
              {nSoon > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 11, border: '1px solid rgba(255,195,0,.5)', background: 'rgba(255,195,0,.08)', fontSize: 12.5, marginBottom: 8 }}><span>⚠️</span>{nSoon} {v("expBannerYel", lang)}</div>}
            </>
          )
        })()}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 10 }}>
          {items.map(item => {
            const tone = toneFor(item.provider)
            const shown = revealed[item.id]
            return (
              <div key={item.id} className="hub-card" style={{ borderRadius: 14, border: `1px solid ${tone.border}`, background: 'linear-gradient(160deg, rgba(15,23,42,.72), rgba(3,7,18,.86))', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => setDrawerId(item.id)} title={v('detailsT', lang)}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: tone.strong }}>{item.provider}</div>
                    <div style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label} <span style={{ color: 'rgba(255,255,255,.35)', fontSize: 12 }}>›</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => shown ? hideKey(item.id) : revealKey(item.id)} title={uiText('generatedUi.u_36b830bdb447f8c7')} className="hub-chip" style={{ padding: '6px 10px', borderRadius: 9, fontSize: 14, background: shown ? 'rgba(26,240,255,.14)' : 'rgba(255,255,255,.05)', border: shown ? '1px solid rgba(26,240,255,.45)' : '1px solid rgba(255,255,255,.15)' }}>{shown ? '🙈' : '👁'}</button>
                    <button onClick={() => setConfirmId(item.id)} title={v('deleteBtn', lang)} className="hub-chip" style={{ padding: '6px 10px', borderRadius: 9, fontSize: 13, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)', color: '#fca5a5' }}>🗑</button>
                  </div>
                </div>
                {!shown && <div style={{ ...monoStyle, fontSize: 13, color: 'rgba(255,255,255,.5)' }}>••••••••••••{item.last4}</div>}
                {shown && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ ...monoStyle, fontSize: 12, wordBreak: 'break-all', padding: '8px 10px', borderRadius: 9, background: 'rgba(26,240,255,.06)', border: '1px solid rgba(26,240,255,.3)' }}>{shown}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => copyKey(item.id)} className="hub-btn" style={{ padding: '6px 13px', borderRadius: 9, border: '1px solid rgba(26,240,255,.45)', background: 'rgba(26,240,255,.1)', color: '#1af0ff', fontSize: 12, fontWeight: 700 }}>{copiedId === item.id ? v("copied", lang) : v("copyBtn", lang)}</button>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{v("hidesSoon", lang)} · {v("clipClears", lang)}</span>
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{v("lastUsed", lang)}: {fmtDate(item.last_accessed_at)}</div>
                {item.expires_at && (() => {
                  const t = new Date(item.expires_at).getTime()
                  const expired = t < Date.now()
                  const soon = !expired && t < Date.now() + 14 * DAY
                  return <div style={{ fontSize: 11, fontWeight: 700, color: expired ? '#fca5a5' : soon ? '#ffc300' : 'rgba(255,255,255,.45)' }}>{expired ? '⛔ ' + v("expired", lang) : (soon ? '⚠️ ' : '') + v("expires", lang) + ': ' + fmtDate(item.expires_at)}{soon && !expired ? ' · ' + v("expSoon", lang) : ''}</div>
                })()}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Activity timeline (vault_audit) ─────────────────────────── */}
      <section style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={labelStyle}>{v("timelineT", lang)}</div>
          {["all", "add", "reveal", "copy", "delete"].map(f => (
            <button key={f} onClick={() => setTlFilter(f)} className="hub-chip" style={{ padding: '4px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, textTransform: f === 'all' ? 'none' : 'lowercase', background: tlFilter === f ? 'rgba(26,240,255,.14)' : 'rgba(255,255,255,.04)', border: tlFilter === f ? '1px solid rgba(26,240,255,.45)' : '1px solid rgba(255,255,255,.12)', color: tlFilter === f ? '#1af0ff' : 'rgba(255,255,255,.55)' }}>{f === 'all' ? v("tlAll", lang) : f}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }} className="hub-panel">
          {audit.filter(a => tlFilter === 'all' || a.action === tlFilter).slice(0, 40).map(a => (
            <div key={a.id} style={{ ...rowStyle, gap: 12 }}>
              <span style={{ ...monoStyle, color: '#1af0ff', flexShrink: 0 }}>{fmtDate(a.created_at)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0, color: a.action === 'delete' ? '#fca5a5' : a.action === 'reveal' ? '#ffc300' : a.action === 'copy' ? '#1af0ff' : a.action === 'sync_vercel' ? '#c4b5fd' : '#86efac' }}>{a.action}</span>
              <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.provider} · {a.label}</span>
              <span style={{ ...monoStyle, color: 'rgba(255,255,255,.4)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{a.actor}</span>
            </div>
          ))}
          {audit.length === 0 && <div style={{ ...rowStyle, color: 'rgba(255,255,255,.45)' }}>—</div>}
        </div>
      </section>

      {/* ── SECTION 2: Platform keys (Vercel mirror) ───────────────── */}
      <section style={{ flexShrink: 0 }}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>{v("platformKeys", lang)}</div>
        {!loading && !configured && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,195,0,.45)', background: 'rgba(255,195,0,.07)', fontSize: 13 }}><span>⚠️</span>{c('vaultNeedsToken', lang)}</div>
        )}
        {configured && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(295px, 1fr))', gap: 14 }}>
            {GROUPS.map(g => {
              const groupItems = inventory[g.key] || []
              if (groupItems.length === 0) return null
              const title = g.key === 'other' ? c('vaultOther', lang) : g.title
              const isOpen = !!openGroup[g.key]
              const shownItems = isOpen ? groupItems : groupItems.slice(0, 5)
              return (
                <section key={g.key} className="hub-card" style={cardStyle}>
                  <Band tone={g.tone} icon={g.icon} title={title} plain={`${groupItems.length} ${c('vaultKeys', lang)}`} sub={c('vaultCoverage', lang)} />
                  <div style={bodyStyle}>
                    <Status ok={groupItems.every(i => coreNames.every(s => i.envs.has(s)))} text={groupItems.every(i => coreNames.every(s => i.envs.has(s))) ? c('allClear', lang) : `${groupItems.filter(i => !coreNames.every(s => i.envs.has(s))).length} ⚠️`} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {shownItems.map(item => {
                        const missing = coreNames.filter(s => !item.envs.has(s))
                        return (
                          <div key={item.name} style={{ ...rowStyle, border: missing.length ? '1px solid rgba(255,195,0,.45)' : rowStyle.border }}>
                            <span style={{ ...monoStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                            <span style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                              {allScopeNames.map(s => (
                                <span key={s} title={s} style={{ width: 18, height: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, background: item.envs.has(s) ? 'rgba(34,197,94,.18)' : s === 'Development' ? 'rgba(255,255,255,.05)' : 'rgba(239,68,68,.16)', border: item.envs.has(s) ? '1px solid rgba(34,197,94,.45)' : s === 'Development' ? '1px solid rgba(255,255,255,.14)' : '1px solid rgba(239,68,68,.4)', color: item.envs.has(s) ? '#86efac' : s === 'Development' ? 'rgba(255,255,255,.35)' : '#fca5a5' }}>{s[0]}</span>
                              ))}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {groupItems.length > 5 && (
                      <button onClick={() => setOpenGroup(prev => ({ ...prev, [g.key]: !prev[g.key] }))} className="hub-chip" style={{ alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.7)' }}>{isOpen ? '▴ ' + c('hideDetails', lang) : `▾ ${c('showDetails', lang)} (${groupItems.length})`}</button>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Key details drawer (portal) ─────────────────────────────── */}
      {drawerId && typeof document !== 'undefined' && (() => {
        const item = items.find(i => i.id === drawerId)
        if (!item) return null
        const tone = toneFor(item.provider)
        const icon = PROVIDERS.find(p => p.name === item.provider)?.icon || '🧩'
        const dash = PROVIDER_DASH[item.provider]
        const history = audit.filter(a => a.provider === item.provider && a.label === item.label).slice(0, 15)
        const expT = item.expires_at ? new Date(item.expires_at).getTime() : null
        const expired = expT !== null && expT < Date.now()
        const soon = expT !== null && !expired && expT < Date.now() + 14 * DAY
        return createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(3,7,18,.55)', backdropFilter: 'blur(3px)' }} onClick={() => setDrawerId(null)}>
            <div onClick={e => e.stopPropagation()} className="hub-panel" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(420px, 92vw)', background: 'linear-gradient(200deg, rgba(15,23,42,.99), rgba(3,7,18,1))', borderLeft: `1px solid ${tone.border}`, boxShadow: '-30px 0 80px rgba(0,0,0,.55)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: tone.soft, border: `1px solid ${tone.border}`, flexShrink: 0 }}>{icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: tone.strong }}>{item.provider}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                  </div>
                </div>
                <button onClick={() => setDrawerId(null)} className="hub-chip" style={{ padding: '7px 12px', borderRadius: 9, fontSize: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.7)', flexShrink: 0 }}>✕</button>
              </div>

              <div style={{ ...monoStyle, fontSize: 13, padding: '10px 13px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>••••••••••••{item.last4}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.55)' }}>{v("createdT", lang)}</span><span style={monoStyle}>{fmtDate(item.created_at)}</span></div>
                <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.55)' }}>{v("lastUsed", lang)}</span><span style={monoStyle}>{fmtDate(item.last_accessed_at)}</span></div>
                <div style={{ ...rowStyle, border: expired ? '1px solid rgba(239,68,68,.5)' : soon ? '1px solid rgba(255,195,0,.5)' : rowStyle.border }}>
                  <span style={{ color: 'rgba(255,255,255,.55)' }}>{v("expires", lang)}</span>
                  <span style={{ ...monoStyle, color: expired ? '#fca5a5' : soon ? '#ffc300' : undefined }}>{item.expires_at ? (expired ? '⛔ ' : soon ? '⚠️ ' : '') + fmtDate(item.expires_at) : '—'}</span>
                </div>
              </div>

              <div>
                <div style={{ ...labelStyle, marginBottom: 7 }}>{v("historyT", lang)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {history.map(a => (
                    <div key={a.id} style={{ ...rowStyle, gap: 10 }}>
                      <span style={{ ...monoStyle, color: '#1af0ff', flexShrink: 0 }}>{fmtDate(a.created_at)}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0, color: a.action === 'delete' ? '#fca5a5' : a.action === 'reveal' ? '#ffc300' : a.action === 'copy' ? '#1af0ff' : '#86efac' }}>{a.action}</span>
                      <span style={{ ...monoStyle, color: 'rgba(255,255,255,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'right' }}>{a.actor}</span>
                    </div>
                  ))}
                  {history.length === 0 && <div style={{ ...rowStyle, color: 'rgba(255,255,255,.45)' }}>{v("noHistory", lang)}</div>}
                </div>
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {dash && <a href={dash} target="_blank" rel="noreferrer" className="hub-btn" style={{ display: 'block', textAlign: 'center', padding: '11px 14px', borderRadius: 11, border: `1px solid ${tone.border}`, background: tone.soft, color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>↗ {v("openDash", lang)}</a>}
                <button onClick={() => setConfirmId(item.id)} className="hub-btn" style={{ padding: '11px 14px', borderRadius: 11, border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.1)', color: '#fca5a5', fontSize: 13.5, fontWeight: 800 }}>🗑 {v("deleteBtn", lang)}</button>
              </div>
            </div>
          </div>
        , document.body)
      })()}

      {/* ── Add Key modal (portal) ──────────────────────────────────── */}
      {showAdd && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(3,7,18,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }} onClick={() => !savingKey && setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(440px, 100%)', borderRadius: 16, border: '1px solid rgba(255,195,0,.4)', background: 'linear-gradient(160deg, rgba(15,23,42,.97), rgba(3,7,18,.99))', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>🔐 {v("addKey", lang).replace('+ ', '')}</div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 5 }}>{v("provider", lang)}</div>
              {!customP && fProvider && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', borderRadius: 10, border: '1px solid rgba(255,195,0,.55)', background: 'rgba(255,195,0,.1)', fontSize: 14, fontWeight: 800, color: '#ffc300' }}>
                    <span style={{ fontSize: 17 }}>{PROVIDERS.find(p => p.name === fProvider)?.icon || '🧩'}</span>
                    {fProvider}
                    <span style={{ marginLeft: 'auto', color: '#86efac' }}>✓</span>
                  </div>
                  <button onClick={() => { setFProvider(''); setPSearch('') }} className="hub-chip" style={{ padding: '9px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.18)', color: 'rgba(255,255,255,.65)', flexShrink: 0 }}>{uiText('generatedUi.u_f3e2f5d6ce6e26d8')}</button>
                </div>
              )}
              {!customP && !fProvider && (
                <>
                  <input value={pSearch} onChange={e => setPSearch(e.target.value)} placeholder="🔍" style={{ ...inputStyle, marginBottom: 7 }} />
                  <div className="hub-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 132, overflowY: 'auto', padding: 2 }}>
                    {PROVIDERS.filter(p => p.name.toLowerCase().includes(pSearch.trim().toLowerCase())).map(p => (
                      <button key={p.name} onClick={() => { setFProvider(p.name); setPSearch(''); if (!fLabel) setFLabel(p.labels[0]) }} className="hub-chip" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.7)' }}>{p.icon} {p.name}</button>
                    ))}
                    <button onClick={() => { setCustomP(true); setFProvider('') }} className="hub-chip" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, background: 'rgba(255,255,255,.04)', border: '1px dashed rgba(255,255,255,.25)', color: 'rgba(255,255,255,.55)' }}>{uiText('generatedUi.u_f99fdfbed1bf5a8a')}</button>
                  </div>
                </>
              )}
              {customP && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={fProvider} onChange={e => setFProvider(e.target.value)} placeholder={uiText('generatedUi.u_0027f9c07b4b0b5e')} style={inputStyle} autoFocus />
                  <button onClick={() => { setCustomP(false); setFProvider('') }} className="hub-chip" style={{ padding: '6px 12px', borderRadius: 10, fontSize: 12.5, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.6)', flexShrink: 0 }}>↩</button>
                </div>
              )}
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 5 }}>{v("labelF", lang)}</div>
              <input value={fLabel} onChange={e => setFLabel(e.target.value)} placeholder={uiText('generatedUi.u_0f6004d3b09aa7e2')} style={inputStyle} />
              {(() => {
                const sugg = PROVIDERS.find(p => p.name === fProvider)?.labels || []
                if (sugg.length === 0) return null
                return (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.4)', alignSelf: 'center' }}>{v("suggest", lang)}:</span>
                    {sugg.map(s => (<button key={s} onClick={() => setFLabel(s)} className="hub-chip" style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11.5, background: 'rgba(26,240,255,.08)', border: '1px solid rgba(26,240,255,.3)', color: '#1af0ff' }}>{s}</button>))}
                  </div>
                )
              })()}
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 5 }}>{v("valueF", lang)}</div>
              <input value={fValue} onChange={e => setFValue(e.target.value)} type="password" autoComplete="off" placeholder={uiText('generatedUi.u_4c8ab1c7c9983595')} style={inputStyle} />
              {formatLooksOff(fProvider, fValue) && <div style={{ display: 'flex', gap: 7, marginTop: 6, fontSize: 11.5, color: '#ffc300' }}><span>⚠️</span>{v("formatWarn", lang)}</div>}
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 5 }}>{v("expiresF", lang)}</div>
              <input value={fExpires} onChange={e => setFExpires(e.target.value)} type="date" style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setShowAdd(false)} disabled={savingKey} className="hub-chip" style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 700 }}>{v("cancel", lang)}</button>
              <button onClick={addKey} disabled={savingKey || !fProvider.trim() || !fLabel.trim() || !fValue} className="hub-btn" style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(255,195,0,.55)', background: 'rgba(255,195,0,.16)', color: '#ffc300', fontSize: 13, fontWeight: 800, opacity: savingKey || !fProvider.trim() || !fLabel.trim() || !fValue ? .5 : 1 }}>{savingKey ? v("saving", lang) : v("save", lang)}</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ── Delete confirmation modal (portal) ─────────────────────── */}
      {confirmId && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(3,7,18,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }} onClick={() => setConfirmId(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(400px, 100%)', borderRadius: 16, border: '1px solid rgba(239,68,68,.45)', background: 'linear-gradient(160deg, rgba(15,23,42,.97), rgba(3,7,18,.99))', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>🗑 {v("confirmTitle", lang)}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{v("confirmBody", lang)}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setConfirmId(null)} className="hub-chip" style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 700 }}>{v("cancel", lang)}</button>
              <button onClick={() => deleteKey(confirmId)} className="hub-btn" style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(239,68,68,.55)', background: 'rgba(239,68,68,.16)', color: '#fca5a5', fontSize: 13, fontWeight: 800 }}>{v("deleteBtn", lang)}</button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
