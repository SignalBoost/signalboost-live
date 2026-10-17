import test from 'node:test'
import assert from 'node:assert/strict'
import {classifyBuilderFailure} from '../lib/builder/rea-failure-classifier.ts'

test('classifies actual module failures with narrow repair guidance',()=>{
 const x=classifyBuilderFailure("Error [ERR_MODULE_NOT_FOUND]: Cannot find module './catalog.js'")
 assert.equal(x.kind,'module_resolution')
 assert.match(x.action,/import path/)
})
test('classifies parser, assertion and runtime failures',()=>{
 assert.equal(classifyBuilderFailure('SyntaxError: Unexpected token }').kind,'syntax')
 assert.equal(classifyBuilderFailure('AssertionError [ERR_ASSERTION]: 4 !== 5').kind,'assertion')
 assert.equal(classifyBuilderFailure('TypeError: cannot read properties of undefined').kind,'runtime')
})
test('unknown failures do not infer unsupported fixes',()=>{
 const x=classifyBuilderFailure('process exited with code 1')
 assert.equal(x.kind,'unknown')
 assert.match(x.action,/Do not guess/)
})
