# Mission 002 event foundation

This limited foundation extends the existing Mission 001 Supervisor rather than creating a second policy engine, dispatcher, or executor. It adds validated mission lifecycle records, centralized logical topics, a broker-neutral in-memory event bus, optimistic in-memory mission storage, and a deterministic CI-failure-to-manual-review flow.

The event bus is transport only. The existing Mission 001 `DefaultSupervisorPolicyEngine` remains authoritative and evaluates the safe manual-routing proposal. Execution is deliberately non-mutating: the only execution feedback is `manual_review_routed`; no provider, GitHub, CI, browser, shell, deployment, database, or network action is performed.

Deferred: Kafka, BullMQ persistence, Supabase mission persistence, Temporal, MCTS, LLMs, critics, production execution, provider actions, and automatic GitHub changes. The current in-memory bus and store are process-local test foundations and provide no durable delivery or replay. The next safe step is a reviewed durable outbox/store design that preserves this validation and Policy Engine boundary without enabling mutations.
