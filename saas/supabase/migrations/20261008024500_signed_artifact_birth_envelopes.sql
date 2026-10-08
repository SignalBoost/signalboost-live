-- Phase 2: immutable, non-public storage for externally issued Ed25519 birth signatures.
-- Does NOT generate signing keys or sign birth records inside Postgres.
-- Does NOT modify existing unsigned historical certificates or any Phase 1 gate.
create table if not exists public.cos_university_signed_birth_envelopes (
  permanent_artifact_id uuid primary key
    references public.cos_university_artifact_birth_certificates(permanent_artifact_id),
  trained_artifact_hash text not null check (trained_artifact_hash ~ '^[a-f0-9]{64}$'),
  revision_key text not null check (revision_key ~ '^[a-f0-9]{64}$'),
  dataset_hash text not null check (dataset_hash ~ '^[a-f0-9]{64}$'),
  parent_permanent_artifact_id uuid,
  vin text not null unique check (vin ~ '^AI-[a-f0-9]{64}$'),
  algorithm text not null check (algorithm = 'ed25519'),
  signature_base64 text not null,
  issuer_public_key_pem text not null,
  issuer_fingerprint text not null check (issuer_fingerprint ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz not null default now(),
  authority_expanded boolean not null default false check (authority_expanded is false)
);
alter table public.cos_university_signed_birth_envelopes enable row level security;
revoke all on public.cos_university_signed_birth_envelopes from public, anon, authenticated;
grant select, insert on public.cos_university_signed_birth_envelopes to service_role;

-- A signed envelope must reproduce immutable canonical birth facts exactly.
-- Cryptographic signature verification is performed in the trusted application boundary;
-- the database alone must never label an envelope verified.
create or replace function public.enforce_cos_signed_birth_record_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  birth record;
begin
  select permanent_artifact_id, issuance_kind, trained_artifact_hash,
         revision_key, dataset_hash, parent_permanent_artifact_id
  into birth
  from public.cos_university_artifact_birth_certificates
  where permanent_artifact_id = new.permanent_artifact_id;
  if not found or birth.issuance_kind is distinct from 'native_birth'
     or birth.trained_artifact_hash is distinct from new.trained_artifact_hash
     or birth.revision_key is distinct from new.revision_key
     or birth.dataset_hash is distinct from new.dataset_hash
     or birth.parent_permanent_artifact_id is distinct from new.parent_permanent_artifact_id then
    raise exception 'signed_birth_identity_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_cos_signed_birth_record_match() from public, anon, authenticated;
drop trigger if exists cos_signed_birth_match_on_insert on public.cos_university_signed_birth_envelopes;
create trigger cos_signed_birth_match_on_insert
before insert on public.cos_university_signed_birth_envelopes
for each row execute function public.enforce_cos_signed_birth_record_match();

drop trigger if exists cos_signed_birth_immutable on public.cos_university_signed_birth_envelopes;
create trigger cos_signed_birth_immutable
before update or delete on public.cos_university_signed_birth_envelopes
for each row execute function public.prevent_cos_artifact_birth_certificate_mutation();

comment on table public.cos_university_signed_birth_envelopes is
  'Phase 2 immutable detached birth signatures; verification and trusted issuer pinning are mandatory in the authorized application boundary. Does not confer competency or serving authority.';
