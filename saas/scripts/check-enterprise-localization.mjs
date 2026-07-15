import { readFileSync } from 'node:fs'
const locales=['en','es','pt','pl','ru']
const data=Object.fromEntries(locales.map(l=>[l, JSON.parse(readFileSync(`locales/${l}.json`,'utf8'))]))
function flatten(o,p='',out={}){ for(const [k,v] of Object.entries(o)){ const key=p?`${p}.${k}`:k; if(v&&typeof v==='object'&&!Array.isArray(v)) flatten(v,key,out); else out[key]=v } return out }
const flat=Object.fromEntries(locales.map(l=>[l,flatten(data[l])]))
const enKeys=Object.keys(flat.en).filter(k=>k.startsWith('enterprise.'))
const errors=[]
for(const l of locales){ for(const k of enKeys){ if(!(k in flat[l])) errors.push(`${l} missing ${k}`) }}
for(const l of locales.slice(1)){ for(const k of Object.keys(flat[l]).filter(k=>k.startsWith('enterprise.'))){ if(!enKeys.includes(k)) errors.push(`${l} orphan ${k}`) }}
if(errors.length){ console.error(errors.join('\n')); process.exit(1)}
console.log(`Enterprise localization guard passed (${enKeys.length} keys x ${locales.length} locales)`)
