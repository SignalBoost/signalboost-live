import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
const root = new URL('..', import.meta.url).pathname
const canonical = 'lib/browser-provider'
function walk(dir){return readdirSync(dir).flatMap(name=>{const path=join(dir,name); if(path.includes('node_modules')||path.includes('.next')) return []; return statSync(path).isDirectory()?walk(path):[path]})}
const files = walk(root).filter(file=>/\.(ts|tsx|mjs|js)$/.test(file))
const read = file => readFileSync(file,'utf8')
const rel = file => relative(root,file)
const errors=[]
function count(pattern, allowed){const matches=files.filter(file=>pattern.test(read(file))); for(const file of matches){if(!allowed.some(a=>rel(file)===a))errors.push(`Unexpected BPAL implementation symbol in ${rel(file)}`)} if(matches.length!==allowed.length)errors.push(`Expected ${allowed.length} canonical matches for ${pattern}, found ${matches.map(rel).join(', ')}`)}
count(/class\s+BrowserProviderRegistry\b|class\s+ProviderRegistry\b/, ['lib/browser-provider/provider-registry.ts'])
count(/interface\s+BrowserProviderAdapter\b/, ['lib/browser-provider/provider-adapter.ts'])
count(/\bVercelBrowserAdapter\b\s*[:=]/, ['lib/browser-provider/vercel/vercel-browser-adapter.ts'])
for(const file of files.filter(f=>rel(f).startsWith(canonical))){const text=read(file); if(/playwright|browser-runtime|credential|secret|password|token|mutation client/i.test(text)) errors.push(`Forbidden BPAL dependency/secret/execution term in ${rel(file)}`)}
for(const file of files.filter(f=>rel(f).startsWith('lib/browser-runtime'))){if(/vercel/i.test(read(file)))errors.push(`Direct Vercel knowledge inside Browser Runtime: ${rel(file)}`)}
const data = readFileSync(join(root,'lib/browser-provider/vercel/vercel-data.ts'),'utf8')
for(const name of ['vercelCapabilityIds']){
  const declaration = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const\\b`)
  const match = data.match(declaration)
  if(!match){errors.push(`Unable to inspect canonical ID declaration ${name}`); continue}
  const ids=[...match[1].matchAll(/'([^']+)'/g)].map(value=>value[1])
  if(new Set(ids).size!==ids.length)errors.push(`Duplicate IDs in ${name}`)
}
if(errors.length){console.error(errors.join('\n')); process.exit(1)}
console.log('BPAL guard passed')
