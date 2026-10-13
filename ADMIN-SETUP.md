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

The server creates the customer, `orders`, `comments`, worker-management, attendance, advances, and session tables when it starts. Open `http://localhost:3000` for the site and `http://localhost:3000/admin` for administration. PostgreSQL data remains in the `mswood-data` volume when containers restart. To stop the app without deleting data, run `docker compose down`; do not remove the volume if you need to keep customer, order, and worker records.

## Local setup without Docker

Create a PostgreSQL database named `mswood`, set `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in `.env`, then run `npm install` and `npm start`. Use a unique admin password with at least 14 characters and a random session secret with at least 32 characters. Sign in at `http://localhost:3000/admin` with the configured admin email and password.

## Production deployment

### Vercel

The site's static assets live in `public/`, and Vercel detects `server.js` as the Express app and routes application and API requests through it. The `/admin` rewrite serves `public/admin.html`. Connect the GitHub repository to Vercel, set the project Root Directory to this project, and keep the Express framework detection with Build Command and Output Directory at their defaults; remove old static-only build or output-directory overrides.

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

Customer accounts are separate from administrator access. Customers can register from **Customer sign in** with their name, email, phone, and a password of at least 10 characters, or log in to see orders submitted while signed in. Guest orders remain available, but older guest orders are not automatically assigned to an account. Email verification is not configured.

To manage the website, open `/admin` on the deployed site (or `http://localhost:3000/admin` locally) and sign in with the server's `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Customer credentials do not grant administrator access.

The **Customer accounts** dashboard tab lists registered customers' contact details and registration dates. Passwords are hashed and are never displayed in the dashboard.

- In **Orders**, search by name or phone and change each order's status after following up with the customer.
- In **Photo comments**, review pending comments and approve or reject them. Only approved comments are public.
- In **Workers**, create work categories and workers with fixed monthly salaries. Worker records can be edited or archived; archiving preserves their attendance and advance history.
- Record daily attendance and check-in/check-out times. Existing daily records can be updated later to add a check-out time.
- Record advances with their issue date. The monthly payroll deducts advances in the same month from fixed salary; attendance is tracked but does not automatically reduce pay.
- Use **Log out** when finished. Admin sessions expire after eight hours.

The admin APIs require the PostgreSQL and secret environment variables above; a successful static-site build alone does not configure them.

GitHub Pages can publish the admin HTML interface, but it cannot run the Express API or PostgreSQL-backed login. Use the Vercel deployment on the same origin as the dashboard to sign in and manage orders/comments.