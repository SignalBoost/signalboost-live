'use client'

// saas/components/company/CompanyIdentityPrompt.tsx
// "Whose work is this?" — shown wherever a signed-in user generates something that carries a
// name (outreach, ads, sites, videos). Until they answer, their assets would either be nameless
// or inherit the platform's brand, which misrepresents them and mislabels the platform's work.
//
// Strongly suggested, not blocking: it is prominent and reappears until answered, but never
// prevents the user from working — matching the platform doctrine that nothing is forced.
// Drop it at the top of any generation page: <CompanyIdentityPrompt onSaved={reload} />
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const COPY: Record<string, Record<string, string>> = {
  en: { title: 'Which company is this for?', why: 'Add your company name so everything you create here carries your brand. Without it your work goes out unnamed — we will never put another company’s name on it.', brand: 'Your company name', website: 'Website (optional)', products: 'Product or service names — one per line (optional)', save: 'Save', saving: 'Saving…', saved: 'Saved — your work will now use this name.', later: 'Not now', err: 'Could not save.', need: 'Enter a company name.', using: 'Creating as' },
  es: { title: '¿Para qué empresa es esto?', why: 'Añade el nombre de tu empresa para que todo lo que crees aquí lleve tu marca. Sin él, tu trabajo sale sin nombre: nunca pondremos el nombre de otra empresa.', brand: 'Nombre de tu empresa', website: 'Sitio web (opcional)', products: 'Nombres de productos o servicios: uno por línea (opcional)', save: 'Guardar', saving: 'Guardando…', saved: 'Guardado: tu trabajo usará este nombre.', later: 'Ahora no', err: 'No se pudo guardar.', need: 'Introduce el nombre de la empresa.', using: 'Creando como' },
  pt: { title: 'Para qual empresa é isto?', why: 'Adicione o nome da sua empresa para que tudo o que criar aqui leve a sua marca. Sem ele, o seu trabalho sai sem nome — nunca colocaremos o nome de outra empresa.', brand: 'Nome da sua empresa', website: 'Site (opcional)', products: 'Nomes de produtos ou serviços — um por linha (opcional)', save: 'Salvar', saving: 'Salvando…', saved: 'Salvo — o seu trabalho passará a usar este nome.', later: 'Agora não', err: 'Não foi possível salvar.', need: 'Informe o nome da empresa.', using: 'Criando como' },
  pl: { title: 'Dla jakiej firmy to jest?', why: 'Dodaj nazwę swojej firmy, aby wszystko, co tu tworzysz, nosiło Twoją markę. Bez niej Twoja praca wychodzi bez nazwy — nigdy nie umieścimy na niej nazwy innej firmy.', brand: 'Nazwa Twojej firmy', website: 'Strona WWW (opcjonalnie)', products: 'Nazwy produktów lub usług — po jednej w wierszu (opcjonalnie)', save: 'Zapisz', saving: 'Zapisywanie…', saved: 'Zapisano — Twoja praca będzie używać tej nazwy.', later: 'Nie teraz', err: 'Nie udało się zapisać.', need: 'Podaj nazwę firmy.', using: 'Tworzysz jako' },
  ru: { title: 'Для какой компании это?', why: 'Укажите название вашей компании, чтобы всё созданное здесь несло ваш бренд. Без него работа выйдет без имени — мы никогда не подставим название чужой компании.', brand: 'Название вашей компании', website: 'Сайт (необязательно)', products: 'Названия продуктов или услуг — по одному в строке (необязательно)', save: 'Сохранить', saving: 'Сохранение…', saved: 'Сохранено — работа будет использовать это название.', later: 'Не сейчас', err: 'Не удалось сохранить.', need: 'Введите название компании.', using: 'Создаётся от имени' },
}

const wrap: React.CSSProperties = { background: 'rgba(15,23,42,.9)', border: '1px solid rgba(251,146,60,.5)', borderRadius: 18, padding: 18 }
const okWrap: React.CSSProperties = { background: 'rgba(15,23,42,.6)', border: '1px solid rgba(34,197,94,.35)', borderRadius: 14, padding: '10px 14px' }
const button: React.CSSProperties = { border: 'none', background: '#ffc300', color: '#020617', borderRadius: 12, padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }
const ghost: React.CSSProperties = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '9px 12px', fontWeight: 800, cursor: 'pointer' }
const field: React.CSSProperties = { background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, width: '100%', boxSizing: 'border-box', fontSize: 13 }

export default function CompanyIdentityPrompt({ onSaved }: { onSaved?: (brand: string) => void }) {
  const { lang } = useI18n()
  const t = COPY[lang] || COPY.en
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(true)   // /agency is public — stay invisible to visitors
  const [hasProfile, setHasProfile] = useState(false)
  const [brandName, setBrandName] = useState('')
  const [website, setWebsite] = useState('')
  const [products, setProducts] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/account/company-profile', { cache: 'no-store', credentials: 'include' })
      if (res.status === 401) { setSignedIn(false); return }
      const json = await res.json().catch(() => ({}))
      if (json?.ok) {
        setHasProfile(Boolean(json.hasProfile))
        setBrandName(json.profile?.brand_name || '')
        setWebsite(json.profile?.website || '')
        setProducts(json.profile?.products || '')
      }
    } catch { /* prompt simply shows */ }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function save() {
    if (!brandName.trim()) { setNote({ ok: false, text: t.need }); return }
    setBusy(true); setNote(null)
    try {
      const res = await fetch('/api/account/company-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ brand_name: brandName, website, products }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(t.err)
      setHasProfile(true); setNote({ ok: true, text: t.saved }); onSaved?.(brandName.trim())
    } catch (err: any) { setNote({ ok: false, text: err?.message || t.err }) }
    finally { setBusy(false) }
  }

  if (loading || !signedIn) return null

  // Answered: a quiet confirmation of whose work this is, still editable.
  if (hasProfile) {
    return <div style={okWrap}>
      <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>{t.using} </span>
      <strong style={{ color: '#22c55e', fontSize: 13 }}>{brandName}</strong>
      <button style={{ ...ghost, marginLeft: 10, padding: '4px 10px', fontSize: 11 }} onClick={() => setHasProfile(false)}>✎</button>
    </div>
  }

  if (dismissed) return null

  return <section style={wrap}>
    <h3 style={{ color: '#fff', margin: 0, fontSize: 16 }}>{t.title}</h3>
    <p style={{ color: 'rgba(255,255,255,.66)', margin: '6px 0 12px', fontSize: 12, lineHeight: 1.6, maxWidth: 720 }}>{t.why}</p>
    <div style={{ display: 'grid', gap: 8 }}>
      <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={t.brand} style={field} />
      <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder={t.website} style={field} />
      <textarea value={products} onChange={(e) => setProducts(e.target.value)} placeholder={t.products} rows={2} style={{ ...field, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={button} disabled={busy} onClick={save}>{busy ? t.saving : t.save}</button>
        <button style={ghost} onClick={() => setDismissed(true)}>{t.later}</button>
      </div>
    </div>
    {note ? <p style={{ color: note.ok ? '#22c55e' : '#fb923c', margin: '10px 0 0', fontSize: 12 }}>{note.text}</p> : null}
  </section>
}
