import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { asksWhereTheAnswerCameFrom } from '../lib/ai/cos/provenanceIntrospectionIntent.ts'
test('recognizes verbatim answer-origin production failures',()=>{for(const q of ['skąd masz te informacje?','show me where from you got the answer for the question?','show me where the answers came from?','where does this answer come from?','откуда эта информация?','de onde veio essa resposta?','pokaż mi skąd pochodzi ta odpowiedź'])assert.equal(asksWhereTheAnswerCameFrom(q),true,q)})
test('does not hijack content questions using source or origin words',()=>{for(const q of ['show me the best sources of vitamin D','what are the best sources of protein?','where do plants get their energy?','where does the Nile get its water?','how do banks source liquidity overnight?','how do you know when bread is done?'])assert.equal(asksWhereTheAnswerCameFrom(q),false,q)})
test('is directly wired before freshness routing',()=>{const route=readFileSync(new URL('../app/api/cos-primary/baseRoute.ts',import.meta.url),'utf8');assert.match(route,/asksWhereTheAnswerCameFrom/);assert.match(route,/isProvenanceIntrospection\\(input\\)\\s*\\|\\|\\s*asksWhereTheAnswerCameFrom\\(input\\)/)})
