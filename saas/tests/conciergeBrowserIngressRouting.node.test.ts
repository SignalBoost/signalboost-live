import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isContentGenerationRequest } from '../lib/ai/cos/contentGenerationIntent.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { detectDirectTextTransformation } from '../lib/ai/cos/directTextTransformation.ts'

test('the live Dwight edit shape is transformation work, never fresh web lookup', () => {
  const prompt = 'edit Dwight, thank you for let me know and for your ocncern - if you are thinking about cancelling it because of me, do not worry. At the end of the day, this is at the moment a one-person post. If I do not do it, you will have to do it. We do what we have to do and whatever is needed to support the mission.'
  assert.ok(detectDirectTextTransformation(prompt))
  assert.equal(isContentGenerationRequest(prompt), true)
  assert.equal(requiresFreshExternalEvidence(prompt), false)
})

test('common general-assistant transformation tasks stay off freshness routing', () => {
  for (const prompt of [
    'rewrite this paragraph so it is more professional: The current version is too long and I need it today.',
    'proofread this email: I am writing about the current schedule and need the grammar fixed.',
    'summarize this text: The current deployment is discussed in this pasted document, but I only want a summary.',
    'translate this paragraph into Polish: This is the current draft of my letter.',
    'edite este texto: Esta é a versão atual da minha mensagem e quero apenas melhorar a redação.',
    'popraw ten tekst: To jest aktualna wersja mojego e-maila i chcę tylko poprawić styl.',
  ]) {
    assert.equal(isContentGenerationRequest(prompt), true, prompt)
    assert.equal(requiresFreshExternalEvidence(prompt), false, prompt)
  }
})

test('the stable public Concierge endpoint actually enters public scope before COS Primary', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')

  assert.match(proxy, /pathname === '\/api\/concierge'/)
  assert.match(proxy, /cosBrowserUrl\.pathname = '\/api\/cos-browser'/)
  assert.match(browser, /import \{ withPublicDeliveryScope \} from '@\/lib\/auth\/publicDeliveryScope'/)

  const scope = browser.indexOf('withPublicDeliveryScope(() =>')
  const wake = browser.indexOf('withRunpodWakePermission(permission')
  const primary = browser.indexOf('cosPrimaryPost(req)')
  assert.ok(scope >= 0)
  assert.ok(wake > scope)
  assert.ok(primary > wake)
})
