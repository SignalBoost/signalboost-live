# Mission 002 Phase 10: stale request protection

## Request cancellation

The read-only Mission Review client uses separate `AbortController` instances for review-list and review-detail inspection requests. Starting a new list request aborts the previous list request. Starting a new detail request aborts the previous detail request, and closing the detail panel aborts its active detail request.

## Stale-response prevention

Each request stream has a monotonically increasing request identifier. A response may update state only when it still belongs to the newest request and its controller has not been aborted. This prevents an older list response from replacing newer filtered or paginated results, and prevents review A from replacing review B after the operator opens B.

Aborted or superseded list and detail requests do not clear results or display errors. Diagnostics requests are unchanged by this phase.

## Unmount cleanup

The client aborts active list and detail requests during component unmount. This prevents asynchronous inspection responses from updating an unmounted Mission Review page.

## Unchanged read-only boundary

This phase changes browser-side cancellation only. Mission Review continues to issue only existing GET inspection requests. It adds no mutation controls, approval, retry, replay, repair execution, provider mutation, GitHub write, browser automation, shell execution, LLM call, API route, database/schema/store/RPC, authentication, lifecycle, or diagnostics behavior. Production execution remains disabled.
