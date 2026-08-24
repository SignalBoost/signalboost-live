// saas/lib/ai/cos/reasonerHostingDisclosure.ts
export type ReasonerHosting = 'self_hosted' | 'managed_open_weight' | 'unrecorded'
export interface HostClassification { selfHosted: boolean; provider: string | null }
export interface ReasonerDisclosure { hosting: ReasonerHosting; provider: string | null; model: string | null; display: string | null; label: string; note: string; externalNotUsedQualifier: string }
const MANAGED_PREFIX = 'managed-open-model:'
const LOCAL_PREFIX = 'independent-local:'
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])
const PRIVATE_SUFFIX = ['.local', '.internal', '.lan', '.localdomain', '.svc', '.cluster.local']
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'])
function clean(value: string | null | undefined): string { return String(value ?? '').trim() }
function isPrivateIpv4(host: string): boolean { const p=host.split('.'); if(p.length!==4||p.some(v=>!/^\d{1,3}$/.test(v))) return false; const [a,b]=p.map(Number); return a===10||a===127||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===169&&b===254) }
function providerFromHost(host: string): string { const l=host.split('.').filter(Boolean); if(l.length<2)return host||'unnamed host'; return (SECOND_LEVEL.has(l[l.length-2])&&l.length>=3?l[l.length-3]:l[l.length-2])||host }
export function classifyInferenceHost(baseUrl: string | null | undefined): HostClassification { const raw=clean(baseUrl); if(!raw)return{selfHosted:false,provider:null}; let host=''; try{host=new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g,'')}catch{return{selfHosted:false,provider:null}}; if(!host)return{selfHosted:false,provider:null}; if(LOOPBACK.has(host)||isPrivateIpv4(host)||PRIVATE_SUFFIX.some(s=>host.endsWith(s))||!host.includes('.'))return{selfHosted:true,provider:null}; return{selfHosted:false,provider:providerFromHost(host)} }
export function describeReasoner(raw: string | null | undefined): ReasonerDisclosure { const label=clean(raw); if(label.toLowerCase().startsWith(MANAGED_PREFIX)){const rest=label.slice(MANAGED_PREFIX.length), i=rest.indexOf(':'), provider=clean(i>=0?rest.slice(0,i):rest)||'unnamed host', model=clean(i>=0?rest.slice(i+1):'')||null; return{hosting:'managed_open_weight',provider,model,display:model,label:'Primary Reasoner',note:` Open-weight model executed by third-party host ${provider}; prompt content left this deployment boundary. Weights are open; the compute is not self-hosted.`,externalNotUsedQualifier:` No closed frontier-model provider contributed to this answer; inference itself ran on third-party host ${provider} — see Primary Reasoner.`}} if(label.toLowerCase().startsWith(LOCAL_PREFIX)){const model=clean(label.slice(LOCAL_PREFIX.length))||null; return{hosting:'self_hosted',provider:null,model,display:label,label:'Local Reasoning Engine',note:'',externalNotUsedQualifier:''}} return{hosting:'unrecorded',provider:null,model:label||null,display:label||null,label:'Primary Reasoner',note:' Hosting is not recorded in this label; placement of the inference is unverified and must not be read as self-hosted.',externalNotUsedQualifier:' Hosting of the primary reasoner is not recorded, so absence of a frontier provider does not establish that inference stayed in-boundary.'} }
// Luis flagged that burying the inference host inside the boundary-caveat prose ("Open-weight
// model executed by third-party host deepinfra...") reads as ambiguous next to a separate
// "External AI Provider" line, which names a completely different concept (a closed-model
// fallback/teacher tier). Surfacing the host on its own line makes the two unambiguous without
// removing the boundary caveat, which still carries information the single line did not.
export function reasonerProvenanceLine(raw: string | null | undefined, fallbackModel = 'model not recorded'): string {
  const d = describeReasoner(raw)
  const primaryLine = `${d.label.padEnd(23)}: INVOKED — ${d.display || fallbackModel}.${d.note}`
  if (!d.provider) return primaryLine
  return `${primaryLine}\n${'Inference Host'.padEnd(23)}: ${d.provider}.`
}
