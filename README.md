<!-- path: /home/workdir/artifacts/signalboost-live-patch/README.md -->
<!-- repo: drop these two files onto main, then deploy -->
COS live-fact verifier patch
Replace these files in `SignalBoost/signalboost-live` with no other edits.
This pack	Commit over
`saas/lib/ai/cos/cosFirstAnswer.ts`	`saas/lib/ai/cos/cosFirstAnswer.ts`
`saas/lib/ai/cos/cosFreshGrounding.ts`	`saas/lib/ai/cos/cosFreshGrounding.ts`
Then merge and redeploy `saas.signalboostapp.com`. A git commit without deploy will not change COS.
What changed:
Live-fact synthesis now receives `QUANTITATIVE_ANSWER_POLICY` (already used on the general public path).
LIVE pages may supply numbers. They may not supply the question's categories or opening frame.
Grounding block tells the model to split raw vs matched quantities.
Do not keep the `// COPY-PASTE TARGET` banner if your linter forbids it; delete those two lines after paste if required. They are path markers only.
