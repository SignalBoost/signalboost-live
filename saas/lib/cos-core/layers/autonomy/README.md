# COS Local Reasoning

The local reasoning director is planning-only and provider-optional. It decomposes objectives deterministically, reuses successful strategies from the COS learning store, scores confidence, and returns either `local` or `escalate`. It never invokes OpenAI, Anthropic, or another model directly.

Provider escalation is intentionally outside this layer and remains subject to existing COS governance.
