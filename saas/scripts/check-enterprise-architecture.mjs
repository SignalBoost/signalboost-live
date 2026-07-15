import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
const root = process.cwd()
const enterpriseRoots = ['app/api/enterprise', 'app/dashboard/campaigns', 'components/enterprise', 'lib/enterprise']
const ignore = new Set(['node_modules','.next','.git'])
function* files(dir){ for(const n of readdirSync(dir)){ if(ignore.has(n)) continue; const p=join(dir,n); const s=statSync(p); if(s.isDirectory()) yield* files(p); else if(/\.(tsx?|jsx?)$/.test(n)) yield p }}
const violations=[]
for(const base of enterpriseRoots){ try{ for(const f of files(join(root,base))){ const rel=relative(root,f); const src=readFileSync(f,'utf8'); if(/<textarea\b/i.test(src) && /campaign|enterprise|cosa|approval/i.test(src)) violations.push(`${rel}: campaign textarea is prohibited`); if(/<input\b[^>]*type=["']text["'][^>]*(campaign|objective|audience|creative|cta)/i.test(src)) violations.push(`${rel}: unrestricted campaign text input is prohibited`); if(/from ['"][^'"]*(publish|execution|raw-ai|scrap)/i.test(src) && /app\/(api\/enterprise|dashboard\/campaigns)/.test(rel)) violations.push(`${rel}: enterprise page imports low-level execution/provider code`); }}catch{}}
const schemaFiles=[...files(join(root,'lib'))].filter(f=>/master.*schema|schema.*wrapper/i.test(f));
if(schemaFiles.length>1) violations.push(`multiple master/schema wrapper candidates: ${schemaFiles.map(f=>relative(root,f)).join(', ')}`)
if(violations.length){ console.error('Enterprise architecture guard failed:\n'+violations.join('\n')); process.exit(1)}
console.log('Enterprise architecture guard passed')
