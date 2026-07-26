// saas/self-healing-host/acceptance-entry.ts
//
// The one thing the acceptance runner needs: a module whose default export is a
// HostContext, or a function returning one.
//
// It exists so acceptance can be run by someone with no terminal — a workflow
// points at this path and everything else is already wired. It adds no
// behaviour of its own; if acceptance passes here it passed against the real
// platform host adapter, not against a fixture.

import { createSignalBoostHostContext } from './signalboost-host-context.ts';

export default async function acceptanceHost() {
  return await createSignalBoostHostContext();
}
