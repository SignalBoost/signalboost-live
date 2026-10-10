-- Durable *metadata* binding for customer-owned trained artifact bytes.
-- This is not a public download route or evidence that any provider storage is connected.
-- A trusted host records the opaque object key only after verified provider upload
-- and exact SHA-256 hashing. No user-controllable URLs, credentials or public reads.
create table if not exists lab.artifact_export_objects (
  permanent_artifact_id uuid not null,
  organization_id uuid not null,
  provider_connection_id uuid not null,
  storage_object_key text not null check (
    length(storage_object_key) between 1 and 1024
    and storage_object_key !~ '[[:cntrl:]]'
    and storage_object_key !~* '^(https?://|file:|s3://)'
  ),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_length bigint not null check (byte_length > 0),
  artifact_media_type text not null default 'application/octet-stream'
    check (artifact_media_type = 'application/octet-stream'),
  created_at timestamptz not null default now(),
  primary key (permanent_artifact_id, organization_id),
  foreign key (permanent_artifact_id, organization_id)
    references lab.artifacts(permanent_artifact_id, organization_id)
    on delete cascade
);

alter table lab.artifact_export_objects enable row level security;
revoke all on lab.artifact_export_objects from public, anon, authenticated;
grant select, insert on lab.artifact_export_objects to service_role;

comment on table lab.artifact_export_objects is
  'Private immutable customer model export metadata; tenant-bound to lab.artifacts. NOT a signed URL or permission to download.';
