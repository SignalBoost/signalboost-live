# Mission 002 Phase 11: independent UI state

## Independent state model

The read-only Mission Review client maintains separate loading, error, cancellation, and stale-response state for the review list, diagnostics summary, and selected review detail. A request may update only its own section when its request identifier is still current and its `AbortController` has not been aborted.

This isolates failures: diagnostics failures preserve the review list, list failures preserve the diagnostics summary, and detail failures preserve the review list. Opening a detail does not clear diagnostics, and list refreshes do not clear detail state.

## Retry behavior

Diagnostics and review detail each provide a small Retry button after their own failure. Diagnostics retry calls only the existing diagnostics GET endpoint. Detail retry calls only the existing selected-detail GET endpoint. Neither button reloads the page or starts a workflow retry.

## Failure isolation and stale responses

Each stream aborts its prior request before starting a newer request. List, diagnostics, and detail request identifiers independently reject stale success and failure responses. A diagnostics refresh never reloads the list; a list refresh never reloads diagnostics; and a detail retry never reloads either other section.

## Unchanged read-only boundary

This phase changes browser-side UI state only. It does not modify API routes, Supabase, authentication, mission lifecycle, diagnostics calculations, or the manual-review store. The client continues to issue only the three existing GET inspection requests. It adds no write API, approval, workflow retry, replay, repair, provider mutation, GitHub write, browser automation, shell execution, or LLM call. Production execution remains disabled.
