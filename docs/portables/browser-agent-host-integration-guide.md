# Portable Browser Agent Host Integration Guide

The portable browser runtime composes buyer-injected ports only. Select a session provider, agent loop, policy engine, credential broker, approval service, evidence store, and telemetry sink; optionally add web data, human control, and scheduling. A single integrated host may provide multiple ports. Validate its descriptors against the vendor-neutral manifest before activation. Descriptor catalog entries are metadata-only compatibility targets, not active integrations, installed packages, or production enablement.

The coordinator requires session, agent loop, credential, policy, approval, evidence, and telemetry ports. It accepts optional web-data, human-control, and scheduler ports. The host owns tenant isolation, exact approved origins, credential grants, kill switch, suspension, quotas, residency, retention, and human release transitions.
