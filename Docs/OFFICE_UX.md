# Office portal interaction notes

## Sales screen

- Tap a quantity or rate field in the selected-items list to enter a number; plus/minus buttons still work. Quantities are whole pieces (1–99,999). Rates must be positive (at least SAR 0.01) and are rounded to two decimal places. Invalid input returns to the last valid value when the field loses focus.
- Rates are copied into this invoice request only. Changing a rate never changes a catalog price. The backend must validate the requested override and user permission before creating the order.
- Recent orders starts collapsed. Expand the heading to show cards, then open a card for details, payment updates, or reprinting.
- Save & print saves the order and goes directly to the normal browser print dialog. There is no additional application confirmation or silent-printer integration.

## Detail and print layout

The detail dialog uses up to 1,280 pixels on desktop and the available tablet viewport. Only its body scrolls. The header and action buttons remain accessible, and the item list uses natural block height instead of shrinkable grid rows. Background scrolling is disabled; keyboard focus stays in the dialog and returns when it closes.

The Office app layout is removed from print flow instead of merely hidden, avoiding blank pages caused by off-screen sales content. Thermal receipt printing still requires the user to select the receipt printer and correct paper size in the browser.

## State isolation

The walk-in draft lives in tab-scoped session storage under `laundry-office-draft-v3`. It is bound to the authenticated user ID returned by bootstrap, preserved only for that same user, and cleared on logout, unauthenticated bootstrap, or a user switch. Hotel drafting uses a separate workspace and must never reuse this cart/customer state. Persisted UI drafts are untrusted; server validation remains authoritative.

The office repository’s `tests/office-store.test.ts` checks manual quantities, rate isolation, invalid-number rejection, user switches, and logout cleanup.

## Hotel billing

Switch on Hotel billing and find a hotel by code or name. Its stored address and VAT details fill automatically. Choose the handling staff and delivery date, add services, and save the delivery. Quantity and rate changes affect that delivery only. Changing the selected hotel asks before clearing an unsaved delivery.

Use the month selector and token search to find saved hotel deliveries. Open Details to read them, change an uninvoiced delivery, or cancel it if your account has permission. Cancelled deliveries stay in history. Issued invoices lock their deliveries against later editing.

Choose Save bill or Save & print to issue one A4 invoice for the selected delivery. Further deliveries are allowed in the same month. A saved delivery without an invoice has an Issue invoice recovery action. Invoices have their own list, detailed lines, payment history, and print action. A payment adds to earlier payments; its starting amount is the outstanding balance, and it can be reduced for a partial payment. Card payments require STC or ANB.

Admins can add or edit hotel records from Hotel directory, including deactivating a hotel without deleting its history. Inactive hotels cannot be selected for new deliveries. Hotel records, delivery drafts, invoice totals, and payment lists never use the walk-in cart or customer list.

The hotel draft has its own tab-scoped, user-bound `laundry-hotel-draft-v1` store. Stable request keys protect delivery/payment retries; save success starts a fresh delivery key. Search requests are aborted when hotel, month, page, or user changes, so late responses cannot overwrite the new scope. Frontend hotel VAT totals sum the individually rounded line VAT amounts, matching the backend and delivery invoice.
