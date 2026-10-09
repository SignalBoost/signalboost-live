// Audit actual App Router pages without assuming the site uses a /[lang] URL tree.
// Produces evidence, not a false claim that every route has translated content.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const app=path.join(root,'app')
const routes=[]
const candidates=(source)=>{
 const results=[]
 const checks=[
  {kind:'jsx-text',pattern:/>\s*([A-Za-z][^<>{}\\n]{3,100}?)\s*</g},
  {kind:'accessibility-or-form-text',pattern:/\b(aria-label|placeholder|title|alt)\s*=\s*["']([^"'{}]{4,120})["']/g}
 ]
 for(const {kind,pattern} of checks){
  for(const match of source.matchAll(pattern)){
   const value=(kind==='jsx-text'?match[1]:match[2]).trim()
   if(!/[A-Za-z]{3}/.test(value)||/^https?:\/\//.test(value))continue
   const line=source.slice(0,match.index).split('\n').length
   results.push({kind,line,sample:value.slice(0,120)})
  }
 }
 return results.slice(0,100)
}
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
     dynamic:/\[.*?\]/.test(route),explicitI18n:/\b(useTranslation|useTranslations|loadLanguage|useLocale|I18nProvider|\bt\()/.test(src),
     possibleHardcodedText:candidates(src)})
  }
 }
}
walk(app)
routes.sort((a,b)=>a.route.localeCompare(b.route))
const flagged=routes.filter(x=>!x.explicitI18n)
const report={status:'INVENTORY_ONLY_NOT_RUNTIME_CERTIFICATION',totalPages:routes.length,withoutObviousI18nHook:flagged.length,
 pagesWithPossibleHardcodedText:routes.filter(x=>x.possibleHardcodedText.length).length,
 possibleHardcodedTextSamples:routes.reduce((count,x)=>count+x.possibleHardcodedText.length,0),routes}
const at=process.argv.indexOf('--report')
if(at>=0){
 const output=process.argv[at+1]
 if(!output||output.startsWith('-'))throw Error('--report requires a path')
 const dest=path.resolve(root,output)
 if(!dest.startsWith(root+path.sep))throw Error('Report path must be within saas')
 fs.mkdirSync(path.dirname(dest),{recursive:true})
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n')
}
console.log('App Router pages: '+routes.length+'; no obvious page-level localization hook: '+flagged.length+'; possible inline text: '+report.possibleHardcodedTextSamples)
console.log('This is a source inventory, not a measure of rendered translated coverage.')
