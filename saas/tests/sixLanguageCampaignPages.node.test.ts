import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const keys=value=>Object.entries(value).flatMap(([k,v])=>v && typeof v==='object' && !Array.isArray(v)?keys(v).map(child=>k+'.'+child):[k])
test('six translated campaign page dictionaries exactly match canonical source keys',()=>{
 const source=JSON.parse(fs.readFileSync(path.join(root,'locales/pages.en.json'),'utf8'))
 const expected=keys(source).sort()
 for (const lang of ['de','fr','it','ja','ko','ar']) {
   const file=path.join(root,'locales/pages.'+lang+'.json')
   const dict=JSON.parse(fs.readFileSync(file,'utf8'))
   assert.deepEqual(keys(dict).sort(),expected,lang+' key parity')
 }
})
