import test from 'node:test'
import assert from 'node:assert/strict'
import { PUBLIC_LOCALES } from '../lib/seo/publicLocales.ts'
import { UNIVERSITY_COPY } from '../lib/seo/universityCopy.ts'
import { UNIVERSITY_START_COPY } from '../lib/seo/universityStartCopy.ts'
test('eleven languages describe free account creation without claiming paid billing is active',()=>{
  assert.equal(PUBLIC_LOCALES.length,11)
  for(const language of PUBLIC_LOCALES){
    const c=UNIVERSITY_COPY[language]
    assert.ok(c.creditPlan.length>75,language)
    assert.doesNotMatch(c.creditPlan,/mandatory subscription|obligatoire|obbligatorio|obligatoria|обязательной подписк|pflichtverpflichtend/i)
    assert.match(c.creditPlan,/iTMounts/)
    assert.ok(UNIVERSITY_START_COPY[language].intro.length>30)
  }
})
test('English entry explains work, not obvious need to register or access internal administration',()=>{
  assert.match(UNIVERSITY_START_COPY.en.intro,/workspaces.*training runs.*results/)
  assert.doesNotMatch(UNIVERSITY_START_COPY.en.intro,/registration|register|internal administration/)
})
