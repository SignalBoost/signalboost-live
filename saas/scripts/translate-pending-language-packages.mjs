// Generate DRAFT translations in exported six-language packages only.
// Azure is optional, called explicitly by a trusted operator. Never run with secrets on PRs.
// Translation credentials: AZURE_TRANSLATOR_KEY and AZURE_TRANSLATOR_REGION.
// Usage: node scripts/translate-pending-language-packages.mjs <package-dir> [--limit 100]
// Output remains outside runtime locale catalogs; review status is stored separately.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { placeholderTokens } from './generated-ui-locale-utils.mjs'

const locales = ['de','fr','it','ja','ko','ar']
const directory = process.argv[2]
if (!directory || !fs.existsSync(path.join(directory,'manifest.json'))) {
  console.error('Usage: node scripts/translate-pending-language-packages.mjs <exported-package-dir> [--limit N]')
  process.exit(2)
}
const key = process.env.AZURE_TRANSLATOR_KEY
const region = process.env.AZURE_TRANSLATOR_REGION
if (!key || !region) throw new Error('Azure Translator credentials missing; no translation performed')
const limitAt = process.argv.indexOf('--limit')
const limit = limitAt < 0 ? 100 : Number(process.argv[limitAt+1])
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid --limit (1–500)')
const manifest = JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'))
if (JSON.stringify(manifest.languages) !== JSON.stringify(locales)) throw new Error('Unexpected language manifest')
const save = (file,data) => {
  const destination = path.join(directory,file)
  const temporary = destination+'.tmp'
  fs.writeFileSync(temporary,JSON.stringify(data,null,2)+'\n',{flag:'w',mode:0o600})
  fs.renameSync(temporary,destination)
}
async function translate(source,lang) {
  const response = await fetch('https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to='+lang,{
    method:'POST',
    headers:{
      'Ocp-Apim-Subscription-Key':key,
      'Ocp-Apim-Subscription-Region':region,
      'X-ClientTraceId':randomUUID(),
      'Content-Type':'application/json'
    },
    body:JSON.stringify([{text:source}]),
    signal:AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error('Translator HTTP '+response.status)
  const body=await response.json()
  const output=body?.[0]?.translations?.find(item=>item.to===lang)?.text
  if (typeof output!=='string' || !output.trim()) throw new Error('Translator empty response')
  if (JSON.stringify(placeholderTokens(source))!==JSON.stringify(placeholderTokens(output))) {
    throw new Error('Translation changed interpolation/URL placeholder tokens')
  }
  return output
}
let completed=0, skipped=0
for (const lang of locales) {
  const file=lang+'.json'
  const pack=JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'))
  const reviewFile=lang+'.review.json'
  const reviews=fs.existsSync(path.join(directory,reviewFile))
    ? JSON.parse(fs.readFileSync(path.join(directory,reviewFile),'utf8')) : {}
  for (const [store,entries] of Object.entries(pack)) {
    for(const [id,entry] of Object.entries(entries)) {
      if(completed>=limit) break
      if(typeof entry.source!=='string' || !entry.source.trim() || entry.translation!==null) {skipped++;continue}
      // No credentials, PII, tenant content or user prompts should ever enter this public-copy-only pipeline.
      const result=await translate(entry.source,lang)
      entry.translation=result
      reviews[store] ??= {}
      reviews[store][id]={status:'needs_review',provider:'azure-translator'}
      // Persist after each successful request to support bounded resume after transient API errors.
      save(file,pack)
      save(reviewFile,reviews)
      completed++
    }
    if(completed>=limit) break
  }
  if(completed>=limit) break
}
console.log(JSON.stringify({generatedDrafts:completed,skipped,reviewRequired:true}))
