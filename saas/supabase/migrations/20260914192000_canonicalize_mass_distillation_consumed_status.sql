-- Canonical terminal state for mass-distillation curriculum batches is `consumed`.
-- Older/current runtime code may still write the legacy word `retired`; canonicalize it before the
-- table CHECK constraint so a successful rollback callback cannot fail after durable artifact state
-- has already been committed.

create or replace function public.canonicalize_cos_university_distillation_curriculum_terminal_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'retired' then
    new.status := 'consumed';
    new.consumed_at := coalesce(new.consumed_at, clock_timestamp());
  elsif new.status = 'consumed' then
    new.consumed_at := coalesce(new.consumed_at, clock_timestamp());
  end if;
  return new;
end;
$$;

drop trigger if exists cos_university_distillation_curriculum_terminal_status_canonicalize
  on public.cos_university_distillation_curriculum_batches;
create trigger cos_university_distillation_curriculum_terminal_status_canonicalize
before insert or update of status on public.cos_university_distillation_curriculum_batches
for each row
execute function public.canonicalize_cos_university_distillation_curriculum_terminal_status();

-- Repair already-complete runs whose rollback callback committed artifact/run state before the legacy
-- `retired` value hit the curriculum status CHECK and caused the HTTP callback to fail.
update public.cos_university_distillation_curriculum_batches b
set status='consumed',
    consumed_at=coalesce(b.consumed_at,r.completed_at,clock_timestamp()),
    updated_at=clock_timestamp()
from public.cos_university_mass_distillation_batch_runs r
where r.batch_key=b.batch_key
  and r.stage='complete'
  and b.status='prepared';
