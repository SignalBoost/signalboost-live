// Exercise the real six-language batch engine with a locally mocked provider.
// No provider credentials, paid requests, or production locale writes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const dir=fs.mkdtempSync(path.join(root,'.i18n-batch-e2e-'))
const langs=['de','fr','it','ja','ko','ar']
const fixture=Object.fromEntries(Array.from({length:42},(_,i)=>['key'+i,{source:'Hello world '+i,translation:null}]))
try {
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({languages:langs}))
 for(const lang of langs)fs.writeFileSync(path.join(dir,lang+'.json'),JSON.stringify({pages:fixture}))
 const mock=path.join(dir,'mock.mjs')
 fs.writeFileSync(mock,`import fs from 'node:fs'
globalThis.fetch=async (url, options)=>{
 const lang=new URL(url).searchParams.get('to')
 const texts=JSON.parse(options.body).map(row=>row.text)
 fs.appendFileSync(process.env.MOCK_REQUESTS,JSON.stringify({lang,count:texts.length})+'\\n')
 return {ok:true,status:200,json:async()=>texts.map(text=>({translations:[{to:lang,text:text+' ['+lang+']'}]}))}
}`)
 const logfile=path.join(dir,'requests.jsonl')
 const run=()=>spawnSync(process.execPath,['--import',mock,'scripts/translate-pending-language-packages.mjs',dir,'--limit','100'],{cwd:root,encoding:'utf8',env:{...process.env,AZURE_TRANSLATOR_KEY:'test-only',AZURE_TRANSLATOR_REGION:'test-only',MOCK_REQUESTS:logfile}})
 const first=run()
 assert.equal(first.status,0,first.stderr)
 const result=JSON.parse(first.stdout)
 assert.equal(result.generatedDrafts,42*6)
 assert.equal(result.requests,12,'42 entries must be batched into 2 requests per locale')
 const requestRows=fs.readFileSync(logfile,'utf8').trim().split('\n').map(line=>JSON.parse(line))
 for(const lang of langs)assert.deepEqual(requestRows.filter(row=>row.lang===lang).map(row=>row.count),[40,2])
 for(const lang of langs){
  assert.equal(result.perLanguage[lang],42)
  const data=JSON.parse(fs.readFileSync(path.join(dir,lang+'.json'),'utf8'))
  assert.equal(data.pages.key0.translation,'Hello world 0 ['+lang+']')
  const reviews=JSON.parse(fs.readFileSync(path.join(dir,lang+'.review.json'),'utf8'))
  assert.equal(reviews.pages.key0.status,'needs_review')
 }
 const second=run()
 assert.equal(second.status,0,second.stderr)
 assert.equal(JSON.parse(second.stdout).generatedDrafts,0,'resume must skip all completed strings')
 assert.equal(fs.readFileSync(logfile,'utf8').trim().split('\n').length,12,'resume must not incur more requests')
 // Simulate a provider corrupting interpolation tokens: do not persist any part of the invalid batch.
 const rejectedPath=path.join(dir,'de.json')
 const pack=JSON.parse(fs.readFileSync(rejectedPath,'utf8'))
 pack.pages.key0={source:'Hello {name}',translation:null}
 fs.writeFileSync(rejectedPath,JSON.stringify(pack))
 const badMock=path.join(dir,'bad-mock.mjs')
 fs.writeFileSync(badMock,`globalThis.fetch=async (url,options)=>({
   ok:true,status:200,json:async()=>JSON.parse(options.body).map(({text})=>({
     translations:[{to:new URL(url).searchParams.get('to'),text:text.replace('{name}','name')}]
   }))
 })`)
 const corrupted=spawnSync(process.execPath,['--import',badMock,'scripts/translate-pending-language-packages.mjs',dir,'--limit','100'],{cwd:root,encoding:'utf8',env:{...process.env,AZURE_TRANSLATOR_KEY:'test-only',AZURE_TRANSLATOR_REGION:'test-only'}})
 assert.notEqual(corrupted.status,0,'placeholder-corrupting provider must fail closed')
 assert.match(corrupted.stderr,/Placeholder mismatch/)
 const afterCorruption=JSON.parse(fs.readFileSync(rejectedPath,'utf8'))
 assert.equal(afterCorruption.pages.key0.translation,null,'failed batch must not persist invalid translation')
 console.log('PASS: six languages, 12 batched requests, zero-cost resume, corrupted placeholder rejected without write')
}finally{fs.rmSync(dir,{recursive:true,force:true})}
