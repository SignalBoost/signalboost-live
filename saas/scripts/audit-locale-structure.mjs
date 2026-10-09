// saas/scripts/audit-locale-structure.mjs
// Fail-closed structural audit for every non-English platform language: exact key parity,
// non-text value parity, no blank strings, and identical interpolation/URL tokens per key.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { placeholderTokens, TARGET_UI_LOCALES } from './generated-ui-locale-utils.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const languages=TARGET_UI_LOCALES
const storePaths=['locales/{lang}.json','locales/pages.{lang}.json','locales/cos.{lang}.json','lib/i18n/console.{lang}.json','lib/i18n/audit.{lang}.json','public/i18n/{lang}.json','marketing-sales-core/i18n/data/{lang}.json']
const combined=['lib/i18n/onboardingLocales.json','lib/i18n/marketingSalesLocales.json','lib/i18n/auditCenterLocales.json','lib/i18n/supervisorSocLocales.json','lib/i18n/homepageLocales.json','lib/i18n/supervisorAssessmentLocales.json','lib/i18n/aiKillSwitchLocales.json']
const flatten=(item,prefix='',out={})=>{for(const [key,value] of Object.entries(item)){if(!prefix&&key.startsWith('_'))continue;const full=prefix?prefix+'.'+key:key;if(value&&typeof value==='object'&&!Array.isArray(value))flatten(value,full,out);else out[full]=value}return out}
const file=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'))
const issues=[]
const perLocale=Object.fromEntries(languages.map(lang=>[lang,{catalogsChecked:0,issues:0}]))
const compare=(lang,label,en,other)=>{
 const a=flatten(en),b=flatten(other)
 const before=issues.length
 for(const [key,value] of Object.entries(a)){
  if(!Object.prototype.hasOwnProperty.call(b,key)){issues.push(label+': missing '+key);continue}
  const v=b[key]
  if(typeof value==='string'){
   if(typeof v!=='string'||(!v.trim()&&value.trim()))issues.push(label+': empty '+key)
   else if(JSON.stringify(placeholderTokens(value))!==JSON.stringify(placeholderTokens(v)))issues.push(label+': placeholder mismatch '+key)
  } else if(Array.isArray(value)){
   if(!Array.isArray(v)||v.length!==value.length)issues.push(label+': array shape mismatch '+key)
  } else if(JSON.stringify(v)!==JSON.stringify(value))issues.push(label+': nontext value mismatch '+key)
 }
 for(const key of Object.keys(b))if(!Object.prototype.hasOwnProperty.call(a,key))issues.push(label+': unexpected '+key)
 perLocale[lang].issues+=issues.length-before
 perLocale[lang].catalogsChecked++
}
for(const lang of languages){
 for(const pattern of storePaths){
  const target=pattern.replace('{lang}',lang)
  if(!fs.existsSync(path.join(root,target))){issues.push(target+': missing catalog');perLocale[lang].issues++;continue}
  compare(lang,target,file(pattern.replace('{lang}','en')),file(target))
 }
 for(const p of combined){
  const obj=file(p)
  if(!obj[lang]){issues.push(p+': missing '+lang);perLocale[lang].issues++;continue}
  compare(lang,p+': '+lang,obj.en,obj[lang])
 }
}
const report={status:issues.length?'NOT_READY':'STRUCTURALLY_COMPLETE',languages:perLocale,issues,generatedAt:new Date().toISOString()}
const reportArg=process.argv.indexOf('--report')
if(reportArg>=0){
 const output=process.argv[reportArg+1]
 if(!output||output.startsWith('-'))throw Error('--report requires a file path')
 const dest=path.resolve(root,output)
 if(!dest.startsWith(root+path.sep))throw Error('Report path must be inside saas')
 fs.mkdirSync(path.dirname(dest),{recursive:true})
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n')
}
console.log('Locale structural audit ('+languages.join(',')+'): '+issues.length+' gap(s)')
for(const issue of issues.slice(0,100))console.log(' - '+issue)
if(issues.length>100)console.log(' ... '+(issues.length-100)+' additional gaps')
if(issues.length)process.exit(1)
