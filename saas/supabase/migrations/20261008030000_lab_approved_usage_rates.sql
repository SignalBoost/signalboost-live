-- Phase 4: approved, immutable usage rate cards. Does NOT change or enable billing.
-- Operator approval, not a vendor payload, creates a rate. No default conversion exists.
create table lab.approved_usage_rates (
  rate_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references lab.organizations(id),
  provider text not null check (length(btrim(provider)) > 0),
  model text not null check (length(btrim(model)) > 0),
  unit text not null check (unit in ('input_token','output_token','compute_second','teacher_unit','evaluator_unit')),
  microcredits_per_unit bigint not null check (microcredits_per_unit > 0),
  effective_at timestamptz not null,
  expires_at timestamptz,
  approved_by text not null check (length(btrim(approved_by)) > 0),
  approval_ref text not null check (length(btrim(approval_ref)) >= 8),
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > effective_at),
  unique (organization_id, provider, model, unit, effective_at)
);
alter table lab.approved_usage_rates enable row level security;
revoke all on lab.approved_usage_rates from public, anon, authenticated, service_role;

create function lab.prevent_usage_rate_mutation() returns trigger
language plpgsql set search_path = pg_catalog, lab as $$
begin
  raise exception 'lab_approved_usage_rate_immutable';
end $$;
create trigger lab_usage_rate_no_update_delete
  before update or delete on lab.approved_usage_rates
  for each row execute function lab.prevent_usage_rate_mutation();

-- Explicit rate ID + tenant + usage timestamp make the pricing version reproducible.
-- Reject ambiguous overlapping rates, missing approvals, and nonpositive usage.
create function lab.quote_usage_microcredits(
  p_organization_id uuid, p_rate_id uuid, p_provider text, p_model text,
  p_unit text, p_units bigint, p_used_at timestamptz
) returns bigint language plpgsql security definer
set search_path = pg_catalog, lab as $$
declare r lab.approved_usage_rates%rowtype;
begin
  if session_user not in ('postgres','service_role')
    or current_setting('lab.trusted_organization_id',true) is distinct from p_organization_id::text
    then raise exception 'lab_tenant_authority_denied'; end if;
  if p_units is null or p_units <= 0 or p_used_at is null
    then raise exception 'lab_invalid_usage'; end if;
  select * into r from lab.approved_usage_rates
    where rate_id=p_rate_id and organization_id=p_organization_id
      and provider=p_provider and model=p_model and unit=p_unit
      and effective_at<=p_used_at and (expires_at is null or p_used_at<expires_at);
  if not found then raise exception 'lab_approved_usage_rate_missing'; end if;
  if exists (
    select 1 from lab.approved_usage_rates r2
    where r2.rate_id<>r.rate_id and r2.organization_id=r.organization_id
      and r2.provider=r.provider and r2.model=r.model and r2.unit=r.unit
      and r2.effective_at<=p_used_at
      and (r2.expires_at is null or p_used_at<r2.expires_at)
  ) then raise exception 'lab_approved_usage_rate_ambiguous'; end if;
  return p_units * r.microcredits_per_unit;
end $$;
revoke all on function lab.quote_usage_microcredits(uuid,uuid,text,text,text,bigint,timestamptz)
  from public, anon, authenticated;
grant execute on function lab.quote_usage_microcredits(uuid,uuid,text,text,text,bigint,timestamptz)
  to service_role;
