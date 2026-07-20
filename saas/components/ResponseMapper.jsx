'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

const RESPONSE_PATHS = ['response.data.id', 'response.data.email', 'response.data.status', 'response.result.url', 'response.meta.requestId']
const OUTPUT_KEYS = ['integration.output.userId', 'integration.output.email', 'integration.output.status', 'integration.output.assetUrl', 'integration.audit.requestId']

export default function ResponseMapper({ value, onChange }) {
  return <section className="grid gap-3"><h3 className="text-sm font-black uppercase tracking-[.18em] text-cyan-200"><LocalizedText fallback={"Response Mapping"} /></h3><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-slate-200">Key-path selector<select className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white" value={value.source} onChange={event => onChange({ ...value, source: event.target.value })}>{RESPONSE_PATHS.map(path => <option key={path}>{path}</option>)}</select></label><label className="grid gap-2 text-sm font-bold text-slate-200"><LocalizedText fallback={"Blueprint output"} /><select className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white" value={value.target} onChange={event => onChange({ ...value, target: event.target.value })}>{OUTPUT_KEYS.map(path => <option key={path}>{path}</option>)}</select></label></div><p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300"><code>{value.source}</code> → <code>{value.target}</code></p></section>
}
