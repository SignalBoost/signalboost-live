// Pure commercial wallet audit. No payment processing or database writes.
// Purchased grants and reservations must not be mixed with BYOI provider charges.
const positive = (v) => Number.isSafeInteger(v) && v > 0
export function inspectCommercialLot(lot, entries) {
 if (!lot || typeof lot.lotId !== 'string' || typeof lot.organizationId !== 'string'
   || !positive(lot.grantedCredits) || !Array.isArray(entries)) throw Error('wallet_lot_invalid')
 let reserved = 0, captured = 0, released = 0, reversed = 0
 const keys = new Set()
 for (const e of entries) {
  if (e.lotId !== lot.lotId || e.organizationId !== lot.organizationId ||
     typeof e.eventKey !== 'string' || keys.has(e.eventKey) || !positive(e.amountCredits))
    throw Error('wallet_journal_integrity_failed')
  keys.add(e.eventKey)
  switch (e.operation) {
   case 'grant':
    if (e.amountCredits !== lot.grantedCredits || captured + reserved + released + reversed !== 0
      || [...keys].length !== 1) throw Error('wallet_grant_invalid')
    break
   case 'reserve': reserved += e.amountCredits; break
   case 'capture': captured += e.amountCredits; break
   case 'release': released += e.amountCredits; break
   case 'refund': case 'chargeback': reversed += e.amountCredits; break
   default: throw Error('wallet_operation_unknown')
  }
  if (![reserved,captured,released,reversed].every(Number.isSafeInteger))
   throw Error('wallet_amount_overflow')
 }
 if (entries.filter(x=>x.operation==='grant').length !== 1 ||
   released + captured > reserved || reserved + reversed - released > lot.grantedCredits)
   throw Error('wallet_inconsistent_balance')
 return Object.freeze({
  availableCredits: lot.grantedCredits - reserved + released - reversed,
  heldCredits: reserved - captured - released,
  consumedCredits: captured,
  reversedCredits: reversed
 })
}
