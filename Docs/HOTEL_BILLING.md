# Hotel billing implementation

## One invoice per delivery

Each new hotel delivery has its own A4 tax invoice. The month is only a reporting filter, not an invoicing group. Older monthly invoices remain unchanged and keep their original links, snapshots and payments.

Hotel customers, deliveries, invoice lines, payments and audit history use separate hotel_* tables. They never insert walk-in customers or orders. The service catalog and staff identities are shared references; a bill-specific rate never changes the catalog price.

## Save and print

Staff select a hotel by code/name, select the responsible staff member, and enter service quantities and rates. Save bill first creates an idempotent delivery, then issues its invoice. Save & print also opens the native browser print dialog after the A4 receipt and QR are ready.

These are two recoverable API operations, not one combined transaction. If issuance fails after the delivery is saved, the saved delivery remains in the list with an Issue invoice action. The cart is cleared after confirmed delivery save, and the success notice identifies the saved token. Do not re-enter the same delivery. Retry issuance from the saved record instead. A retry for an already-invoiced delivery returns its existing invoice, including any legacy monthly invoice.

POST /api/hotel-invoices accepts {deliveryId}. The server checks invoicing capability, read/write date windows, active hotel/delivery, shop details, and an open business day. Month-wide issuance is no longer accepted. A database unique constraint on delivery_id and an optimistic version guard prevent duplicate invoices. Legacy invoice delivery_id is NULL; a trigger requires every new invoice to match a single active uninvoiced delivery.

## Integrity and payment records

Issuance atomically snapshots the hotel/shop, copies service lines, links the delivery, records a zero-cash daily-session entry, records an audit event and notifies the admin. Issued invoice content and linked deliveries are immutable. More deliveries can be recorded for the same hotel/month.

Payments append separate records and update only paid amount/version. Cash enters today's cash ledger; card payments require STC or ANB and post zero cash. Repeated payment request keys do not double-collect. If closing wins a race against a write, the whole source/payment batch rolls back. Old invoice snapshots do not change when hotel details are edited.

Quantities are positive integers; rates have at most two decimals. Monetary values are stored as integer halalas, with VAT rounded per line. Totals reject unsafe, inconsistent or excessive amounts. The technical maximum is SAR 1,000,000,000.

## Migration 0007

The old database rejected hotel_delivery and hotel_invoice ledger source types. Migration 0007 expands that check and replaces the one-invoice-per-hotel/month constraint with one invoice per delivery. Existing rows and links are copied unchanged. No automatic table-rebuild migration runs on login; an old hotel schema returns a clear upgrade-required response.

1. Stop every writer and take a SQLite-consistent backup outside Git.
2. Run scripts/migrate-hotel-invoices.mjs BACKUP_COPY --apply on a disposable copy.
3. Run the same script against the intended database without --apply for a rollback rehearsal.
4. Only after validation, run it against the intended database with --apply.
5. Restart the application and verify read access and printing. Never replace one deployment's database with another environment's stale database.

The maintenance script uses one transaction, compares hashes of every original column in every existing table, checks SQLite integrity and foreign keys, and rolls back on failure. SQL also checks foreign-key validity before ending deferral. This follows the D1 deferred-constraint mechanism described in [Cloudflare's SQL documentation](https://developers.cloudflare.com/d1/sql-api/sql-statements/). Backups contain private customer data and must not be committed or made public.

## Tests

hotel-migration.test.ts covers linked legacy invoices, payments, ledger/audit preservation, repeat-run safety and rollback on injected failure. hotel-billing.test.ts covers per-delivery totals, further deliveries in a billed month, concurrent issuance, immutable snapshots, payment deduplication, card accounts, day-close races and overflow. module-schema.test.ts checks the full migration chain and runtime trigger parity.
