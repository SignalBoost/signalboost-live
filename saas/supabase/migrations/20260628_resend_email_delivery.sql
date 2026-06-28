-- saas/supabase/migrations/20260628_resend_email_delivery.sql
-- Resend email delivery tracking.
--
-- Purpose:
--   Today an outreach email is marked 'sent' the moment Resend accepts it for
--   delivery. "Accepted" is NOT "delivered" — it can still bounce, be deferred,
--   or be marked as spam, and the platform currently never hears about any of
--   that. These two tables close that gap so delivery truth lives in the console.
--
--   1. email_delivery_events  — append-only raw log of every Resend webhook
--      event. Never updated, never pruned by this migration: it is the audit
--      trail. We intentionally do NOT constrain event_type so a new Resend
--      event type can never cause us to silently drop a delivery signal.
--
--   2. email_delivery_status  — one row per Resend message id, rolled up to the
--      current delivery state. This is what the Hub Console "Email Delivery"
--      section and the outreach UI read for fast delivered/bounced/opened state.
--
-- Both are admin-only (RLS via public.is_signalboost_admin()). The Resend
-- webhook writes with the service role; operators read in the console.

create extension if not exists pgcrypto;

-- ── 1. Append-only raw event log ─────────────────────────────────────────────
create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  resend_email_id text,
  event_type text not null,
  to_email text,
  subject text,
  bounce_type text,
  occurred_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_delivery_events_email_idx
  on public.email_delivery_events(resend_email_id);
create index if not exists email_delivery_events_type_idx
  on public.email_delivery_events(event_type, occurred_at desc);
create index if not exists email_delivery_events_to_idx
  on public.email_delivery_events(to_email);
create index if not exists email_delivery_events_created_idx
  on public.email_delivery_events(created_at desc);

-- ── 2. Per-email current-state rollup ────────────────────────────────────────
create table if not exists public.email_delivery_status (
  resend_email_id text primary key,
  to_email text,
  last_event text,
  last_event_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounce_type text,
  open_count integer not null default 0,
  click_count integer not null default 0,
  outreach_id uuid references public.outreach_queue(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_delivery_status_last_idx
  on public.email_delivery_status(last_event, last_event_at desc);
create index if not exists email_delivery_status_outreach_idx
  on public.email_delivery_status(outreach_id);
create index if not exists email_delivery_status_to_idx
  on public.email_delivery_status(to_email);

drop trigger if exists email_delivery_status_touch_updated_at on public.email_delivery_status;
create trigger email_delivery_status_touch_updated_at
before update on public.email_delivery_status
for each row execute function public.touch_updated_at();

-- ── RLS: admin-only (service role bypasses RLS for webhook writes) ────────────
alter table public.email_delivery_events enable row level security;
alter table public.email_delivery_status enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_delivery_events'
      and policyname = 'Admins manage email delivery events'
  ) then
    create policy "Admins manage email delivery events"
      on public.email_delivery_events for all
      using (public.is_signalboost_admin())
      with check (public.is_signalboost_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_delivery_status'
      and policyname = 'Admins manage email delivery status'
  ) then
    create policy "Admins manage email delivery status"
      on public.email_delivery_status for all
      using (public.is_signalboost_admin())
      with check (public.is_signalboost_admin());
  end if;
end $$;
