# Pearl Laundry — Office portal

Staff sales, customer lookup, service buttons, bill-only quantities/rates, cash/card (STC/ANB), collections, expenses, hotel invoices, daily opening/closing and browser printing. English and Arabic/RTL. The admin portal is a separate app, not a route in this repository.

The same-origin API proxy targets BACKEND_URL and fixes the JWT audience to office. HttpOnly cookies never enter browser storage. Zustand/sessionStorage hold only user-bound form drafts. All permissions are enforced by the backend.

Existing staff accounts are preserved in the migrated local database. A fresh backend creates only the configured owner account; the owner creates staff accounts in the admin portal.

## Local setup

Use Node.js 24 LTS and npm. Each repository installs and runs independently.

```sh
cd Laundry_Web_Portal
npm ci
npm run setup
npm run dev
```

Start the backend first, then the portals and website in separate terminals. BACKEND_URL is server-only and should point to the backend, normally http://127.0.0.1:4000.

| Folder | Purpose | Local URL |
|---|---|---|
| Laundry_Web_Portal | Staff / office billing | http://localhost:3000 |
| Laundry_Web_Admin_Portal | Owner administration | http://localhost:3001 |
| Laundry_Web_Portal_BE | API and database | http://localhost:4000 |
| Laundry_Web_App | Public shop website | http://localhost:3002 |


## Checks

```sh
npm run ci
```

GitHub Actions runs locked installation, type checking, lint, automated tests and a production build on Dev/main pushes and pull requests. A successful local build is not a deployment.

## Same Wi-Fi

Development servers bind to 0.0.0.0. On the other device use http://YOUR_MAC_LAN_IP:3000 (office), :3001 (admin), or :3002 (website), never that device's localhost. Allow these ports through the Mac firewall only on a trusted network. The backend URL stays server-side; browsers use their portal's proxy. Set NEXT_PUBLIC_OFFICE_URL and NEXT_PUBLIC_ADMIN_URL to the LAN URLs if using cross-portal links, then restart/rebuild. Use HTTPS for real deployments.

## Documentation and security

See Docs/ARCHITECTURE.md and Docs/PORTAL_QUICK_GUIDE.md. Keep .env.local, .dev.vars, .wrangler, backups and identity/customer data out of Git. Templates contain placeholders only. Rotate secrets and configure backups before production.
