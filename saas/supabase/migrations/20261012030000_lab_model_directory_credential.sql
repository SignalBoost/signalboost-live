-- Customer-authorized read of ONE own credential for read-only model discovery.
-- No direct table grants and no service-role access. Server decrypts only in signed-in customer request.
create or replace function public.itmounts_lab_customer_open_model_directory_credential(
  p_organization_id uuid, p_credential_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
declare c lab.provider_credentials%rowtype;
begin
  if coalesce(lab.customer_member_role(uid, p_organization_id), '') not in ('owner','admin') then
    raise exception 'lab_customer_credential_forbidden';
  end if;
  select * into c from lab.provider_credentials
    where id = p_credential_id and organization_id = p_organization_id and revoked_at is null;
  if not found then raise exception 'lab_credential_unavailable'; end if;
  return jsonb_build_object('id', c.id, 'providerKind', c.provider_kind,
    'ciphertext', c.ciphertext, 'iv', c.iv, 'tag', c.tag);
end $$;
revoke all on function public.itmounts_lab_customer_open_model_directory_credential(uuid,uuid) from public, anon, service_role;
grant execute on function public.itmounts_lab_customer_open_model_directory_credential(uuid,uuid) to authenticated;
