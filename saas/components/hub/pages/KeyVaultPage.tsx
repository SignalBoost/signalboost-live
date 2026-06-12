'use client'

// saas/components/hub/pages/KeyVaultPage.tsx
// Console Page 2 — Key Vault.
// SECTION 1 "My Safe": Bitwarden-style encrypted storage (vault_items table).
//   Add (modal) -> encrypted at rest. Reveal (eye) -> decrypts one key for 15s,
//   stamps last_accessed_at. Delete -> confirmation modal. Values never logged.
// SECTION 2 "Platform keys": read-only mirror of Vercel env variable NAMES.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PageProps, Lang, c, TONES, Tone, cardStyle, bodyStyle, labelStyle, rowStyle, monoStyle, Band, Status } from '../shared'

// ── Local translations (vault-specific) ─────────────────────────────────────
const V: Record<string, Record<Lang, string>> = {
  mySafe:      { en: 'My Safe', es: 'Mi Caja Fuerte', pt: 'Meu Cofre', pl: 'Mój Sejf', ru: 'Мой сейф' },
  safeSub:     { en: 'Your encrypted key storage. Paste a key once — retrieve it whenever you need it.', es: 'Tu almacenamiento cifrado de claves. Pega una clave una vez — recupérala cuando la necesites.', pt: 'Seu armazenamento criptografado de chaves. Cole uma chave uma vez — recupere quando precisar.', pl: 'Twoje zaszyfrowane klucze. Wklej klucz raz — odzyskaj go, gdy będzie potrzebny.', ru: 'Ваше зашифрованное хранилище ключей. Вставьте ключ один раз — получите его, когда нужно.' },
  addKey:      { en: '+ Add key', es: '+ Agregar clave', pt: '+ Adicionar chave', pl: '+ Dodaj klucz', ru: '+ Добавить ключ' },
  provider:    { en: 'Provider', es: 'Proveedor', pt: 'Provedor', pl: 'Dostawca', ru: 'Провайдер' },
  labelF:      { en: 'Name / label', es: 'Nombre / etiqueta', pt: 'Nome / rótulo', pl: 'Nazwa / etykieta', ru: 'Имя / метка' },
  valueF:      { en: 'Secret value', es: 'Valor secreto', pt: 'Valor secreto', pl: 'Wartość sekretna', ru: 'Секретное значение' },
  save:        { en: 'Save to safe', es: 'Guardar en la caja', pt: 'Salvar no cofre', pl: 'Zapisz w sejfie', ru: 'Сохранить в сейф' },
  saving:      { en: 'Encrypting…', es: 'Cifrando…', pt: 'Criptografando…', pl: 'Szyfrowanie…', ru: 'Шифрование…' },
  cancel:      { en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', pl: 'Anuluj', ru: 'Отмена' },
  copyBtn:     { en: 'Copy', es: 'Copiar', pt: 'Copiar', pl: 'Kopiuj', ru: 'Копировать' },
  copied:      { en: 'Copied ✓', es: 'Copiado ✓', pt: 'Copiado ✓', pl: 'Skopiowano ✓', ru: 'Скопировано ✓' },
  deleteBtn:   { en: 'Delete', es: 'Eliminar', pt: 'Excluir', pl: 'Usuń', ru: 'Удалить' },
  confirmTitle:{ en: 'Delete this key?', es: '¿Eliminar esta clave?', pt: 'Excluir esta chave?', pl: 'Usunąć ten klucz?', ru: 'Удалить этот ключ?' },
  confirmBody: { en: 'This permanently removes it from the safe. The provider key itself is not affected.', es: 'Esto la elimina permanentemente de la caja. La clave del proveedor no se ve afectada.', pt: 'Isso a remove permanentemente do cofre. A chave do provedor não é afetada.', pl: 'To trwale usuwa go z sejfu. Sam klucz dostawcy nie jest naruszony.', ru: 'Это навсегда удалит его из сейфа. Сам ключ провайдера не затрагивается.' },
  lastUsed:    { en: 'Last revealed', es: 'Última revelación', pt: 'Última revelação', pl: 'Ostatnio ujawniono', ru: 'Последний просмотр' },
  never:       { en: 'never', es: 'nunca', pt: 'nunca', pl: 'nigdy', ru: 'никогда' },
  emptySafe:   { en: 'The safe is empty. Add your first key — it will be encrypted before it is stored.', es: 'La caja está vacía. Agrega tu primera clave — se cifrará antes de guardarse.', pt: 'O cofre está vazio. Adicione sua primeira chave — ela será criptografada antes de ser armazenada.', pl: 'Sejf jest pusty. Dodaj pierwszy klucz — zostanie zaszyfrowany przed zapisaniem.', ru: 'Сейф пуст. Добавьте первый ключ — он будет зашифрован перед сохранением.' },
  platformKeys:{ en: 'Platform keys (Vercel mirror, read-only)', es: 'Claves de la plataforma (espejo de Vercel, solo lectura)', pt: 'Chaves da plataforma (espelho da Vercel, somente leitura)', pl: 'Klucze platformy (lustro Vercel, tylko odczyt)', ru: 'Ключи платформы (зеркало Vercel, только чтение)' },
  hidesSoon:   { en: 'hides automatically in 15s', es: 'se oculta automáticamente en 15s', pt: 'oculta automaticamente em 15s', pl: 'ukryje się automatycznie za 15s', ru: 'скроется автоматически через 15с' },
}
function v(key: string, lang: Lang): string { const e = V[key]; return e ? (e[lang] || e.en) : key }

type VaultItem = { id: string; provider: string; label: string; last4: string; created_at: string; last_accessed_at: string | null }

const PROVIDER_TONES: Record<string, Tone> = { supabase: TONES.green, stripe: TONES.blue, vercel: TONES.purple, openai: TONES.cyan, github: TONES.gray }
function toneFor(provider: string): Tone { return PROVIDER_TONES[provider.toLowerCase()] || TONES.gold }

type ProviderGroup = { key: string; title: string; icon: string; tone: Tone; prefixes: string[] }
const GROUPS: ProviderGroup[] = [
  { key: 'supabase', title: 'Supabase', icon: '🗄️', tone: TONES.green,  prefixes: ['SUPABASE', 'NEXT_PUBLIC_SUPABASE'] },
  { key: 'stripe',   title: 'Stripe',   icon: '💳', tone: TONES.blue,   prefixes: ['STRIPE'] },
  { key: 'vercel',   title: 'Vercel',   icon: '🌐', tone: TONES.purple, prefixes: ['VERCEL'] },
  { key: 'openai',   title: 'OpenAI',   icon: '🤖', tone: TONES.cyan,   prefixes: ['OPENAI'] },
  { key: 'github',   title: 'GitHub',   icon: '🐙', tone: TONES.gray,   prefixes: ['GITHUB'] },
  { key: 'other',    title: '',         icon: '🧩', tone: TONES.gold,   prefixes: [] },
]
function groupFor(name: string): string {
  for (const g of GROUPS) { if (g.prefixes.some(p => name.startsWith(p))) return g.key }
  return 'other'
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 13.5, outline: 'none' }

export default function KeyVaultPage({ lang, data, loading }: PageProps) {
  // ── My Safe state ──
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
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const loadSafe = async () => {
    setSafeLoading(true)
    setSafeError(null)
    try {
      const res = await fetch('/api/hub/vault', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || String(res.status))
      setItems(json.items || [])
    } catch (err: any) {
      setSafeError(err?.message || 'Failed to load safe')
    } finally {
      setSafeLoading(false)
    }
  }
  useEffect(() => { loadSafe() }, [])
  useEffect(() => () => { Object.values(timersRef.current).forEach(clearTimeout) }, [])

  const addKey = async () => {
    if (!fProvider.trim() || !fLabel.trim() || !fValue) return
    setSavingKey(true)
    setSafeError(null)
    try {
      const res = await fetch('/api/hub/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: fProvider, label: fLabel, value: fValue }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || String(res.status))
      setItems(prev => [...prev, json.item].sort((a, b) => a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label)))
      setShowAdd(false)
      setFProvider(''); setFLabel(''); setFValue('')
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
    try { await navigator.clipboard.writeText(value); setCopiedId(id); setTimeout(() => setCopiedId(null), 1800) } catch {}
  }

  const deleteKey = async (id: string) => {
    setConfirmId(null)
    try {
      const res = await fetch('/api/hub/vault', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || String(res.status))
      hideKey(id)
      setItems(prev => prev.filter(i => i.id !== id))
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
            <div style={{ fontSize: 17, fontWeight: 800 }}>🔐 {v('mySafe', lang)}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.55)', maxWidth: 720 }}>{v('safeSub', lang)}</div>
          </div>
          <button onClick={() => setShowAdd(true)} className="hub-btn" style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid rgba(255,195,0,.5)', background: 'rgba(255,195,0,.12)', color: '#ffc300', fontSize: 13, fontWeight: 800 }}>{v('addKey', lang)}</button>
        </div>

        {safeError && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 11, border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.09)', fontSize: 12.5, marginBottom: 8 }}><span>⚠️</span><span style={{ flex: 1 }}>{safeError}</span><button onClick={() => setSafeError(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', cursor: 'pointer' }}>×</button></div>}
        {safeLoading && <div className="hub-loading" style={{ padding: '10px 13px', borderRadius: 11, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', fontSize: 12.5, color: 'rgba(255,255,255,.6)' }}>{c('loading', lang)}</div>}
        {!safeLoading && items.length === 0 && !safeError && (
          <div style={{ padding: '16px 14px', borderRadius: 12, border: '1px dashed rgba(255,255,255,.18)', background: 'rgba(255,255,255,.02)', fontSize: 13, color: 'rgba(255,255,255,.55)', textAlign: 'center' }}>{v('emptySafe', lang)}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 10 }}>
          {items.map(item => {
            const tone = toneFor(item.provider)
            const shown = revealed[item.id]
            return (
              <div key={item.id} className="hub-card" style={{ borderRadius: 14, border: `1px solid ${tone.border}`, background: 'linear-gradient(160deg, rgba(15,23,42,.72), rgba(3,7,18,.86))', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: tone.strong }}>{item.provider}</div>
                    <div style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => shown ? hideKey(item.id) : revealKey(item.id)} title="Reveal" className="hub-chip" style={{ padding: '6px 10px', borderRadius: 9, fontSize: 14, background: shown ? 'rgba(26,240,255,.14)' : 'rgba(255,255,255,.05)', border: shown ? '1px solid rgba(26,240,255,.45)' : '1px solid rgba(255,255,255,.15)' }}>{shown ? '🙈' : '👁'}</button>
                    <button onClick={() => setConfirmId(item.id)} title={v('deleteBtn', lang)} className="hub-chip" style={{ padding: '6px 10px', borderRadius: 9, fontSize: 13, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)', color: '#fca5a5' }}>🗑</button>
                  </div>
                </div>
                {!shown && <div style={{ ...monoStyle, fontSize: 13, color: 'rgba(255,255,255,.5)' }}>••••••••••••{item.last4}</div>}
                {shown && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ ...monoStyle, fontSize: 12, wordBreak: 'break-all', padding: '8px 10px', borderRadius: 9, background: 'rgba(26,240,255,.06)', border: '1px solid rgba(26,240,255,.3)' }}>{shown}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => copyKey(item.id)} className="hub-btn" style={{ padding: '6px 13px', borderRadius: 9, border: '1px solid rgba(26,240,255,.45)', background: 'rgba(26,240,255,.1)', color: '#1af0ff', fontSize: 12, fontWeight: 700 }}>{copiedId === item.id ? v('copied', lang) : v('copyBtn', lang)}</button>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{v('hidesSoon', lang)}</span>
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{v('lastUsed', lang)}: {fmtDate(item.last_accessed_at)}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── SECTION 2: Platform keys (Vercel mirror) ───────────────── */}
      <section style={{ flexShrink: 0 }}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>{v('platformKeys', lang)}</div>
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

      {/* ── Add Key modal (portal: escapes the slider's CSS transform) ── */}
      {showAdd && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(3,7,18,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }} onClick={() => !savingKey && setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(440px, 100%)', borderRadius: 16, border: '1px solid rgba(255,195,0,.4)', background: 'linear-gradient(160deg, rgba(15,23,42,.97), rgba(3,7,18,.99))', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>🔐 {v('addKey', lang).replace('+ ', '')}</div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 5 }}>{v('provider', lang)}</div>
              <input value={fProvider} onChange={e => setFProvider(e.target.value)} placeholder="OpenAI, Stripe, ElevenLabs…" style={inputStyle} />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 5 }}>{v('labelF', lang)}</div>
              <input value={fLabel} onChange={e => setFLabel(e.target.value)} placeholder="Production API key" style={inputStyle} />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 5 }}>{v('valueF', lang)}</div>
              <input value={fValue} onChange={e => setFValue(e.target.value)} type="password" autoComplete="off" placeholder="sk-…" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setShowAdd(false)} disabled={savingKey} className="hub-chip" style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 700 }}>{v('cancel', lang)}</button>
              <button onClick={addKey} disabled={savingKey || !fProvider.trim() || !fLabel.trim() || !fValue} className="hub-btn" style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(255,195,0,.55)', background: 'rgba(255,195,0,.16)', color: '#ffc300', fontSize: 13, fontWeight: 800, opacity: savingKey || !fProvider.trim() || !fLabel.trim() || !fValue ? .5 : 1 }}>{savingKey ? v('saving', lang) : v('save', lang)}</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ── Delete confirmation modal (portal) ─────────────────────── */}
      {confirmId && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(3,7,18,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }} onClick={() => setConfirmId(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(400px, 100%)', borderRadius: 16, border: '1px solid rgba(239,68,68,.45)', background: 'linear-gradient(160deg, rgba(15,23,42,.97), rgba(3,7,18,.99))', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>🗑 {v('confirmTitle', lang)}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{v('confirmBody', lang)}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setConfirmId(null)} className="hub-chip" style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 700 }}>{v('cancel', lang)}</button>
              <button onClick={() => deleteKey(confirmId)} className="hub-btn" style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(239,68,68,.55)', background: 'rgba(239,68,68,.16)', color: '#fca5a5', fontSize: 13, fontWeight: 800 }}>{v('deleteBtn', lang)}</button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
