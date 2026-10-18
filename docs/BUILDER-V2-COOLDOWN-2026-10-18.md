# Builder coding cooldown routing

Production job `69e83127-4526-4e01-8612-abc87359605c` succeeded on revision
`cde2ff1fbeccbd5da9d55fe91f5787099a528c63`, from 11:15:38 to 11:34:40 UTC
on 2026-10-18. Its final runtime command and both required test commands passed.

Job-filtered Vercel inference telemetry contains six failed generic Builder RunPod
reasoner calls totaling 567,443 ms, alongside the dedicated coding-primary calls.
When the shared coding-primary timeout circuit opened, no primary call was made,
so `ownedAttempted` was false. The configured fallback consequently entered the
generic local router without `fallbackFromOwned`, making the general RunPod
reasoner eligible again before the existing DeepInfra fallback.

`createBuilderCodingAiPort` now passes fallback provenance when either an owned
call was attempted or the shared primary timeout cooldown is open. This keeps a
health-based skip from re-entering generic RunPod routing. Graduate priority,
healthy coding probes, assigned-model ordering, busy-slot deferral, cancellation,
provider selection, and existing cost ceilings retain their existing behavior.

The deterministic router regression failed before the change and passes after it.
It covers repeated cooldown calls, healthy primary success, failed-probe fallback,
busy-slot deferral, cancellation, and forwarding of the signal, token limit,
truncated-output policy, and cost cap. The suite is in the Vercel gate. All 69
local Builder V2 and coding cancellation/cooldown tests pass without paid inference.

This establishes the routing correction in tests. Future live job duration and the
amount of time saved require a new job measurement; the earlier 567 seconds is
observed failed-call time, not a promised reduction for every future build.
