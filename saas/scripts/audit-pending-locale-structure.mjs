// Fail-closed structural audit for new locale activation. Advisory until a pending locale is enabled.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { placeholderTokens } from './generated-ui-locale-utils.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const pending=['de','fr','it','ja','ko','ar']
const storePaths=['locales/{lang}.json','locales/pages.{lang}.json','lib/i18n/console.{lang}.json','lib/i18n/audit.{lang}.json']
const combined=['lib/i18n/onboardingLocales.json','lib/i18n/marketingSalesLocales.json','lib/i18n/auditCenterLocales.json','lib/i18n/supervisorSocLocales.json','lib/i18n/homepageLocales.json']
const flatten=(item,prefix='',out={})=>{for(const [key,value] of Object.entries(item)){const full=prefix?prefix+'.'+key:key;if(value&&typeof value==='object'&&!Array.isArray(value))flatten(value,full,out);else out[full]=value}return out}
const file=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'))
const issues=[]
const compare=(label,en,other)=>{
 const a=flatten(en),b=flatten(other)
 for(const [key,value] of Object.entries(a)){
  if(!Object.prototype.hasOwnProperty.call(b,key)){issues.push(label+': missing '+key);continue}
  const v=b[key]
  if(typeof value==='string'){
   if(typeof v!=='string'||(!v.trim()&&value.trim()))issues.push(label+': empty '+key)
   else if(JSON.stringify(placeholderTokens(value))!==JSON.stringify(placeholderTokens(v)))issues.push(label+': placeholder mismatch '+key)
  } else if(JSON.stringify(v)!==JSON.stringify(value))issues.push(label+': nontext value mismatch '+key)
 }
 for(const key of Object.keys(b))if(!Object.prototype.hasOwnProperty.call(a,key))issues.push(label+': unexpected '+key)
}
for(const lang of pending){
 for(const pattern of storePaths){
  const target=pattern.replace('{lang}',lang)
  if(!fs.existsSync(path.join(root,target))){issues.push(target+': missing catalog');continue}
  compare(target,file(pattern.replace('{lang}','en')),file(target))
 }
 for(const p of combined){
  const obj=file(p)
  if(!obj[lang]){issues.push(p+': missing '+lang);continue}
  compare(p+': '+lang,obj.en,obj[lang])
 }
}
const core=fs.readFileSync(path.join(root,'lib/i18n/supportedLanguages.ts'),'utf8')
const live=core.match(/SUPPORTED_LANGUAGES\s*=\s*\[([^\]]+)\]/)?.[1]||''
const enabled=pending.filter(code=>live.includes("'"+code+"'")||live.includes('"'+code+'"'))
console.log('Six-language structural audit: '+issues.length+' gap(s); active candidates: '+(enabled.join(',')||'none'))
for(const issue of issues.slice(0,100))console.log(' - '+issue)
if(issues.length>100)console.log(' ... '+(issues.length-100)+' additional gaps')
if(issues.length&&(enabled.length||process.argv.includes('--require-all')))process.exit(1)
