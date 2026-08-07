CREATE TABLE IF NOT EXISTS supervisor_audit_events (
  sequence_id BIGSERIAL PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  incident_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  schema_version TEXT NOT NULL,
  leaf_hash CHAR(64) NOT NULL,
  merkle_root_at_append CHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS supervisor_audit_incident_idx
  ON supervisor_audit_events(incident_id, sequence_id);

CREATE TABLE IF NOT EXISTS supervisor_merkle_frontier (
  level INTEGER PRIMARY KEY,
  node_hash CHAR(64) NOT NULL,
  leaf_count BIGINT NOT NULL CHECK (leaf_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supervisor_quorum_requests (
  request_id TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS supervisor_quorum_expiry_idx
  ON supervisor_quorum_requests(expires_at);
