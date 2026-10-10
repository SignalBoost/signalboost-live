-- Applied to Frankfurt production Supabase eu-central-1.
create table if not exists public.eu_data_rights_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 tenant_id text not null references public.eu_tenant_assignments(tenant_id),
 request_type text not null check (request_type in ('export','delete')),
 status text not null default 'requested' check (status in ('requested','processing','completed','rejected')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 completion_evidence text,
 constraint eu_rights_completion_evidence check (status <> 'completed' or (completed_at is not null and nullif(completion_evidence,'') is not null))
);
alter table public.eu_data_rights_requests enable row level security;
revoke all on public.eu_data_rights_requests from public,anon,authenticated;
grant select,insert on public.eu_data_rights_requests to authenticated;
drop policy if exists "EU user reads own rights requests" on public.eu_data_rights_requests;
create policy "EU user reads own rights requests" on public.eu_data_rights_requests for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "EU user requests own rights" on public.eu_data_rights_requests;
create policy "EU user requests own rights" on public.eu_data_rights_requests for insert to authenticated with check ((select auth.uid())=user_id and exists (select 1 from public.eu_auth_profiles p where p.user_id=(select auth.uid()) and p.tenant_id=eu_data_rights_requests.tenant_id) and status='requested' and completed_at is null and completion_evidence is null);
create unique index if not exists eu_rights_one_open_request on public.eu_data_rights_requests(user_id,request_type) where status in ('requested','processing');
