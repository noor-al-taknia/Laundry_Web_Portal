# Staff permissions and history windows

## Owner workflow

Open **Admin → Team and permissions → Individual staff permissions**. Choose one staff member, switch the allowed operations on or off, set the history days, then press **Save permissions**. Changes affect only the selected account. A successful save takes effect on that staff member's next server request; signing out is not required.

The permission groups are walk-in sales, expenses, hotel deliveries/per-delivery invoices, and the shop business day. Viewing, creating, updating, cancelling, printing and issuing per-delivery invoices are separate operations. User management, shop settings, catalogue master prices and permission administration remain owner-only: granting a staff operation never promotes a staff user to admin.

The default history is **3 days to view and 1 day to edit**. One day means today in Saudi Arabia. Seven days means today plus the preceding six calendar days. The sales history also controls hotel delivery history. Expense history is separate. Edit history cannot exceed view history. The maximum configurable window is 365 days. Walk-in work beyond the window uses a dated permission grant or a specific task approval. Hotel records never reuse a walk-in order approval: the owner must extend the user's sales history window for historical hotel delivery edits. Monthly invoice issuance is controlled separately by the hotel invoicing permission.

An approval for an older record extends the date limit only. It cannot override an operation which the owner has switched off. All grants are account-scoped. Disabling access does not delete records. Discard changes resets unsaved edits; switching staff discards that staff editor's unsaved draft. If another admin changes the same policy before a save, reload it rather than overwriting their changes.

## Storage and authorization

- `staff_access_policies`: one row per staff user (foreign key to `users`), allow-listed capabilities JSON, independent sales/expense read/write calendar windows, optimistic version, modifying admin, timestamp.
- `staff_access_audit`: append-only policy snapshots keyed by `(staff_user_id, policy_version)`, linked to the modifying admin.
- Schema installation: call `ensureStaffAccessSchema()` during database initialization after the `users` table exists.
- `GET /api/staff-access`: staff may read only their own policy. Admin can add `?userId=N` to read another account.
- `PATCH /api/staff-access`: admin-only, same-origin, body `{userId, policy}`. Requires a full known-key policy with boolean values and its current version. Initial version is zero; saved versions start at one. A D1 atomic batch compares and swaps the policy and records its audit snapshot. Stale edits receive HTTP 409. Client-provided role values are never accepted.
- `getStaffAccessPolicy(user)`: reads current database state on every call, not cached JWT claims. Admin routes retain their existing role gate.
- `requireStaffCapability(user, operation)`: returns a `403 CAPABILITY_DENIED` error when disabled. This must guard the operation server-side; hiding a button is not authorization.
- `canReadRange(user, from, to, area)`: checks view capability and the configured window, then existing dated grants/task approvals. Area defaults to `sales`; `expenses` uses its separate window; `hotels` requires hotel viewing.
- `canWriteOrderDate(user, date, id, operation)`: checks `sales.update` by default, or explicitly `sales.cancel`, `hotels.update`, `hotels.cancel`; then history or a scoped approval.
- `canWriteExpense(user, date, id, operation)`: similarly checks `expenses.update` or `expenses.delete`.
- Expiry checks use SQLite `datetime(expires_at)` so ISO timestamps with timezone offsets are compared correctly to UTC database time.

`staff-capability-policy.ts` is runtime-independent and contains allow-list validation and inclusive calendar calculations. `tests/staff-permissions.test.ts` covers invalid/unknown permission payloads, independent policies, inclusive windows and month boundaries, disabled-operation precedence, scoped approvals, expiry normalization and admin bypass.

`tests/staff-access-route.test.ts` verifies actual route handlers reject cross-user reads, staff self-escalation, cross-origin changes, owner-target policies and optimistic conflicts. `tests/module-schema.test.ts` applies every migration to an isolated in-memory SQLite database containing legacy users and cash/card orders, verifies their roles and amounts survive, and checks that all runtime integrity triggers are also in migration `0006_hotel_business_day_permissions.sql`. The typed Drizzle schema mirrors the new module tables. Three older migration copy statements were corrected because they referenced columns that did not exist until their replacement table was created; these corrections do not modify any already-running database.

## Integration requirements

The orders and expenses routes enforce operation permissions before mutations. `GET /api/orders?purpose=print` additionally requires `sales.print`; `purpose=export` requires `sales.export`. Report downloads make that guarded export request before formatting the downloaded records. Bootstrap excludes protected sales aggregates and recent orders when sales viewing is disabled; the customer directory is also excluded unless the user can view or create sales. Cancelled orders are excluded from today's totals. Staff listing default start dates derive from the selected user's read window.

Read access is not print/export access. The browser cannot prevent a user who already viewed content from using browser-level screenshots or print; the application gates its own print/export action and endpoints. New module routes must apply the same capability helpers before reads and mutations. Expired task approvals no longer block a staff member from submitting a fresh request.
