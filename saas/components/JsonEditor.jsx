'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

function titleFor(variable) {
  return variable
    .split('.')
    .pop()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, char => char.toUpperCase())
}

function parseSelectedVariables(value) {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
    return Object.values(parsed)
      .filter(item => typeof item === 'string')
      .map(item => item.match(/^\{\{(.+)\}\}$/)?.[1])
      .filter(Boolean)
  } catch {
    return []
  }
}

export default function JsonEditor({ value, onChange, variables = [] }) {
  const selectedVariables = parseSelectedVariables(value)

  function toggleVariable(variable) {
    const next = selectedVariables.includes(variable)
      ? selectedVariables.filter(item => item !== variable)
      : [...selectedVariables, variable]

    const request = Object.fromEntries(
      next.map(item => [item.split('.').pop(), `{{${item}}}`]),
    )
    onChange(JSON.stringify(request, null, 2))
  }

  return (
    <section className="grid gap-4 rounded-2xl border border-white/10 bg-white/[.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-200"><LocalizedText fallback={"Digital Request Builder"} /></p>
          <h3 className="mt-1 text-lg font-black text-white"><LocalizedText fallback={"Request inputs"} /></h3>
          <p className="mt-1 text-xs text-slate-400"><LocalizedText fallback={"Select the approved provider fields this integration should send."} /></p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${variables.length ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/5 text-slate-400'}`}>
          {variables.length ? `${selectedVariables.length} selected` : 'Select provider'}
        </span>
      </div>

      {variables.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {variables.map(variable => {
            const checked = selectedVariables.includes(variable)
            return (
              <button
                key={variable}
                type="button"
                aria-pressed={checked}
                onClick={() => toggleVariable(variable)}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${checked ? 'border-cyan-300/40 bg-cyan-300/10' : 'border-white/10 bg-slate-950/50 hover:bg-white/[.05]'}`}
              >
                <span>
                  <span className="block font-bold text-white">{titleFor(variable)}</span>
                  <span className="block text-xs text-slate-400">{variable}</span>
                </span>
                <span className={`grid h-6 w-6 place-items-center rounded-full border text-xs font-black ${checked ? 'border-cyan-200 bg-cyan-200 text-slate-950' : 'border-white/20 text-transparent'}`}>✓</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400"><LocalizedText fallback={"Select a provider to load its available request inputs."} /></div>
      )}

      <div className="rounded-xl border border-white/10 bg-slate-950/55 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-slate-300"><LocalizedText fallback={"Request status"} /></span>
          <span className={selectedVariables.length ? 'text-sm font-black text-emerald-200' : 'text-sm font-black text-amber-200'}>
            {selectedVariables.length ? 'Ready' : 'Choose at least one input'}
          </span>
        </div>
      </div>
    </section>
  )
}
