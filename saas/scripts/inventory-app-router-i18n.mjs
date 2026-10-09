// Audit actual App Router pages without assuming the site uses a /[lang] URL tree.
// Produces evidence, not a false claim that every route has translated content.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const app=path.join(root,'app')
const routes=[]
const excluded=new Set(['node_modules','.next','__tests__'])
const walk=(dir,segments=[])=>{
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(entry.isDirectory()){
   if(!excluded.has(entry.name)&&!entry.name.startsWith('_'))walk(path.join(dir,entry.name),[...segments,entry.name])
  }else if(/^page\.(tsx|ts|jsx|js)$/.test(entry.name)){
   const parts=segments.filter(x=>!/^\(.*\)$/.test(x)&&!x.startsWith('@'))
   const route='/'+parts.join('/')
   const src=fs.readFileSync(path.join(dir,entry.name),'utf8')
   routes.push({route,source:path.relative(root,path.join(dir,entry.name)).replaceAll(path.sep,'/'),
     dynamic:/\[.*?\]/.test(route),explicitI18n:/\b(useTranslation|useTranslations|loadLanguage|useLocale|I18nProvider|\bt\()/.test(src)})
  }
 }
}
walk(app)
routes.sort((a,b)=>a.route.localeCompare(b.route))
const flagged=routes.filter(x=>!x.explicitI18n)
const report={status:'INVENTORY_ONLY_NOT_RUNTIME_CERTIFICATION',totalPages:routes.length,withoutObviousI18nHook:flagged.length,routes}
const at=process.argv.indexOf('--report')
if(at>=0){
 const output=process.argv[at+1]
 if(!output||output.startsWith('-'))throw Error('--report requires a path')
 const dest=path.resolve(root,output)
 if(!dest.startsWith(root+path.sep))throw Error('Report path must be within saas')
 fs.mkdirSync(path.dirname(dest),{recursive:true})
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n')
}
console.log('App Router pages: '+routes.length+'; no obvious page-level localization hook: '+flagged.length)
console.log('This is a source inventory, not a measure of rendered translated coverage.')
