-- saas/supabase/migrations/20260731_outreach_product_key.sql
--
-- SCOPE DUPLICATE PROTECTION TO THE PRODUCT, NOT THE ADDRESS.
--
-- The address-level guard added earlier was too blunt. It refused any second email to an
-- address that had ever been contacted, which stops the real mistake — pitching the same
-- product to the same company twice — but also stops a legitimate one: pitching a
-- DIFFERENT product to a company already contacted about something else. A prospect list
-- is an asset that gets used across several products over time, and permanently burning
-- an address after one campaign is the wrong trade.
--
-- product_key is the thing being sold, slugged. Two rows for the same address are a
-- duplicate only when their product_key matches.
--
-- Null is deliberate and meaningful: rows created before this column existed, and rows
-- created by callers that do not name a product, keep the old strict behaviour among
-- themselves. That is the safe direction — an unlabelled row can still be sent manually
-- with the existing override, but it will never silently re-contact someone.
--
-- Safe to run twice.

alter table public.outreach_queue
  add column if not exists product_key text;

-- The duplicate guard looks up prior sends by address and product together.
create index if not exists outreach_queue_contact_product_idx
  on public.outreach_queue (contact_email, product_key);

comment on column public.outreach_queue.product_key is
  'Slug of the product or offer this outreach is about. Duplicate protection is scoped to this: the same address may be contacted again for a different product_key, never for the same one.';
