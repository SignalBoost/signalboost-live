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
