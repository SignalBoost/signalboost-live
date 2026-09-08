-- A formal University cohort has a fixed academic calendar once enrolled.
-- Later study requires a new explicit program_key; existing enrollment dates cannot be extended.

revoke all on table public.cos_university_program_enrollments from anon, authenticated, service_role;
grant select, insert on table public.cos_university_program_enrollments to service_role;

create or replace function public.cos_university_program_enrollments_immutable_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'cos_university_program_enrollments are immutable; create a new explicit program enrollment';
end;
$$;

revoke all on function public.cos_university_program_enrollments_immutable_guard() from public;

drop trigger if exists cos_university_program_enrollments_immutable on public.cos_university_program_enrollments;
create trigger cos_university_program_enrollments_immutable
before update or delete on public.cos_university_program_enrollments
for each row execute function public.cos_university_program_enrollments_immutable_guard();

comment on table public.cos_university_program_enrollments is
  'Immutable time-bounded University enrollment calendar. A later degree, repeat, bridge, or certificate requires a new explicit program_key.';
