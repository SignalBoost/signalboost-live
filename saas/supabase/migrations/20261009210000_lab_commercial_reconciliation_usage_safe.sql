-- Reconcile one payment claim independently of subsequent wallet journal activity.
-- A joined claim must not multiply with reserve/capture/release journal rows.
-- Event IDs and payment-intent IDs are distinct Stripe identifiers.
-- For Stripe, match one tenant-bound claim per lot; the Stripe evidence audit
-- independently matches that claim's event ID and the lot's payment intent.
create or replace view lab.commercial_grant_reconciliation as
select l.organization_id, l.lot_id, l.source_system, l.source_reference,
       l.granted_credits,
       count(j.journal_id) filter (where j.operation='grant') as grant_journal_count,
       coalesce(sum(j.amount_credits) filter (where j.operation='grant'),0) as journal_granted_credits,
       count(distinct c.source_reference) as matching_claim_count,
       (
         count(j.journal_id) filter (where j.operation='grant')=1
         and coalesce(sum(j.amount_credits) filter (where j.operation='grant'),0)=l.granted_credits
         and count(distinct c.source_reference)=1
       ) as reconciled
from lab.commercial_credit_lots l
left join lab.commercial_credit_journal j
 on j.lot_id=l.lot_id and j.organization_id=l.organization_id
left join lab.commercial_credit_event_claims c
 on c.lot_id=l.lot_id and c.organization_id=l.organization_id
 and c.source_system=l.source_system
 and (l.source_system='stripe' or c.source_reference=l.source_reference)
group by l.organization_id,l.lot_id,l.source_system,l.source_reference,l.granted_credits;
revoke all on lab.commercial_grant_reconciliation from public,anon,authenticated,service_role;
