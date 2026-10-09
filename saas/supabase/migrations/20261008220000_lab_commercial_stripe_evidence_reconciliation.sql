-- Private detection-only audit for Stripe evidence against closed-default wallet records.
-- This view does not establish payment authenticity or authorize wallet writes.
create view lab.commercial_stripe_evidence_reconciliation as
select e.evidence_id, e.organization_id, e.lot_id, e.stripe_event_id,
       e.stripe_payment_intent_id,
       l.source_system = 'stripe' as stripe_origin_lot,
       l.source_reference = e.stripe_payment_intent_id as payment_intent_matches_lot,
       exists (
         select 1 from lab.commercial_credit_event_claims c
         where c.organization_id=e.organization_id
           and c.lot_id=e.lot_id
           and c.source_system='stripe'
           and c.source_reference=e.stripe_event_id
       ) as event_claim_matches_lot,
       coalesce(g.reconciled,false) as grant_journal_reconciled,
       (l.source_system='stripe'
        and l.source_reference=e.stripe_payment_intent_id
        and exists (
          select 1 from lab.commercial_credit_event_claims c
          where c.organization_id=e.organization_id
            and c.lot_id=e.lot_id
            and c.source_system='stripe'
            and c.source_reference=e.stripe_event_id
        )
        and coalesce(g.reconciled,false)) as internally_consistent
from lab.commercial_stripe_settlement_evidence e
join lab.commercial_credit_lots l
 on l.lot_id=e.lot_id and l.organization_id=e.organization_id
left join lab.commercial_grant_reconciliation g
 on g.lot_id=e.lot_id and g.organization_id=e.organization_id;
revoke all on lab.commercial_stripe_evidence_reconciliation from public,anon,authenticated,service_role;
