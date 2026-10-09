// Import completed, reviewed six-language translation packages into runtime dictionaries.
// Run only after the strict source, placeholder and reviewer-hash validator passes.
// Usage: node scripts/import-reviewed-language-packages.mjs <package-dir>
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const directory=process.argv[2]
const dryRun=process.argv.includes('--dry-run')
if(!directory)throw Error('Usage: node scripts/import-reviewed-language-packages.mjs <package-dir>')
const verified=spawnSync(process.execPath,['scripts/validate-translated-packages.mjs',directory,'--require-reviewed'],{cwd:root,encoding:'utf8'})
if(verified.status!==0)throw Error('Reviewed package validation failed. No production dictionaries modified.\n'+verified.stderr.slice(0,5000))
const locales=['de','fr','it','ja','ko','ar']
const standalone={main:'locales/{lang}.json',pages:'locales/pages.{lang}.json',console:'lib/i18n/console.{lang}.json',audit:'lib/i18n/audit.{lang}.json'}
const combined={onboarding:'lib/i18n/onboardingLocales.json',marketingSales:'lib/i18n/marketingSalesLocales.json',auditCenter:'lib/i18n/auditCenterLocales.json',supervisor:'lib/i18n/supervisorSocLocales.json',homepage:'lib/i18n/homepageLocales.json'}
function unflatten(entries){
 const result={}
 for(const [key,entry] of Object.entries(entries)){
  const segments=key.split('.')
  let at=result
  for(const segment of segments.slice(0,-1)){
   if(['__proto__','prototype','constructor'].includes(segment))throw Error('Unsafe translation key: '+key)
   at=at[segment]??={}
  }
  if(['__proto__','prototype','constructor'].includes(segments.at(-1)))throw Error('Unsafe translation key: '+key)
  at[segments.at(-1)]=entry.translation
 }
 return result
}
const writes=new Map()
for(const lang of locales){
 const pack=JSON.parse(fs.readFileSync(path.join(directory,lang+'.json'),'utf8'))
 for(const [name,pattern] of Object.entries(standalone))writes.set(pattern.replace('{lang}',lang),unflatten(pack[name]))
 for(const [name,filename] of Object.entries(combined)){
  const current=writes.get(filename)??JSON.parse(fs.readFileSync(path.join(root,filename),'utf8'))
  current[lang]=unflatten(pack[name])
  writes.set(filename,current)
 }
}
if(dryRun){
 console.log('Reviewed import preview: '+writes.size+' catalog files; no files changed.')
 process.exit(0)
}
// Stage every output before committing any destination. All sources were already validated.
const pending=[]
try{
 for(const [filename,value] of writes){
  const dest=path.join(root,filename)
  const tmp=dest+'.i18n-import-tmp'
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600})
  pending.push([tmp,dest])
 }
 for(const [tmp,dest] of pending)fs.renameSync(tmp,dest)
}catch(error){
 for(const [tmp] of pending)if(fs.existsSync(tmp))fs.rmSync(tmp,{force:true})
 throw error
}
console.log('Imported '+writes.size+' reviewed locale dictionaries. Production registry remains unchanged.')
