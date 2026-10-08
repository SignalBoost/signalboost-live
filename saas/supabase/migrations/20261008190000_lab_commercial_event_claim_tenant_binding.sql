-- Bind immutable event claims to lots owned by the same Lab organization.
-- Complements the journal composite FK; no payment authority is exposed.
alter table lab.commercial_credit_event_claims
 add constraint commercial_event_claim_lot_organization_fk
 foreign key (lot_id, organization_id)
 references lab.commercial_credit_lots(lot_id, organization_id)
 deferrable initially deferred;
