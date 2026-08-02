// saas/lib/portable-browser/testing/index.ts
//
// TEST DOUBLES A BUYER CAN BUILD AGAINST BEFORE THEY OWN ANY OF THE REAL THINGS.
//
// Shipped as a second entry point rather than folded into the main barrel, so a buyer imports
// them deliberately and nothing in a production bundle reaches them by accident.
//
// They exist because the honest alternative is worse. Wiring this portable means implementing a
// session port, an approval port, a policy port, an evidence sink and a telemetry sink before
// anything can run at all — and a buyer who has to write five stubs before the first green test
// will write them badly, or write them permissive. The deny-all ports in particular are the
// SAFE default to start from: a policy that refuses everything makes the first thing a buyer
// does explicitly allow something, rather than discover later that nothing was ever refused.

export * from './deny-all-browser-approval-port.ts'
export * from './deny-all-browser-policy-port.ts'
export * from './fake-browser-session-port.ts'
export * from './fake-browser-web-data-port.ts'
export * from './fake-human-control-port.ts'
export * from './in-memory-browser-evidence-port.ts'
export * from './in-memory-browser-telemetry-port.ts'
export * from './scripted-browser-agent-loop.ts'
