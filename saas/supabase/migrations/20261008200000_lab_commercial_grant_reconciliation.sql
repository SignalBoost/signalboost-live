-- Read-only financial integrity evidence; NOT a Stripe settlement or certification.
-- Keep this view private: owner/reviewer queries must use a privileged database session.
create view lab.commercial_grant_reconciliation as
select l.organization_id, l.lot_id, l.source_system, l.source_reference,
       l.granted_credits,
       count(j.journal_id) filter (where j.operation='grant') as grant_journal_count,
       coalesce(sum(j.amount_credits) filter (where j.operation='grant'),0) as journal_granted_credits,
       count(c.source_reference) as matching_claim_count,
       (
         count(j.journal_id) filter (where j.operation='grant')=1
         and coalesce(sum(j.amount_credits) filter (where j.operation='grant'),0)=l.granted_credits
         and count(c.source_reference)=1
       ) as reconciled
from lab.commercial_credit_lots l
left join lab.commercial_credit_journal j
 on j.lot_id=l.lot_id and j.organization_id=l.organization_id
left join lab.commercial_credit_event_claims c
 on c.lot_id=l.lot_id and c.organization_id=l.organization_id
 and c.source_system=l.source_system and c.source_reference=l.source_reference
group by l.organization_id,l.lot_id,l.source_system,l.source_reference,l.granted_credits;
revoke all on lab.commercial_grant_reconciliation from public,anon,authenticated,service_role;
