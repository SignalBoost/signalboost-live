test('log-derived workspace jobs never acquire repository authority', () => {
  assert.doesNotMatch(route, /VercelRepositoryRepairSession/)
  // Repository scope exists only in the owner-gated Platform Engineer lane, which is pinned to the
  // deployed revision and returns before any log-derived workspace job is created.
  const owner = route.indexOf('if (!access.isOwner)')
  const execute = route.indexOf('executeSignalBoostRepositoryRepair({', owner)
  const logEvidence = route.indexOf('const logEvidence = isOperationalLogEvidence(objective)', execute)
  const enqueue = route.indexOf('await enqueueBuilderJob({', logEvidence)
  assert.ok(owner >= 0)
  assert.ok(execute > owner)
  assert.ok(logEvidence > execute)
  assert.ok(enqueue > logEvidence)
  assert.match(route, /await persistSynchronousReply\(\{ conversationId, userId: access\.userId, objective, reply \}\)/)
})
