# Daily shop opening and closing

The whole shop shares one cash session each Riyadh calendar day. This is not a separate shift per employee. Open the day with the physical cash already in the drawer. Finish all staff transactions, count the drawer, then close the day. The closing record shows expected cash, counted cash, and the difference. A previous open day must be closed before opening today's day. A closed day cannot be reopened or silently rewritten.

## Cash rules

- Expected drawer cash = opening cash + retained customer cash + cash supplied by staff + hotel cash payments − cash expenses, including signed payment/expense corrections.
- Card receipts do not enter the cash drawer. Cash given as customer change is excluded. Funding a balance from money already in the drawer is an internal movement and never increases cash.
- A later payment on an old invoice belongs to the currently open day, not the original invoice date. Historical edits permitted by the administrator create a signed adjustment today; they do not rewrite a previous closing.
- Existing invoices and expenses are not retroactively loaded into the new ledger. Count the actual drawer when opening the first day. Do not enter an opening balance that already includes sales you intend to enter afterward.
- Cancelling a cash payment/expense records its reversing cash adjustment; this represents an actual refund/restoration of cash and should only be used when that movement happened.

## Implementation contract

`lib/business-day.ts` owns additive schema initialization for `business_days`, `business_day_ledger`, and `business_day_events`. All amounts are integer halalas. `GET /api/business-day?page=1` returns the current session, today's session (possibly closed), paginated closed records, and allowed opening/closing actions. Staff closing history respects that person's configured sales-read window; administrators can read every closing. `POST` takes either `{action:"open", openingCash:100}` or `{action:"close", id, version, countedCash:150, notes:"..."}`. Authenticated capabilities are `day.view`, `day.open`, and `day.close`.

Financial mutations must call `requireOpenBusinessDay()` and append `businessDayLedgerStatement(...)` to the **same D1 batch** as their source write. Do this even for a zero-cash card payment, because the insertion is the atomic open-session guard. Use `sourceType` = `order`, `expense`, `hotel_payment`, `hotel_delivery`, or `hotel_invoice`; source ID and new source version identify the operation. Hotel delivery/invoice creation uses zero cash; actual hotel collections use the separate payment source. Unique source/version prevents duplicate cash movement. The cash amount is `afterCashMinor − beforeCashMinor`, not the entire new invoice balance. `orderCashMinor` and `expenseCashMinor` implement this calculation. Do not call the ledger insertion in a separate transaction.

For optimistic updates, validate the incoming version before forming the batch, and ensure the source write and ledger share the same next version. Concurrent updates reserve the same unique ledger source/version, so a losing batch rolls back. New source creates use version 1. Hotel payments should use their own immutable payment ID/version rather than the invoice ID when appropriate.

The ledger insert trigger requires a currently open session for today's Riyadh date. Closing uses the day's version; each ledger insertion increments that version. If a transaction arrives while cash is being counted, closing returns HTTP 409 and requires a recount. If closing wins, a competing financial batch aborts entirely. The database rejects ledger updates/deletes and any change to a closed session. Opening/closing audit entries and meaningful administrator notifications are written by database triggers in the same transaction.

The office repository’s `office-portal/src/BusinessDayPanel.tsx` (copied to `shared/operations/BusinessDayPanel.tsx` in the admin repository) is reusable in both portals and supports English/Arabic. Pass `refreshKey` when financial data changes, and optionally `onChange` to reload surrounding data. It refreshes every 30 seconds while visible, has loading/error states, a deliberate closing confirmation, and paginated closing history. A failed closing never silently accepts a new version while the user is counting.

## Verification

`tests/business-day.test.ts` covers integer money, change, card exclusion, staff-versus-drawer cash, correction deltas, expense reversal, and count differences. Database integration checks additionally exercise unique open-day constraints, transaction rollback after close, immutable history, and optimistic closing conflicts.
