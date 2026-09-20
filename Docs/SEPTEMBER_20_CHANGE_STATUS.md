# September 20 change status

## Confirmed decisions

- New hotel billing must issue one A4 tax invoice per delivery, replacing the earlier monthly-invoice requirement.
- Existing invoices and all hotel history must be preserved. Hotel and walk-in records remain separate.
- Printing continues to use the browser's print preview/dialog.
- The public website contact recipient is `pearllaundrysupport@gmail.com`.
- SMTP provider, sending account and credentials are not yet configured. Never commit credentials or real database files.

## Implemented and pushed to Dev

- Shared accessible eye icon for showing/hiding passwords in both login forms.
- Staff shop-day panel hides after today's session is recorded. The Profile menu can show it again for opening/closing information.
- Admin shop-day information is available in a collapsible section across views.
- Hotel billing switch has consistent blue styling and keyboard focus indication.
- Hotel screen uses a single heading. Customer cards flex to fill available rows.
- Portal-specific session cookies and JWT audiences have been added; concurrent sessions and independent logout passed Chrome end-to-end checks. Existing sessions must sign in again.
- Per-delivery invoice schema, API and Save bill / Save & print flow are implemented. Monthly grouping is now only a report filter. Legacy monthly invoices are preserved.
- Migration 0007 fixes the old cash-ledger source-type rule. The user approved backup/rehearsal/application. Two disposable-copy rehearsals, linked-record fixture tests and rollback tests passed before the local shop database was upgraded.
- The operational migration compared every original field in all 132 existing rows across 30 tables. SQLite integrity and foreign-key checks passed; no existing rows changed.
- 75 automated tests across the four repositories, frontend/backend type checks, lint and production builds passed. Restarted office/admin pages returned HTTP 200; unauthenticated API access returned 401.

## Delivery and remaining deployment tasks

- The four repositories now have independent source, lockfiles, environment templates, documentation and CI. The website/catalog/SMTP code is implemented; email sending remains disabled until credentials are configured.
- All four repositories were pushed to Dev. GitHub CI results are recorded in the delivery handoff. The parent now contains only these repositories; legacy files were moved to a private sibling archive.
- Physical-printer output still needs user acceptance testing; browser layout and session checks passed; no test sales were created in the live shop database.

This file records implementation status, not a claim that the requested release is complete.
