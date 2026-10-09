'use client'

// saas/app/dashboard/marketing/press-providers/PressCompanyProfileForm.tsx
// The facts the generator is allowed to state. Without these the model has no way to know your
// real product names and will invent them — that is exactly how a release naming a non-existent
// product reached an editor. Anything left blank becomes a visible [PLACEHOLDER] in the draft
// instead of an invention. Localized in all five platform languages.
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

const COPY: Record<string, Record<string, string>> = {
  en: { title: uiText('generatedUi.u_5e87e8870107d768'), why: uiText('generatedUi.u_7ce7af8674743be9'), legal: uiText('generatedUi.u_07f883c3b610740f'), brand: uiText('generatedUi.u_3cfd0ef82258340c'), website: uiText('generatedUi.u_b5a229ac8becc603'), products: uiText('generatedUi.u_132089eb965f51a3'), boilerplate: uiText('generatedUi.u_9d2c995452192587'), spokesName: uiText('generatedUi.u_f5bad8cc869f5dcb'), spokesTitle: uiText('generatedUi.u_238632feccfb244d'), quote: uiText('generatedUi.u_c6d3a4c1edc2ed0e'), permitted: uiText('generatedUi.u_e978c2756e59fb96'), forbidden: uiText('generatedUi.u_d659e9472620b1bf'), save: uiText('generatedUi.u_f3336a5499e8f3e8'), saving: uiText('generatedUi.u_23e39291d6135814'), saved: uiText('generatedUi.u_38ea25e139588b61'), err: uiText('generatedUi.u_4ff8fa1bce038c4e'), errOwner: uiText('generatedUi.u_983f151fefe7c92d'), empty: uiText('generatedUi.u_b5490779ba25fba4'), edit: uiText('generatedUi.u_464c4ffd019e1e96'), close: uiText('generatedUi.u_7d9eb7acb13e2462') },
  es: { title: 'Datos de la empresa', why: 'El generador solo puede afirmar lo que pongas aquí. Lo que falte aparecerá como [MARCADOR] visible en el borrador, nunca como un dato inventado.', legal: 'Razón social', brand: 'Nombre de marca', website: 'Sitio web', products: 'Nombres de productos: uno por línea (los ÚNICOS que la IA puede usar)', boilerplate: 'Texto estándar: el párrafo "Acerca de"', spokesName: 'Nombre del portavoz', spokesTitle: 'Cargo del portavoz', quote: 'Cita aprobada: se usa literalmente o no se usa ninguna', permitted: 'Afirmaciones permitidas: una por línea', forbidden: 'Afirmaciones prohibidas: una por línea', save: 'Guardar datos', saving: 'Guardando…', saved: 'Guardado. Los nuevos borradores usarán estos datos.', err: 'No se pudo guardar.', errOwner: 'Inicia sesión como propietario para editar los datos.', empty: 'Aún no hay datos guardados: los borradores estarán llenos de marcadores hasta que los completes.', edit: 'Editar', close: 'Cerrar' },
  pt: { title: 'Dados da empresa', why: 'O gerador só pode afirmar o que você colocar aqui. O que faltar aparece como [MARCADOR] visível no rascunho, nunca como um dado inventado.', legal: 'Razão social', brand: 'Nome da marca', website: 'Site', products: 'Nomes de produtos — um por linha (os ÚNICOS que a IA pode usar)', boilerplate: 'Texto padrão — o parágrafo "Sobre a empresa"', spokesName: 'Nome do porta-voz', spokesTitle: 'Cargo do porta-voz', quote: 'Citação aprovada — usada literalmente, ou nenhuma', permitted: 'Afirmações permitidas — uma por linha', forbidden: 'Afirmações proibidas — uma por linha', save: 'Salvar dados', saving: 'Salvando…', saved: 'Salvo. Os novos rascunhos usarão estes dados.', err: 'Não foi possível salvar.', errOwner: 'Entre como proprietário para editar os dados.', empty: 'Nenhum dado salvo ainda — os rascunhos ficarão cheios de marcadores até você preencher.', edit: 'Editar', close: 'Fechar' },
  pl: { title: 'Dane firmy', why: 'Generator może podać wyłącznie to, co tu wpiszesz. Braki pojawią się w projekcie jako widoczny [SYMBOL] — nigdy jako zmyślony szczegół.', legal: 'Nazwa prawna', brand: 'Nazwa marki', website: 'Strona WWW', products: 'Nazwy produktów — po jednej w wierszu (JEDYNE, których AI może użyć)', boilerplate: 'Standardowy akapit „O firmie”', spokesName: 'Imię i nazwisko rzecznika', spokesTitle: 'Stanowisko rzecznika', quote: 'Zatwierdzony cytat — użyty dosłownie albo wcale', permitted: 'Dozwolone twierdzenia — po jednym w wierszu', forbidden: 'Twierdzenia zakazane — po jednym w wierszu', save: 'Zapisz dane', saving: 'Zapisywanie…', saved: 'Zapisano. Nowe projekty użyją tych danych.', err: 'Nie udało się zapisać.', errOwner: 'Zaloguj się jako właściciel, aby edytować dane.', empty: 'Brak zapisanych danych — projekty będą pełne symboli, dopóki tego nie uzupełnisz.', edit: 'Edytuj', close: 'Zamknij' },
  ru: { title: 'Факты о компании', why: 'Генератор может утверждать только то, что вы укажете здесь. Недостающее появится в черновике как видимый [ЗАПОЛНИТЕЛЬ] — никогда как выдуманная деталь.', legal: 'Юридическое название', brand: 'Название бренда', website: 'Сайт', products: 'Названия продуктов — по одному в строке (ЕДИНСТВЕННЫЕ, которые может использовать ИИ)', boilerplate: 'Стандартный абзац «О компании»', spokesName: 'Имя представителя', spokesTitle: 'Должность представителя', quote: 'Утверждённая цитата — дословно или никак', permitted: 'Разрешённые утверждения — по одному в строке', forbidden: 'Запрещённые утверждения — по одному в строке', save: 'Сохранить факты', saving: 'Сохранение…', saved: 'Сохранено. Новые черновики будут использовать эти факты.', err: 'Не удалось сохранить.', errOwner: 'Войдите как владелец, чтобы изменить факты.', empty: 'Факты ещё не сохранены — черновики будут полны заполнителей, пока вы их не заполните.', edit: 'Изменить', close: 'Закрыть' },
  de: { title: 'Unternehmensdaten', why: 'Der Generator darf nur angeben, was Sie hier eintragen. Alles Fehlende erscheint im Entwurf als sichtbarer [PLACEHOLDER] – niemals als erfundenes Detail.', legal: 'Rechtlicher Name', brand: 'Markenname', website: 'Website', products: 'Produktnamen – einer pro Zeile (die EINZIGEN Namen, die die KI verwenden darf)', boilerplate: 'Boilerplate – der Standardabsatz „Über uns“', spokesName: 'Name des Sprechers', spokesTitle: 'Titel des Sprechers', quote: 'Genehmigtes Zitat — wörtlich verwendet oder gar kein Zitat', permitted: 'Zulässige Aussagen – eine pro Zeile', forbidden: 'Aussagen, die niemals getroffen werden dürfen – eine pro Zeile', save: 'Fakten speichern', saving: 'Wird gespeichert…', saved: 'Gespeichert. Neue Entwürfe verwenden diese Fakten.', err: 'Speichern fehlgeschlagen.', errOwner: 'Melden Sie sich als Inhaber an, um Unternehmensangaben zu bearbeiten.', empty: 'Noch keine Fakten gespeichert – Entwürfe sind voller Platzhalter, bis Sie dies ausfüllen.', edit: 'Bearbeiten', close: 'Schließen' },
  fr: { title: 'Informations sur l’entreprise', why: 'Le générateur ne peut indiquer que ce que vous saisissez ici. Tout élément manquant apparaît comme un [PLACEHOLDER] visible dans le brouillon — jamais comme un détail inventé.', legal: 'Raison sociale', brand: 'Nom de la marque', website: 'Site web', products: 'Noms de produits — un par ligne (les SEULS noms que l\'IA peut utiliser)', boilerplate: 'Texte standard — le paragraphe « À propos de nous » habituel', spokesName: 'Nom du porte-parole', spokesTitle: 'Titre du porte-parole', quote: 'Citation approuvée — utilisée mot pour mot, ou aucune citation', permitted: 'Affirmations autorisées — une par ligne', forbidden: 'Affirmations à ne jamais faire — une par ligne', save: 'Enregistrer les faits', saving: 'Enregistrement…', saved: 'Enregistré. Les nouveaux brouillons utiliseront ces faits.', err: 'Impossible d’enregistrer.', errOwner: 'Connectez-vous en tant que propriétaire pour modifier les informations de l\'entreprise.', empty: 'Aucun fait enregistré pour l\'instant : les brouillons seront remplis d\'espaces réservés tant que vous n\'aurez pas complété ceci.', edit: 'Modifier', close: 'Fermer' },
  it: { title: 'Dati aziendali', why: 'Il generatore può riportare solo ciò che inserisci qui. Tutto ciò che manca appare come un [PLACEHOLDER] visibile nella bozza, mai come un dettaglio inventato.', legal: 'Ragione sociale', brand: 'Nome del brand', website: 'Sito web', products: 'Nomi dei prodotti — uno per riga (gli UNICI nomi che l\'AI può usare)', boilerplate: 'Boilerplate: il paragrafo standard "Chi siamo"', spokesName: 'Nome del portavoce', spokesTitle: 'Titolo del portavoce', quote: 'Citazione approvata — usata alla lettera, oppure nessuna citazione', permitted: 'Affermazioni consentite: una per riga', forbidden: 'Affermazioni da non fare mai: una per riga', save: 'Salva fatti', saving: 'Salvataggio…', saved: 'Salvato. Le nuove bozze useranno questi fatti.', err: 'Impossibile salvare.', errOwner: 'Accedi come proprietario per modificare i dati aziendali.', empty: 'Nessun dato salvato: le bozze saranno piene di segnaposto finché non compili questa sezione.', edit: 'Modifica', close: 'Chiudi' },
  ja: { title: '企業情報', why: 'ジェネレーターが記載できるのは、ここに入力した内容のみです。不足している情報は下書き内で目に見える [PLACEHOLDER] として表示され、創作された詳細になることはありません。', legal: '正式名称', brand: 'ブランド名', website: 'ウェブサイト', products: '製品名 — 1 行に 1 つ（AI が使用できる唯一の名前）', boilerplate: '定型文 — 標準の「会社概要」段落', spokesName: '広報担当者名', spokesTitle: '広報担当者の役職', quote: '承認済みの引用 — 原文どおりに使用するか、引用しない', permitted: '許可された主張 — 1行に1つ', forbidden: '決して行ってはならない主張 — 1行に1つ', save: '事実を保存', saving: '保存中…', saved: '保存しました。新しい下書きにはこれらの事実が使用されます。', err: '保存できませんでした。', errOwner: '会社情報を編集するには、オーナーとしてサインインしてください。', empty: '事実はまだ保存されていません。ここを入力するまで、下書きはプレースホルダーだらけになります。', edit: '編集', close: '閉じる' },
  ko: { title: '회사 정보', why: '생성기는 여기에 입력한 내용만 기재할 수 있습니다. 누락된 내용은 초안에 눈에 보이는 [PLACEHOLDER]로 표시되며, 지어낸 세부 정보로 채워지지 않습니다.', legal: '법적 이름', brand: '브랜드 이름', website: '웹사이트', products: '제품 이름 — 한 줄에 하나(AI가 사용할 수 있는 유일한 이름)', boilerplate: '상용구 — 표준 "회사 소개" 문단', spokesName: '대변인 이름', spokesTitle: '대변인 직함', quote: '승인된 인용문 — 원문 그대로 사용하거나 인용하지 않음', permitted: '허용된 주장 — 한 줄에 하나씩', forbidden: '절대 하면 안 되는 주장 — 한 줄에 하나씩', save: '사실 저장', saving: '저장 중…', saved: '저장되었습니다. 새 초안에 이 사실이 사용됩니다.', err: '저장할 수 없습니다.', errOwner: '회사 정보를 편집하려면 소유자로 로그인하세요.', empty: '아직 저장된 정보가 없습니다. 이 항목을 채우기 전까지 초안은 자리 표시자로 가득 찹니다.', edit: '편집', close: '닫기' },
  ar: { title: 'حقائق عن الشركة', why: 'لا يجوز للمولّد أن يذكر إلا ما تضعه هنا. أي معلومة ناقصة تظهر في المسودة كـ [PLACEHOLDER] مرئي — وليس أبدًا كتفصيل مختلق.', legal: 'الاسم القانوني', brand: 'اسم العلامة التجارية', website: 'الموقع الإلكتروني', products: 'أسماء المنتجات — اسم واحد في كل سطر (الأسماء الوحيدة التي يجوز للذكاء الاصطناعي استخدامها)', boilerplate: 'النص المعياري — فقرة "من نحن" القياسية', spokesName: 'اسم المتحدث الرسمي', spokesTitle: 'مسمّى المتحدث الرسمي', quote: 'اقتباس معتمد — يُستخدم حرفيًا، أو لا اقتباس على الإطلاق', permitted: 'الادعاءات المسموح بها — واحد في كل سطر', forbidden: 'ادعاءات يجب عدم تقديمها أبدًا — ادعاء واحد في كل سطر', save: 'حفظ الحقائق', saving: 'جارٍ الحفظ…', saved: 'تم الحفظ. ستستخدم المسودات الجديدة هذه الحقائق.', err: 'تعذّر الحفظ.', errOwner: 'سجّل الدخول بصفتك المالك لتعديل بيانات الشركة.', empty: 'لم تُحفظ أي حقائق بعد، وستكون المسودات مليئة بالعناصر النائبة حتى تملأ هذا.', edit: 'تعديل', close: 'إغلاق' },
}

