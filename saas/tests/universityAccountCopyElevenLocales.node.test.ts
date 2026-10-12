import test from 'node:test'
import assert from 'node:assert/strict'
import { PUBLIC_LOCALES } from '../lib/seo/publicLocales.ts'
import { UNIVERSITY_COPY } from '../lib/seo/universityCopy.ts'
import { UNIVERSITY_START_COPY } from '../lib/seo/universityStartCopy.ts'
test('eleven languages describe planned mandatory subscription, not optional access or active billing',()=>{
  assert.equal(PUBLIC_LOCALES.length,11)
  for(const language of PUBLIC_LOCALES){
    const c=UNIVERSITY_COPY[language]
    assert.ok(c.creditPlan.length>75,language)
    assert.doesNotMatch(c.creditPlan,/optional subscription|optional subscriptions|abonnement facultatif|assinatura opcional|suscripción opcional|opzionale|任意のサブスクリプション|선택적 구독|اختيارية/i)
    assert.match(c.creditPlan,/iTMounts/)
    assert.ok(UNIVERSITY_START_COPY[language].intro.length>30)
  }
})
test('English entry explains work, not obvious need to register or access internal administration',()=>{
  assert.match(UNIVERSITY_START_COPY.en.intro,/workspaces.*training runs.*results/)
  assert.doesNotMatch(UNIVERSITY_START_COPY.en.intro,/registration|register|internal administration/)
})
