# Builder Large-Context Debug Intake

**Date:** 2026-08-31  
**Status:** implemented locally; Production acceptance pending

## Defect

Builder rejected any objective above 64,000 characters before inspecting attached source files. It
also treated any pasted build log as analysis-only even when the user explicitly requested a repair
and supplied the editable file. The result was a dead end instead of the existing bounded
run → observe failure → edit → rerun protocol.

## Correction

- accept raw request text up to 512,000 characters;
- keep the durable job/storage objective at 64,000 characters;
- deterministically retain the opening request and newest diagnostic evidence while omitting copied
  middle context;
- allow pasted logs only as evidence when an explicit debug/repair request includes exactly one
  supported source attachment;
- preserve analysis-only behavior for logs or transcripts without editable source;
- preserve the fixed one-file, one-edit, same-command rerun boundary.

No model summarizes the omitted context and no instruction found only in the omitted middle section
can grant execution authority. The source attachment supplies the only edit/run authority.

## Acceptance still required

Run the mandatory deployment gate, obtain a READY Preview, merge only after current-head checks pass,
deploy the exact merge to Production, and observe one authenticated oversized-context repair whose
first command fails and identical verification command passes.
