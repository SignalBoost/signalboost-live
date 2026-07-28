'use client'

// saas/app/dashboard/marketing/press-providers/PressCompanyProfileForm.tsx
// The facts the generator is allowed to state. Without these the model has no way to know your
// real product names and will invent them — that is exactly how a release naming a non-existent
// product reached an editor. Anything left blank becomes a visible [PLACEHOLDER] in the draft
// instead of an invention. Localized in all five platform languages.
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const COPY: Record<string, Record<string, string>> = {
  en: { title: uiCopy('u_6a13b22a2a60517c'), why: uiCopy('u_54f18bfbdc3c7079'), legal: uiCopy('u_6f32f361c38bac52'), brand: uiCopy('u_f00c404fcc6f618b'), website: uiCopy('u_803dfd90425f9079'), products: uiCopy('u_02825f900acfd5b1'), boilerplate: uiCopy('u_6eb586c177fe7d26'), spokesName: uiCopy('u_166e7cd6cde3c279'), spokesTitle: uiCopy('u_5a27106965719d6b'), quote: uiCopy('u_e3eebb92d77497a7'), permitted: uiCopy('u_f39255b865801337'), forbidden: uiCopy('u_c34a30453497d435'), save: uiCopy('u_20497c2115b35008'), saving: uiCopy('u_a23f2eba49be003e'), saved: uiCopy('u_f4af240569d76d00'), err: uiCopy('u_7364bee46e2e2291'), errOwner: uiCopy('u_3c6e5d79d18becbc'), empty: uiCopy('u_5ba97143a2fb4281'), edit: uiCopy('u_c69599d7c9552473'), close: uiCopy('u_41b2a51040ca41ac') },
  es: { title: 'Datos de la empresa', why: 'El generador solo puede afirmar lo que pongas aquí. Lo que falte aparecerá como [MARCADOR] visible en el borrador, nunca como un dato inventado.', legal: 'Razón social', brand: 'Nombre de marca', website: 'Sitio web', products: 'Nombres de productos: uno por línea (los ÚNICOS que la IA puede usar)', boilerplate: 'Texto estándar: el párrafo "Acerca de"', spokesName: 'Nombre del portavoz', spokesTitle: 'Cargo del portavoz', quote: 'Cita aprobada: se usa literalmente o no se usa ninguna', permitted: 'Afirmaciones permitidas: una por línea', forbidden: 'Afirmaciones prohibidas: una por línea', save: 'Guardar datos', saving: 'Guardando…', saved: 'Guardado. Los nuevos borradores usarán estos datos.', err: 'No se pudo guardar.', errOwner: 'Inicia sesión como propietario para editar los datos.', empty: 'Aún no hay datos guardados: los borradores estarán llenos de marcadores hasta que los completes.', edit: 'Editar', close: 'Cerrar' },
  pt: { title: 'Dados da empresa', why: 'O gerador só pode afirmar o que você colocar aqui. O que faltar aparece como [MARCADOR] visível no rascunho, nunca como um dado inventado.', legal: 'Razão social', brand: 'Nome da marca', website: 'Site', products: 'Nomes de produtos — um por linha (os ÚNICOS que a IA pode usar)', boilerplate: 'Texto padrão — o parágrafo "Sobre a empresa"', spokesName: 'Nome do porta-voz', spokesTitle: 'Cargo do porta-voz', quote: 'Citação aprovada — usada literalmente, ou nenhuma', permitted: 'Afirmações permitidas — uma por linha', forbidden: 'Afirmações proibidas — uma por linha', save: 'Salvar dados', saving: 'Salvando…', saved: 'Salvo. Os novos rascunhos usarão estes dados.', err: 'Não foi possível salvar.', errOwner: 'Entre como proprietário para editar os dados.', empty: 'Nenhum dado salvo ainda — os rascunhos ficarão cheios de marcadores até você preencher.', edit: 'Editar', close: 'Fechar' },
  pl: { title: 'Dane firmy', why: 'Generator może podać wyłącznie to, co tu wpiszesz. Braki pojawią się w projekcie jako widoczny [SYMBOL] — nigdy jako zmyślony szczegół.', legal: 'Nazwa prawna', brand: 'Nazwa marki', website: 'Strona WWW', products: 'Nazwy produktów — po jednej w wierszu (JEDYNE, których AI może użyć)', boilerplate: 'Standardowy akapit „O firmie”', spokesName: 'Imię i nazwisko rzecznika', spokesTitle: 'Stanowisko rzecznika', quote: 'Zatwierdzony cytat — użyty dosłownie albo wcale', permitted: 'Dozwolone twierdzenia — po jednym w wierszu', forbidden: 'Twierdzenia zakazane — po jednym w wierszu', save: 'Zapisz dane', saving: 'Zapisywanie…', saved: 'Zapisano. Nowe projekty użyją tych danych.', err: 'Nie udało się zapisać.', errOwner: 'Zaloguj się jako właściciel, aby edytować dane.', empty: 'Brak zapisanych danych — projekty będą pełne symboli, dopóki tego nie uzupełnisz.', edit: 'Edytuj', close: 'Zamknij' },
  ru: { title: 'Факты о компании', why: 'Генератор может утверждать только то, что вы укажете здесь. Недостающее появится в черновике как видимый [ЗАПОЛНИТЕЛЬ] — никогда как выдуманная деталь.', legal: 'Юридическое название', brand: 'Название бренда', website: 'Сайт', products: 'Названия продуктов — по одному в строке (ЕДИНСТВЕННЫЕ, которые может использовать ИИ)', boilerplate: 'Стандартный абзац «О компании»', spokesName: 'Имя представителя', spokesTitle: 'Должность представителя', quote: 'Утверждённая цитата — дословно или никак', permitted: 'Разрешённые утверждения — по одному в строке', forbidden: 'Запрещённые утверждения — по одному в строке', save: 'Сохранить факты', saving: 'Сохранение…', saved: 'Сохранено. Новые черновики будут использовать эти факты.', err: 'Не удалось сохранить.', errOwner: 'Войдите как владелец, чтобы изменить факты.', empty: 'Факты ещё не сохранены — черновики будут полны заполнителей, пока вы их не заполните.', edit: 'Изменить', close: 'Закрыть' },
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
