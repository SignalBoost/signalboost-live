# Mission 002 Phase 12 — Safe Timestamp Rendering

The Mission Review operator page now sends every displayed timestamp through one
client-side `formatTimestamp(value, fallback)` helper. The helper keeps the
existing `Date#toLocaleString()` behavior for valid values, while returning the
localized `unavailable` label when a timestamp is missing, malformed, non-finite,
or cannot be formatted by the browser.

## Affected read-only fields

- Review-list created and routed times.
- Review-detail created and routed times.
- Diagnostics oldest and newest routed times.
- Mission-summary created and updated times.

The page therefore never displays `Invalid Date`, and formatting exceptions cannot
break the read-only operator view.

## Unchanged boundaries

This change does not alter API validation, timestamp contracts, diagnostics
calculations, request cancellation, response allowlists, authentication, or any
backend behavior. The Mission Review page remains GET-only and read-only: it adds
no approval, retry-execution, replay, repair, provider, GitHub, or other mutation
control. Production execution remains disabled.
