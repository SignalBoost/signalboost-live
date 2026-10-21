// saas/tests/builderTitledSpecificationRouting.node.test.ts
//
// Production 2026-10-21: the owner pasted a titled Builder acceptance spec into COS chat. It opens with a markdown
// heading, says "with the following files" and carries fenced examples ({"total":5}, npm test), so it was read as
// pasted code with no execution request and answered by an unrelated canned refusal. The same text works on the
// Developer page. Chat now routes it to the same durable Builder job, with no example fence staged as source.
import assert from 'node:assert/strict'
import test from 'node:test'
import { isConciergeBuilderObjective, isCosCodingObjective, structuredApplicationBuild } from '../lib/ai/cos/cosReasoningRolePolicy.ts'
import { conciergeBuilderRequest } from '../lib/ai/cos/agentProgressClient.ts'
import { wantsIsolatedPublication } from '../lib/builder/isolated-publication.ts'

const spec = "# BUILDER V2 \u2014 END-TO-END ACCEPTANCE TEST\n\nBuild, debug, test, publish, and deploy a small Node.js application called **Calculator API**.\n\n**You must complete this task autonomously from beginning to end. Do not stop after generating code.**\n\n## 1. Create the application\n\nCreate an isolated Node.js project with the following files:\n\n- `package.json`\n- `index.js`\n- `src/calculator.js`\n- `test/calculator.test.js`\n\nImplement an HTTP endpoint:\n\n`GET /sum?a=2&b=3`\n\nExpected response:\n\n```json\n{\"total\":5}\n```\n\n## 2. Introduce and repair a real bug\n\nInitially implement a defective addition function that produces an incorrect result.\n\nRun the tests to reproduce the failure.\n\nDiagnose the problem and repair the code autonomously.\n\nDo not simply report the bug. Fix it.\n\n## 3. Automated verification\n\nCreate at least 10 meaningful automated tests covering addition, negative numbers, zero, decimal numbers, and invalid inputs.\n\nExecute:\n\n```bash\nnpm test\nnode --test test/*.test.js\n```\n\nBoth commands must pass.\n\n## 4. GitHub publication\n\nUsing the authorized isolated-project publication workflow:\n\n- Create a new private GitHub repository.\n- Commit the verified application to a repair branch.\n- Open a pull request against an isolated test branch.\n- Do not modify the SignalBoost production repository.\n- Return the actual GitHub repository and PR URLs.\n\n## 5. Vercel deployment\n\nDeploy the exact verified application to a Vercel preview.\n\nWait for the deployment to become READY.\n\nMake a real HTTP request to:\n\n`https://<preview-url>/sum?a=2&b=3`\n\nVerify that the response is HTTP 200 and contains:\n\n```json\n{\"total\":5}\n```\n\nReturn the actual Vercel preview URL.\n\n## 6. Execution limits\n\n- Maximum AI inference spending: **$0.50 USD**\n- Maximum total execution time: **10 minutes**\n- One execution attempt; no automatic restart.\n- Do not exceed either limit.\n- If blocked, stop and report the exact reason and completed steps.\n- Do not claim success without verified evidence.\n\n## 7. Final acceptance report\n\nReport:\n\n- Job ID\n- Files created and repaired\n- Root cause of the bug\n- Automated tests passed/failed\n- GitHub repository URL\n- Pull request URL\n- Vercel preview URL\n- Actual endpoint response\n- Total AI inference cost in USD\n- Total execution time\n- Final result: **PASS or FAIL**\n\n**PASS only if the repaired application passes its tests, the GitHub PR exists, the Vercel preview works, and all spending and time limits are respected.**\n\nDo not substitute simulated publication or deployment results for real evidence."
const conversationId = '11111111-1111-4111-8111-111111111111'

test('a titled application spec from chat becomes a Builder job, like on the Developer page', () => {
  assert.equal(structuredApplicationBuild(spec), true)
  assert.equal(isConciergeBuilderObjective(spec, { attachmentNames: [] }), true)
  assert.equal(wantsIsolatedPublication(spec), true, 'the server admits its publication lane')
  const request = conciergeBuilderRequest({ messages: [{ role: 'user', content: spec }], context: { conversationId } })
  assert.equal(request?.endpoint, '/api/builder')
  assert.deepEqual(request?.body.files, [], 'example fences are not staged as source files')
  assert.equal(request?.body.objective, spec)
})

test('ordinary edit requests from the same chat never start Builder', () => {
  for (const edit of [
    'edit - i have voted for Trump three times and i would vote for him a foruth time if he could run again.',
    'edit  - Hi Ryland,  how can I get SCRY added to my phone? Would you have some time we culd meet before my trip?  Thank you',
    'edit - Hi Tim,\n\nI am filling up the DS 7100 form for my coming request leave in January 27, can you please confirm how many hours of COMP Time I have, thank you.',
  ]) {
    assert.equal(isConciergeBuilderObjective(edit, { attachmentNames: [] }), false, edit)
    assert.equal(isCosCodingObjective(edit, { attachmentNames: [] }), false, edit)
  }
})
