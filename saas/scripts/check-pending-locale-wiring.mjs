import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd()
const supported=fs.readFileSync(path.join(root,'lib/i18n/supportedLanguages.ts'),'utf8')
const loader=fs.readFileSync(path.join(root,'lib/i18n/loadLanguage.ts'),'utf8')
const declaration=supported.match(/SUPPORTED_LANGUAGES\s*=\s*\[([^\]]+)\]/)
if(!declaration)throw Error('Supported language declaration missing')
const enabled=declaration[1]
for(const language of ['de','fr','it','ja','ko','ar']){
 if(!enabled.includes("'"+language+"'"))continue
 for(const file of ['locales/'+language+'.json','locales/pages.'+language+'.json','lib/i18n/console.'+language+'.json','lib/i18n/audit.'+language+'.json']){
  if(!fs.existsSync(path.join(root,file)))throw Error(language+': missing '+file)
 }
 if(!loader.includes("import('@/locales/"+language+".json')"))throw Error(language+': dictionary loader missing')
 for(const tableName of ['CONSOLE_TABLE','AUDIT_TABLE']){
  const section=loader.split('const '+tableName)[1]?.split('}')[0]||''
  if(!section.includes(language+':'))throw Error(language+': missing '+tableName+' entry')
 }
}
console.log('PASS: enabled language loaders and files exist')
