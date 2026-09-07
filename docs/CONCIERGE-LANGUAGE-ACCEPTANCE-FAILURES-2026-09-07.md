# Concierge five-language live acceptance failures — 2026-09-07

Production run against merge `a1d043afa61b1c23a384158e6df5d01c8005881b` executed all 25 owner-only acceptance cases.

Observed automated results:

- English: 4/5 — transformation changed protected `ALPHA-42` casing to `Alpha-42`.
- Spanish: 5/5.
- Brazilian Portuguese: 3/5 — operational guidance was misclassified as service identity; transformation changed protected `ALPHA-42` casing.
- Polish: 3/5 — operational guidance produced no releasable answer; transformation changed protected `ALPHA-42` casing.
- Russian: 5/5.

The automated gate therefore failed. Human-native review remains pending and must not be inferred from automated results.

Repair requirements:

1. Preserve explicit critical identifiers exactly in released Concierge prose without weakening the acceptance check.
2. Prevent ordinary multilingual operational/product-use requests from being classified as SignalBoost identity questions merely because they contain conjunction/interrogative tokens elsewhere in the sentence.
3. Give the public stateless reasoner one bounded retry only when the first completion is empty, truncated, or unparseable; do not retry policy/confidence/disclosure rejection.
4. Put the native-language contract into the first public reasoning pass, while keeping the final reviewer as a bounded repair layer.
5. Re-run deterministic gates, exact Preview, merge on a serialized current-main base, exact Production READY, then run a fresh 25-case Production matrix. Human-native review remains a separate gate.
