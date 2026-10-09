import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = fs.mkdtempSync(path.join(root, '.translation-test-'))
try {
  const result = spawnSync(process.execPath, ['scripts/export-eleven-language-translation-packages.mjs', '--out', path.relative(root, output)], {cwd:root,encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8'))
  assert.deepEqual(manifest.languages,['de','fr','it','ja','ko','ar'])
  for(const locale of manifest.languages) {
    const pack=JSON.parse(fs.readFileSync(path.join(output,locale+'.json'),'utf8'))
    for(const [store,keys] of Object.entries(manifest.stores[locale])) {
      assert.equal(Object.keys(pack[store]).length,keys)
      for(const entry of Object.values(pack[store])) {
        assert.ok('source' in entry)
        assert.equal(entry.translation,null)
      }
    }
  }
  // Resume must preserve a source-matched draft, but regenerate its baseline source safely.
  const example=path.join(output,'de.json')
  const before=JSON.parse(fs.readFileSync(example,'utf8'))
  const key=Object.keys(before.pages)[0]
  before.pages[key].translation='Übersetzungsentwurf'
  fs.writeFileSync(example,JSON.stringify(before))
  const again=spawnSync(process.execPath,['scripts/export-eleven-language-translation-packages.mjs','--out',path.relative(root,output),'--resume'],{cwd:root,encoding:'utf8'})
  assert.equal(again.status,0,again.stderr)
  const after=JSON.parse(fs.readFileSync(example,'utf8'))
  assert.equal(after.pages[key].translation,'Übersetzungsentwurf')
  const unrelated=Object.keys(after.pages).find(k=>k!==key)
  assert.equal(after.pages[unrelated].translation,null)
  console.log('PASS: source key parity, new packages and resumable prior drafts verified')
} finally {fs.rmSync(output,{recursive:true,force:true})}
