-- Database guard for cognitive forgetting/quarantine semantics.
-- Historical counters must not silently promote a skill while weakened_at/quarantined_at remains set.

create or replace function public.cos_enforce_cognitive_skill_state_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quarantined_at is not null then
    new.status := 'quarantined';
  elsif new.weakened_at is not null then
    new.status := 'weakened';
  end if;

  if new.status in ('validated','learned','mastered') and new.next_retention_due_at is null then
    new.next_retention_due_at := now() +
      case new.status
        when 'mastered' then interval '30 days'
        when 'learned' then interval '21 days'
        else interval '14 days'
      end;
  elsif new.status = 'weakened' and (
    new.next_retention_due_at is null or new.next_retention_due_at > now() + interval '1 day'
  ) then
    new.next_retention_due_at := now() + interval '1 day';
  end if;

  return new;
end;
$$;

drop trigger if exists cos_cognitive_skill_state_guard on public.cos_cognitive_skills;
create trigger cos_cognitive_skill_state_guard
before insert or update on public.cos_cognitive_skills
for each row execute function public.cos_enforce_cognitive_skill_state_guard();

comment on function public.cos_enforce_cognitive_skill_state_guard() is
  'Keeps weakened/quarantined cognitive states sticky until their evidence timestamp is explicitly cleared, and ensures strong skills receive a retention due date.';
