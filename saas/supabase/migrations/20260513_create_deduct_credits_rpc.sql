create or replace function deduct_credits(uid uuid, used integer)
returns void
language plpgsql
security definer
as $$
begin
  update credits
  set amount = amount - used,
      updated_at = now()
  where user_id = uid
    and amount >= used;
end;
$$;

grant execute on function deduct_credits(uuid, integer) to authenticated;
