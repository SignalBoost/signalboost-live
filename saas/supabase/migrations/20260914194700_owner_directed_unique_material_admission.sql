-- Future owner-directed study may reinforce an existing lesson, but it must not multiply durable
-- knowledge rows merely because the same retained material arrives under another source URI.
-- Existing application code already interprets SQLSTATE 23505 as a duplicate, so fail with that
-- code before INSERT and keep all existing University/reference bookkeeping consistent.

create index if not exists cos_continuous_learning_owner_material_lookup_idx
on public.cos_continuous_learning (
  lower(btrim(regexp_replace(coalesce(subject,''), '[[:space:]]+', ' ', 'g'))),
  md5(lower(btrim(regexp_replace(coalesce(summary,''), '[[:space:]]+', ' ', 'g'))))
)
where evidence @> '["owner_directed_study"]'::jsonb;

create or replace function public.reject_duplicate_owner_directed_material()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text;
  v_summary text;
begin
  if not (coalesce(new.evidence, '[]'::jsonb) @> '["owner_directed_study"]'::jsonb) then
    return new;
  end if;

  v_subject := pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(new.subject,''), '[[:space:]]+', ' ', 'g')));
  v_summary := pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(new.summary,''), '[[:space:]]+', ' ', 'g')));

  if pg_catalog.length(v_subject) = 0 or pg_catalog.length(v_summary) < 200 then
    return new;
  end if;

  if exists (
    select 1
    from public.cos_continuous_learning existing
    where coalesce(existing.evidence, '[]'::jsonb) @> '["owner_directed_study"]'::jsonb
      and pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(existing.subject,''), '[[:space:]]+', ' ', 'g'))) = v_subject
      and pg_catalog.md5(pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(existing.summary,''), '[[:space:]]+', ' ', 'g')))) = pg_catalog.md5(v_summary)
      and pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(existing.summary,''), '[[:space:]]+', ' ', 'g'))) = v_summary
      and existing.content_hash <> new.content_hash
  ) then
    raise exception using
      errcode = '23505',
      message = 'duplicate owner-directed retained material';
  end if;

  return new;
end;
$$;

revoke all on function public.reject_duplicate_owner_directed_material() from public, anon, authenticated;
grant execute on function public.reject_duplicate_owner_directed_material() to service_role;

drop trigger if exists reject_duplicate_owner_directed_material on public.cos_continuous_learning;
create trigger reject_duplicate_owner_directed_material
before insert on public.cos_continuous_learning
for each row execute function public.reject_duplicate_owner_directed_material();
