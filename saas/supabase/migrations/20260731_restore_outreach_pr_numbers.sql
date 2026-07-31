-- Restore durable Purchase Request identifiers for the outreach approval workflow.
--
-- Every outreach_queue row is an approval request. Earlier UI restoration exposed a
-- shortened UUID (#xxxxxxxx), but that is not a human-readable, sequential PR number.
-- This migration assigns PR-YYYY-###### identifiers to existing rows and guarantees
-- that every future draft receives one before it enters Pending approval.

create sequence if not exists public.outreach_pr_number_seq;

alter table public.outreach_queue
  add column if not exists pr_number text;

create or replace function public.assign_outreach_pr_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.pr_number is null or btrim(new.pr_number) = '' then
    new.pr_number := format(
      'PR-%s-%s',
      to_char(coalesce(new.created_at, now()), 'YYYY'),
      lpad(nextval('public.outreach_pr_number_seq')::text, 6, '0')
    );
  end if;

  return new;
end;
$$;

-- Backfill every existing approval request, including pending campaigns already in
-- the queue. The sequence guarantees that no two restored rows receive the same PR.
update public.outreach_queue
set pr_number = format(
  'PR-%s-%s',
  to_char(coalesce(created_at, now()), 'YYYY'),
  lpad(nextval('public.outreach_pr_number_seq')::text, 6, '0')
)
where pr_number is null or btrim(pr_number) = '';

create unique index if not exists outreach_queue_pr_number_uidx
  on public.outreach_queue (pr_number)
  where pr_number is not null;

drop trigger if exists outreach_queue_assign_pr_number on public.outreach_queue;
create trigger outreach_queue_assign_pr_number
before insert on public.outreach_queue
for each row
execute function public.assign_outreach_pr_number();

comment on column public.outreach_queue.pr_number is
  'Human-readable Purchase Request identifier assigned when an outreach approval request is created.';
