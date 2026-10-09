// Generate six-language draft translation packages in cost-efficient batched requests.
// No customer/user data: inputs are curated English repository UI catalogs only.
// Usage: node scripts/translate-pending-language-packages.mjs <package-dir> [--limit N]
// N is per language (default 500). Drafts require human review before production.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { placeholderTokens } from './generated-ui-locale-utils.mjs'
const locales=['de','fr','it','ja','ko','ar']
const directory=process.argv[2]
if(!directory||!fs.existsSync(path.join(directory,'manifest.json'))) {
 console.error('Usage: node scripts/translate-pending-language-packages.mjs <package-dir> [--limit N]')
 process.exit(2)
}
const key=process.env.AZURE_TRANSLATOR_KEY
const region=process.env.AZURE_TRANSLATOR_REGION
if(!key||!region)throw Error('Azure Translator credentials missing; no translation performed')
const index=process.argv.indexOf('--limit')
const limit=index<0?500:Number(process.argv[index+1])
if(!Number.isSafeInteger(limit)||limit<1||limit>10000)throw Error('Invalid --limit (1–10000 per language)')
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'))
if(JSON.stringify(manifest.languages)!==JSON.stringify(locales))throw Error('Unexpected language manifest')
const save=(name,value)=>{
 const dest=path.join(directory,name),tmp=dest+'.tmp'
 fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600})
 fs.renameSync(tmp,dest)
}
const maxItems=40,maxChars=8000
async function translateBatch(texts,lang){
 const response=await fetch('https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to='+lang,{
  method:'POST',
  headers:{'Ocp-Apim-Subscription-Key':key,'Ocp-Apim-Subscription-Region':region,'X-ClientTraceId':randomUUID(),'Content-Type':'application/json'},
  body:JSON.stringify(texts.map(text=>({text}))),
  signal:AbortSignal.timeout(30000)
 })
 if(!response.ok)throw Error('Translator HTTP '+response.status+' for '+lang)
 const data=await response.json()
 if(!Array.isArray(data)||data.length!==texts.length)throw Error('Translator batch length mismatch for '+lang)
 return data.map((item,i)=>{
  const output=item?.translations?.find(t=>t.to===lang)?.text
  if(typeof output!=='string'||!output.trim())throw Error('Empty translation at batch index '+i)
  if(JSON.stringify(placeholderTokens(texts[i]))!==JSON.stringify(placeholderTokens(output)))throw Error('Placeholder mismatch at batch index '+i)
  return output
 })
}
let generatedDrafts=0,requests=0
const perLanguage={}
for(const lang of locales){
 const file=lang+'.json',pack=JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'))
 const reviewFile=lang+'.review.json'
 const reviews=fs.existsSync(path.join(directory,reviewFile))?JSON.parse(fs.readFileSync(path.join(directory,reviewFile),'utf8')):{}
 const pending=[]
 for(const [store,entries] of Object.entries(pack)){
  for(const [id,entry] of Object.entries(entries)){
   if(entry.translation!==null)continue
   if(typeof entry.source!=='string'||!entry.source.trim()){
    entry.translation=entry.source
    continue
   }
   if(pending.length<limit)pending.push({store,id,source:entry.source})
  }
 }
 let processed=0
 for(let offset=0;offset<pending.length;){
  const chunk=[];let chars=0
  while(offset<pending.length&&chunk.length<maxItems){
   const item=pending[offset]
   if(item.source.length>maxChars)throw Error('Source exceeds safe batch size at '+lang+'/'+item.store+'/'+item.id)
   if(chunk.length&&chars+item.source.length>maxChars)break
   chunk.push(item);chars+=item.source.length;offset++
  }
  const translated=await translateBatch(chunk.map(item=>item.source),lang)
  // Commit a whole validated batch; partial/incorrect external responses cannot mark entries done.
  chunk.forEach((item,i)=>{
   pack[item.store][item.id].translation=translated[i]
   reviews[item.store]??={}
   reviews[item.store][item.id]={status:'needs_review',provider:'azure-translator'}
  })
  save(file,pack)
  save(reviewFile,reviews)
  processed+=chunk.length;requests++
 }
 // Structured constants and blank source literals are copied, never sent to translation.
 save(file,pack)
 perLanguage[lang]=processed
 generatedDrafts+=processed
}
console.log(JSON.stringify({generatedDrafts,perLanguage,requests,reviewRequired:true}))
