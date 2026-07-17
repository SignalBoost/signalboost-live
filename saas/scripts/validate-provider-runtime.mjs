import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
const root = new URL('..', import.meta.url).pathname
const files = []
async function walk(dir){ for(const e of await readdir(dir,{withFileTypes:true})){ if(e.name==='node_modules'||e.name==='.next') continue; const p=join(dir,e.name); if(e.isDirectory()) await walk(p); else if(/\.(ts|tsx)$/.test(e.name)) files.push(p) } }
await walk(join(root,'lib'))
const text = await Promise.all(files.map(async f=>[f, await readFile(f,'utf8')]))
const registries = text.filter(([f,t])=>/class\s+UniversalProviderRegistry|new\s+Map<string,\s*UniversalProviderSdk>/.test(t) && !f.endsWith('provider-framework/registry.ts'))
if(registries.length) throw new Error(`Parallel provider registries detected: ${registries.map(([f])=>f).join(', ')}`)
const direct = text.filter(([f,t])=>f.includes('/supervisor/') && /provider-framework\/github|GitHubReadOnlyAdapter/.test(t))
if(direct.length) throw new Error(`Direct GitHub adapter imports from supervisor code: ${direct.map(([f])=>f).join(', ')}`)
const mutations = text.filter(([f,t])=>f.includes('/provider-framework/') && /method:\s*['"](POST|PUT|PATCH|DELETE)['"]|workflow_dispatch|merge\(|createPull|createIssue|createSecret/i.test(t) && !f.endsWith('github.ts'))
if(mutations.length) throw new Error(`Provider mutation surface detected: ${mutations.map(([f])=>f).join(', ')}`)
console.log('provider runtime guard passed')
