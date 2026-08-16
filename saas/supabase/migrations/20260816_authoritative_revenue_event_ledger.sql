-- Durable, service-role-only ledger for authoritative business/revenue events.
-- event_id is the immutable idempotency boundary. Accepted events may feed COS episodic outcome
-- learning, but this table itself does not imply success or promote knowledge/skills.
create table if not exists public.revenue_events (
  event_id text primary key,
  schema_version text not null,
  tenant_id text not null,
  environment_id text not null,
  region text,
  occurred_at timestamptz not null,
  received_at timestamptz not null,
  event_type text not null check (event_type in (
    'lead_created',
    'contact_created',
    'prospect_enriched',
    'email_sent',
    'email_opened',
    'email_clicked',
    'reply_received',
    'meeting_booked',
    'meeting_completed',
    'opportunity_created',
    'opportunity_advanced',
    'opportunity_won',
    'opportunity_lost',
    'invoice_paid',
    'renewal_completed'
  )),
  source text not null check (source in (
    'communication_hub',
    'crm_hub',
    'prospect_hub',
    'revenue_hub',
    'manual',
    'universal_adapter',
    'external_provider'
  )),
  source_provider text,
  actor jsonb,
  organization jsonb,
  contact jsonb,
  campaign jsonb,
  opportunity_id text,
  pipeline_id text,
  value numeric,
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  evidence_refs jsonb not null default '[]'::jsonb,
  correlation_id text,
  parent_event_id text,
  created_at timestamptz not null default now(),
  constraint revenue_events_value_currency_pair check ((value is null) = (currency is null)),
  constraint revenue_events_no_self_parent check (parent_event_id is null or parent_event_id <> event_id)
);

create index if not exists revenue_events_tenant_time_idx
  on public.revenue_events(tenant_id, occurred_at desc);
create index if not exists revenue_events_type_time_idx
  on public.revenue_events(event_type, occurred_at desc);
create index if not exists revenue_events_source_time_idx
  on public.revenue_events(source, occurred_at desc);
create index if not exists revenue_events_correlation_idx
  on public.revenue_events(correlation_id)
  where correlation_id is not null;

alter table public.revenue_events enable row level security;
revoke all on table public.revenue_events from anon, authenticated;
revoke all on table public.revenue_events from service_role;
grant select, insert on table public.revenue_events to service_role;

comment on table public.revenue_events is
  'Immutable accepted RevenueEvent ledger. Service-role insert/select only; event acceptance does not itself imply a successful business outcome or learned COS skill.';
