create or replace function add_credits(uid uuid, amount integer)
returns void
language plpgsql
security definer
as $$
begin
  update credits
  set amount = credits.amount + amount,
      updated_at = now()
  where user_id = uid;
end;
$$;

grant execute on function add_credits(uuid, integer) to authenticated;
