-- Server-only EU account provisioning. This function is invoked with the EU service role
-- AFTER a user has been created by the EU Auth project. Never invoke from a browser.
create or replace function public.provision_eu_account(
  p_user_id uuid, p_country_code text, p_display_name text default null
) returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_country text := upper(trim(p_country_code));
  v_tenant text := 'eu-' || p_user_id::text;
begin
  if p_user_id is null or v_country not in (
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU',
    'IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES',
    'SE','IS','LI','NO'
  ) then
    raise exception 'invalid_eu_enrollment';
  end if;
  -- No caller-selected tenant identifier or regional downgrade.
  insert into public.eu_tenant_assignments (tenant_id,country_code,residency_profile,region)
    values (v_tenant,v_country,'EU_EEA','eu-central-1')
    on conflict (tenant_id) do nothing;
  if not exists (
    select 1 from public.eu_tenant_assignments
    where tenant_id=v_tenant and country_code=v_country
      and residency_profile='EU_EEA' and region='eu-central-1'
  ) then raise exception 'eu_tenant_assignment_mismatch'; end if;
  insert into public.eu_auth_profiles (user_id,tenant_id)
    values (p_user_id,v_tenant) on conflict (user_id) do nothing;
  if not exists (
    select 1 from public.eu_auth_profiles
    where user_id=p_user_id and tenant_id=v_tenant
  ) then raise exception 'eu_profile_binding_mismatch'; end if;
  insert into public.profiles (id,user_id,display_name,onboarded,onboarding_completed)
    values (p_user_id,p_user_id,nullif(left(trim(coalesce(p_display_name,'')),160),''),false,false)
    on conflict (id) do nothing;
end $$;
revoke all on function public.provision_eu_account(uuid,text,text) from public, anon, authenticated;
grant execute on function public.provision_eu_account(uuid,text,text) to service_role;
