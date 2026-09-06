# Builder live observations, 2026-09-06

Production commit: b9d3a57ead4dd222ea2315cc76179617446bad19 (#1862).
Deployment observed READY: dpl_EE7gU4kjGxZHhPpSp5435Vx7Dkxg.
All tasks submitted by engineering through authenticated Concierge with actual model decisions and sandbox execution.

| Task | Observation |
| --- | --- |
| Same hello.js prompt, five fresh workspaces | 5/5 passed; node hello.js, exit 0, expected stdout |
| Attached total.js off-by-one repair | Failed before edit (NaN !== 6), changed <= to <, all three assertions preserved and passed |
| Explanation in the repair conversation | Failed: generic Marketplace reply |
| is-number 7.0.0 dependency task | Failed before user command: npm rejected loading /dev/null as both user and global config |
| 600-record literal JSON | Failed with builder_model_output_limit before any write |
| Public is-number repository import and npm test | Imported source but dependency preparation failed with the same npm config error |

Recorded jobs: hello 66569497-5504-41da-a6c2-7fa224fad5e7, cba52796-0e13-4dd2-97e4-19e19c5fbc77, 0d044aae-4373-4d55-a022-05ad2bf3f5ff; repair cfcc9d42-aeb3-4e47-a48f-872cbe2b3557; dependency df9748e5-84bd-46f9-a04b-81850bb27fc8; large file b12a7ccb-33da-4eac-9a92-9e89bc5694fd; import 867b5429-4e77-4b0b-aebe-657e77237e0e. Fourth and fifth hello outputs were also observed directly in separate Concierge workspaces bd149481-29c9-4a7c-83c0-b66985872f14 and e12b3b85-2d78-4560-8b6b-0afd53c5a74a.

The follow-up patch uses distinct empty npm config files, asks for small append chunks after provider truncation, and routes explanation requests through authorized saved job evidence and current files without an execution port. New successful edit traces retain bounded search/replace evidence. Older jobs lack that historical diff; the explanation must disclose that limitation rather than invent the change.

Local verification: all 931 mandatory regressions and TypeScript passed. Post-deployment retests of these fixes remain pending. These observations establish narrow real-task capability and concrete failures, not general parity. Engineering owns implementation and live verification; the owner evaluates the finished experience.

## Production follow-through after #1866

Commit 62cccc7b6fdd39fc7da76d1eb6b543452ab9e84f; deployment dpl_2pYFjLwMzpyLYRFacqPmDcCK4NqH READY. #1863 closed as superseded after its useful rejection/storage/native-control cases were adapted to the deployed offset protocol. The #1866 mandatory gate passed 937 tests and TypeScript.

- Dependency job 8cf19dac-304b-426c-bc55-ad1dd77832ac: exact is-number 7.0.0 installed, node app.js exited 0 and printed dependency checks passed; manifest, app and generated lock downloadable.
- Repository job a8699981-f1ef-4fdc-a646-34a11bbb4921: npm test exited 0 with 111 passing. No source/test edit appears in its saved trace.
- Fresh repair 6b5950f8-142d-46f2-ad55-211a801655d0: failed with NaN !== 6, changed index <= values.length to index < values.length, then passed all three original assertions. Its explanation used the recorded diff and current source to correctly explain the out-of-bounds read, with no command rerun.
- Older repair follow-up now routes to saved evidence and discloses its missing historical diff, but offered an unnecessary possible-cause example. The follow-up prompt now explicitly forbids speculative examples and asks for missing evidence instead.
- Large job eb3c541a-14b0-43ef-8fcb-2727cbf9e751: six successful chunk writes produced the literal catalog.json, but the job then failed with builder_model_output_limit and never produced verify.js or ran verification. Independent read-only artifact inspection confirmed 600 records, every id/name/price correct, total 18030000. This is artifact proof, not a passed Builder job.

The exact large-task prompt extracted only catalog.json and no commands. The next patch retains its second inline create (verify.js) and inline Run command (node verify.js). It also directs repetitive checks to compact loops without relaxing any assertion or permitting generators instead of requested literal data. The same full task must be rerun after deployment.

## Full large-task result after #1870

Application commit **5fe8fa801897613b6fd5d6bcaea2d042f21bb635**; Production **dpl_7DgpSPxZCYPaEwMV8aoQpgdQJ44N** observed READY. All 940 mandatory regressions, TypeScript, Preview and applicable CI workflows passed before merge.

The unchanged 600-record prompt succeeded through the real Concierge/model/sandbox path:

- Job: 534edf15-ac7b-4778-8f52-c782be05e0e4.
- Workspace: 16100648-15d7-4a17-bcb3-4601e6c975cc.
- Nine recorded tool rounds; one invocation.
- Downloadable files: catalog.json and verify.js.
- Recorded command: node verify.js.
- Exit code: 0. stdout: 600 products verified. stderr: empty.
- Inspected verifier uses node:assert/strict, checks exactly 600 records, every sequential id, Product N name, id-times-100 price, and sum 18030000 before printing success.

The old repair explanation was also repeated on this deployment: it identified the recorded NaN assertion, explicitly disclosed missing pre-edit source/diff, and asked for that evidence without suggesting an unverified cause. The newer repair had already demonstrated correct cause explanation from its saved <= to < diff, preserving all three assertions and running no new commands for the follow-up.

Engineering performed all checks. These results establish the listed live capabilities and resolve the observed failures; they do not establish universal parity, private-repository import, repository-history inspection, or success on arbitrary projects.


## Automatic initial repair explanation after #1873

Application commit `a9e799604f9b01ba5a27401a083ffb141167b18a`; Production `dpl_DYqbv14Ar1XTgChPt1f7RRS8Q2eY` observed READY. All 946 mandatory regressions, TypeScript, ten CI workflows and exact Preview passed before merge.

The authenticated Concierge request attached the original broken total.js and said only:

> Repair the attached total.js. First run node total.js to reproduce the failure, fix the implementation without removing or weakening assertions, then rerun node total.js. Return the corrected file.

No explanation request or follow-up was sent. Job `b1ecb21f-37ee-4734-af63-0ce2f61c5837`, workspace `f3a1fd27-6754-4bcb-9da8-45a9ce99c9cd`, succeeded in one invocation with five recorded tool rounds. Read-only job inspection confirmed first run exit 1 with NaN !== 6, a single recorded <= to < loop-boundary edit, then the same command exit 0 with stdout `3 assertions passed` and empty stderr. The displayed corrected source preserved all three original assertions.

The first response automatically explained that values[3] was undefined and made the sum NaN, identified the exact recorded edit, listed the three passing cases and their coverage limit, and said no further action was required for the recorded failure. It returned the corrected downloadable file and actual command evidence. This verifies automatic explanation for the observed workspace repair. It does not extend the separate owner repository-repair reporting lane or establish universal task success.
