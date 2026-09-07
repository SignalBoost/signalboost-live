# Concierge language acceptance follow-up — 2026-09-07

Fresh Production matrix after PR #1932 completed 25/25 cases but the automated gate failed 23/25.

Observed failures:
- Spanish conversation: explicit protected identifier `ALPHA-42` was omitted; `criticalTokensPreserved=false`.
- Polish operational: reply was clearly Polish, but the stopword-only selected-language detector returned false.

Human-language inspection also found defects not captured by the automated gate, including Spanish `los fricciones` in a reasoning answer even though the native reviewer recorded 0.95 confidence. Native-review confidence is therefore not release evidence.

Follow-up architecture:
1. Apply only the selected language's native-writing contract in first-pass reasoning, instead of injecting all five profiles simultaneously.
2. Strengthen the native reviewer with an explicit morphology/agreement/idiom scan, while keeping human native review authoritative.
3. Treat user instructions to preserve literal identifiers/URLs/names as release invariants; run one bounded language-only repair if a protected literal is missing, then fail closed if the invariant is still not restored.
4. Improve Polish automated language detection with Polish orthographic evidence so valid Polish prose does not fail merely for having few generic stopwords.
5. Add regressions for the exact observed failure classes without hard-coding the faulty output sentences as production answers.

No language is declared native-quality accepted until a fresh Production matrix passes and fluent human review passes.