const panel: React.CSSProperties = { background: 'rgba(15,23,42,.86)', border: '1px solid rgba(148,163,184,.18)', borderRadius: 18, padding: 18 }
const button: React.CSSProperties = { border: 'none', background: '#ffc300', color: '#020617', borderRadius: 12, padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }
const ghost: React.CSSProperties = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '8px 12px', fontWeight: 800, cursor: 'pointer' }
const field: React.CSSProperties = { background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, width: '100%', boxSizing: 'border-box', fontSize: 13 }

export default function PressCompanyProfileForm({ profile, onSaved }: { profile: any; onSaved?: () => void }) {
  const { lang } = useI18n()
  const t = COPY[lang] || COPY.en
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null)
  const [f, setF] = useState({
    legal_name: '', brand_name: '', website: '', products: '', boilerplate: '',
    spokesperson_name: '', spokesperson_title: '', approved_quote: '', permitted_claims: '', forbidden_claims: '',
  })

  useEffect(() => {
    if (!profile) return
    setF({
      legal_name: profile.legal_name || '', brand_name: profile.brand_name || '', website: profile.website || '',
      products: profile.products || '', boilerplate: profile.boilerplate || '',
      spokesperson_name: profile.spokesperson_name || '', spokesperson_title: profile.spokesperson_title || '',
      approved_quote: profile.approved_quote || '', permitted_claims: profile.permitted_claims || '',
      forbidden_claims: profile.forbidden_claims || '',
    })
  }, [profile])

  async function save() {
    setBusy(true); setNote(null)
    try {
      const res = await fetch('/api/agency/press-media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'save_profile', ...f }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error === 'owner_approval_required' ? t.errOwner : t.err)
      setNote({ ok: true, text: t.saved }); onSaved?.()
    } catch (err: any) { setNote({ ok: false, text: err?.message || t.err }) }
    finally { setBusy(false) }
  }

  const hasFacts = Boolean(f.brand_name || f.products || f.boilerplate)
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })

  return <section style={{ ...panel, borderColor: hasFacts ? 'rgba(34,197,94,.35)' : 'rgba(251,146,60,.45)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ color: '#fff', margin: 0, fontSize: 18 }}>{t.title}</h2>
        <p style={{ color: 'rgba(255,255,255,.6)', margin: '6px 0 0', fontSize: 12, maxWidth: 760, lineHeight: 1.6 }}>{t.why}</p>
        {!hasFacts ? <p style={{ color: '#fb923c', margin: '8px 0 0', fontSize: 12, fontWeight: 800 }}>{t.empty}</p> : null}
      </div>
      <button style={ghost} onClick={() => setOpen((v) => !v)}>{open ? t.close : t.edit}</button>
    </div>

    {open ? <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={f.legal_name} onChange={set('legal_name')} placeholder={t.legal} style={{ ...field, flex: 1, minWidth: 200 }} />
        <input value={f.brand_name} onChange={set('brand_name')} placeholder={t.brand} style={{ ...field, flex: 1, minWidth: 200 }} />
        <input value={f.website} onChange={set('website')} placeholder={t.website} style={{ ...field, flex: 1, minWidth: 200 }} />
      </div>
      <textarea value={f.products} onChange={set('products')} placeholder={t.products} rows={3} style={{ ...field, resize: 'vertical' }} />
      <textarea value={f.boilerplate} onChange={set('boilerplate')} placeholder={t.boilerplate} rows={3} style={{ ...field, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={f.spokesperson_name} onChange={set('spokesperson_name')} placeholder={t.spokesName} style={{ ...field, flex: 1, minWidth: 200 }} />
        <input value={f.spokesperson_title} onChange={set('spokesperson_title')} placeholder={t.spokesTitle} style={{ ...field, flex: 1, minWidth: 200 }} />
      </div>
      <textarea value={f.approved_quote} onChange={set('approved_quote')} placeholder={t.quote} rows={2} style={{ ...field, resize: 'vertical' }} />
      <textarea value={f.permitted_claims} onChange={set('permitted_claims')} placeholder={t.permitted} rows={2} style={{ ...field, resize: 'vertical' }} />
      <textarea value={f.forbidden_claims} onChange={set('forbidden_claims')} placeholder={t.forbidden} rows={2} style={{ ...field, resize: 'vertical' }} />
      <button style={button} disabled={busy} onClick={save}>{busy ? t.saving : t.save}</button>
    </div> : null}

    {note ? <p style={{ color: note.ok ? '#22c55e' : '#fb923c', margin: '10px 0 0', fontSize: 12 }}>{note.text}</p> : null}
  </section>
}
