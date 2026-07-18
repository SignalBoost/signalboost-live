-- Mission 001 coordination security hardening.
-- Keep all coordination mutations behind server-side service-role access.

revoke insert, update, delete, truncate, references, trigger
  on table public.supervisor_instances,
           public.supervisor_work_items,
           public.supervisor_leases,
           public.supervisor_coordination_events
  from anon, authenticated;

revoke execute on function public.supervisor_acquire_lease(text,text,text,integer,timestamptz) from anon, authenticated;
revoke execute on function public.supervisor_assert_fence(text,text,text,text,integer,timestamptz) from anon, authenticated;
revoke execute on function public.supervisor_renew_lease(text,text,text,integer,integer,timestamptz) from anon, authenticated;
revoke execute on function public.supervisor_release_lease(text,text,text,integer,timestamptz,text) from anon, authenticated;
revoke execute on function public.supervisor_transition_work_item(text,text,text,text,text,text,text,integer,timestamptz) from anon, authenticated;
revoke execute on function public.supervisor_reconcile_expired_leases(timestamptz,integer) from anon, authenticated;
revoke execute on function public.supervisor_enqueue_work_item(jsonb) from anon, authenticated;
revoke execute on function public.supervisor_heartbeat_instance(text,text,timestamptz) from anon, authenticated;
revoke execute on function public.supervisor_mark_instance_status(text,text,text) from anon, authenticated;

-- Authenticated operators retain bounded read access through RLS policies only.
grant select on table public.supervisor_instances,
                      public.supervisor_work_items,
                      public.supervisor_leases,
                      public.supervisor_coordination_events
  to authenticated;
