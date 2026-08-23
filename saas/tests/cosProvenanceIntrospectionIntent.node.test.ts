import assert from 'node:assert/strict'
import test from 'node:test'
import { isProvenanceIntrospectionIntent } from '../lib/ai/cos/provenanceIntrospectionIntent.ts'
const positives=['Show me where from you got the answer for the question?','Where did you get that answer from?','show me where the answers came from?','where does this answer come from?','откуда эта информация?','de onde veio essa resposta?','pokaż mi skąd ta odpowiedź pochodzi']
const negatives=['show me the best sources of vitamin D','where does the Nile get its water','how do you know when bread is done','what sources of protein are best?','show me citations for a medical paper']
test('recognizes answer-origin followups without second-person wording',()=>{for(const prompt of positives)assert.equal(isProvenanceIntrospectionIntent(prompt),true,prompt)})
test('does not hijack ordinary source or origin questions',()=>{for(const prompt of negatives)assert.equal(isProvenanceIntrospectionIntent(prompt),false,prompt)})
