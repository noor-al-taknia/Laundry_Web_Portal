# Four-repository split

The parent contains Laundry_Web_Portal (office), Laundry_Web_Admin_Portal (admin), Laundry_Web_Portal_BE (API/database code), and Laundry_Web_App (public website). Each has its own Dev branch, package-lock.json, environment template and CI.

The old monorepo and original attachments are moved into a private sibling archive after verification. Existing Git history of Laundry_Web_App is retained; no force-push is needed. The active database is copied and compared table-by-table into the backend's ignored local state, not included in Git.

See README.md for startup commands and Docs/ARCHITECTURE.md for ownership and trust boundaries. The eight backend service folders remain extraction scaffolds; the runnable platform API currently owns transactional mutations. Independently deploying those modules requires further work, including an outbox/event flow and versioned contracts.
