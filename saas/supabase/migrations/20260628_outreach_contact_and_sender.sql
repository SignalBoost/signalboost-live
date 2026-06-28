-- saas/supabase/migrations/20260628_outreach_contact_and_sender.sql
-- Make outreach sends real and honest.
--
-- Two columns the outreach pipeline always needed but never had:
--
--   contact_email — the recipient address. Without it, a "send" silently became
--                   a channel='manual' row that emailed no one — the phantom
--                   "sent" 100+. From now on, a draft with no contact_email
--                   simply cannot be sent (no more fake "sent").
--
--   sender_key    — which configured sender identity COS chose to send FROM,
--                   e.g. 'saasSales' or 'saasMarketing'. COS owns this decision
--                   per message (sales pitch -> saasSales, value drop ->
--                   saasMarketing). Resolved against the SENDERS map in
--                   lib/email.ts; defaults to saasSales if unset.
--
-- outreach_queue already has RLS (admin-only); adding columns needs no new policy.

alter table public.outreach_queue
  add column if not exists contact_email text;

alter table public.outreach_queue
  add column if not exists sender_key text;

create index if not exists outreach_queue_contact_email_idx
  on public.outreach_queue(contact_email);
