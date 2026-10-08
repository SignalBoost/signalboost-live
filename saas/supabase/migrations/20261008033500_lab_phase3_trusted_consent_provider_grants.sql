-- Phase 3 only: trusted tenant-owned consent and opaque provider grant records.
-- No public or client write interface. Enrollment/consent issuance and secret storage must be
-- provided by separately authenticated owner/admin operations before any live use.
CREATE TABLE IF NOT EXISTS lab.research_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  experiment_id uuid NOT NULL,
  granted_by uuid NOT NULL REFERENCES auth.users(id),
  destination_organization_id uuid NOT NULL REFERENCES lab.organizations(id),
  rights_cleared boolean NOT NULL DEFAULT false,
  consent_granted boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (experiment_id,organization_id) REFERENCES lab.experiments(id,organization_id),
  CHECK (destination_organization_id <> organization_id),
  UNIQUE (id,organization_id)
);
ALTER TABLE lab.research_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lab.research_consents FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX IF NOT EXISTS lab_research_consents_scope_idx ON lab.research_consents(organization_id,experiment_id,destination_organization_id);

CREATE TABLE IF NOT EXISTS lab.provider_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES lab.organizations(id),
  provider_id text NOT NULL CHECK (provider_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
  permanent_artifact_id uuid NOT NULL,
  capability text NOT NULL CHECK (capability IN ('teacher.invoke','compute.execute','tool.invoke')),
  secret_reference text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(permanent_artifact_id,organization_id) REFERENCES lab.artifacts(permanent_artifact_id,organization_id),
  CHECK (expires_at > created_at),
  CHECK (secret_reference ~ '^vault://[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}/[a-zA-Z0-9/_-]{1,200}$'),
  UNIQUE (id,organization_id)
);
ALTER TABLE lab.provider_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lab.provider_grants FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX IF NOT EXISTS lab_provider_grants_scope_idx ON lab.provider_grants(organization_id,provider_id,permanent_artifact_id);

-- Require the path's tenant namespace to equal the actual organization, not just
-- syntactically resemble a vault URI. Never store or expose actual credentials.
ALTER TABLE lab.provider_grants ADD CONSTRAINT provider_grants_vault_tenant_check
  CHECK (split_part(split_part(secret_reference,'vault://',2),'/',1) = organization_id::text);

-- These tables are deliberately not exposed through public RPCs. Security-definer
-- issuance and redemption, consent provenance, and production secret-store wiring
-- must be reviewed separately; their absence blocks Phase 3 certification.
