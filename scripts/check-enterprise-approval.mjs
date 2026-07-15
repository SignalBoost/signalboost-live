#!/usr/bin/env node
// Root-level compatibility entrypoint. The SaaS workspace owns the guard logic
// because CI runs package scripts from saas/, while some repo-level checks call
// this root path directly.
import '../saas/scripts/check-enterprise-approval.mjs'
