# MS Woodworks Admin Setup

The website stores contact requests and customer comments in PostgreSQL. The admin page is served at `/admin`; opening `index.html` directly as a `file://` URL will not connect to the API.

## Requirements

- Docker Desktop with Docker Compose, or Node.js 24 and PostgreSQL
- A unique admin email and password

## Quick start with Docker on Windows

1. Copy `.env.example` to `.env`.
2. Set `POSTGRES_PASSWORD` to a unique, long alphanumeric value, `ADMIN_EMAIL` to the admin email, `ADMIN_PASSWORD` to a unique password of at least 14 characters, and `SESSION_SECRET` to a random value of at least 32 characters. Keep `.env` private.
3. Start the application and database:

```powershell
docker compose up --build -d
docker compose logs -f app
```

The server creates the `orders`, `comments`, worker-management, attendance, advances, and session tables when it starts. Open `http://localhost:3000` for the site and `http://localhost:3000/admin` for administration. PostgreSQL data remains in the `mswood-data` volume when containers restart. To stop the app without deleting data, run `docker compose down`; do not remove the volume if you need to keep orders and worker records.

## Local setup without Docker

Create a PostgreSQL database named `mswood`, set `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in `.env`, then run `npm install` and `npm start`. Use a unique admin password with at least 14 characters and a random session secret with at least 32 characters. Sign in at `http://localhost:3000/admin` with the configured admin email and password.

## Production deployment

### Vercel

The site's HTML, CSS, JavaScript, and images live in `public/` and are served as static assets. The `/admin` rewrite serves `public/admin.html`; `api/[...path].js` sends `/api/*` requests to the Express app. Connect the GitHub repository to Vercel and set the project Root Directory to this project. Use the Other framework preset or automatic detection, and leave Build Command and Output Directory at their defaults; remove old static-only build or output-directory overrides.

Add these environment variables in **Vercel Project → Settings → Environment Variables** for every environment you deploy:

- `DATABASE_URL`: connection string for a managed PostgreSQL database. Prefer the provider's pooled connection string for serverless workloads.
- `ADMIN_EMAIL`: administrator sign-in email.
- `ADMIN_PASSWORD`: unique password of at least 14 characters.
- `SESSION_SECRET`: randomly generated secret of at least 32 characters.
- `PGSSL=true` only when required by the database provider.

Redeploy after adding or changing environment variables. The build can succeed without these runtime settings, but API requests and admin sign-in will not work until they are configured. Back up the PostgreSQL database regularly.

### Other Node.js hosts

Deploy the app to a Node.js 24 host and provide the same environment variables through that host's secret manager. Use HTTPS, a managed PostgreSQL database, and `PGSSL=true` when the database provider requires TLS. Never commit `.env` or expose database credentials in browser code. Back up the PostgreSQL database regularly.

Customer comments are private until an administrator approves them. The dashboard can update request status and approve or reject comments. Public comments are limited to the selected gallery photo.

## Using the admin dashboard

Open `/admin` on the deployed site, or `http://localhost:3000/admin` locally, then sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. There is no default password or separate account-creation step.

- In **Orders**, search by name or phone and change each order's status after following up with the customer.
- In **Photo comments**, review pending comments and approve or reject them. Only approved comments are public.
- In **Workers**, create work categories and workers with fixed monthly salaries. Worker records can be edited or archived; archiving preserves their attendance and advance history.
- Record daily attendance and check-in/check-out times. Existing daily records can be updated later to add a check-out time.
- Record advances with their issue date. The monthly payroll deducts advances in the same month from fixed salary; attendance is tracked but does not automatically reduce pay.
- Use **Log out** when finished. Admin sessions expire after eight hours.

The admin APIs require the PostgreSQL and secret environment variables above; a successful static-site build alone does not configure them.

GitHub Pages can publish the admin HTML interface, but it cannot run the Express API or PostgreSQL-backed login. Use the Vercel deployment on the same origin as the dashboard to sign in and manage orders/comments.