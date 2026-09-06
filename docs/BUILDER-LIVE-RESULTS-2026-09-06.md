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
