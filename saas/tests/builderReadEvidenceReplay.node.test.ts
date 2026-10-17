import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../lib/builder/tool-loop.ts',import.meta.url),'utf8')
test('REA evidence replay is restricted to unchanged read_file and one replay per path',()=>{
 assert.match(source,/if \(blockedAction\.toolId === 'read_file'\)/)
 assert.match(source,/const workspaceRevisionStart = trace\.reduce/)
 assert.match(source,/item\.toolId === 'write_file' \|\| item\.toolId === 'edit_file'/)
 assert.match(source,/toolPath\(item\.input\) === path/)
 assert.match(source,/evidenceReplay: true/)
 assert.match(source,/if \(path && priorRead && !replayed\)/)
 assert.match(source,/const repeatedWrite = await reconcileRepeatedWrite\(blockedAction, round\)/)
})
