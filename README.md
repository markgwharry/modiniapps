# Modini Apps gateway

This project provides the authentication gateway and app launcher that sits in front of every web application hosted on your VPS. It is responsible for:

- Handling account registration and login for all users.
- Issuing a session cookie that can be shared across the primary domain and any application subdomains.
- Presenting an authenticated dashboard where users can jump into the individual applications that live on separate subdomains.
- Exposing a lightweight API for downstream apps to validate that an incoming request is from an authenticated user.

The repo intentionally contains **all logic related to authentication and multi-app orchestration**, so each downstream application can remain focused on its own domain concerns.

## Features

- Email + password authentication with passwords hashed using `bcrypt` and persisted in SQLite.
- User registration with admin approval workflow and email notifications.
- Password reset flow with secure time-limited tokens sent via email.
- Password change functionality for authenticated users.
- Sessions stored in SQLite and surfaced to subdomains via a shared cookie (`modiniapps.sid` by default).
- Responsive, theme-aware front end for signing in, registering and selecting applications.
- API endpoint (`/api/auth/session`) that downstream apps can call (with credentials) to validate the logged-in user.
- Config-driven list of applications surfaced on the dashboard with redirect helpers (`/apps/:slug`).

## Project structure

```
.
├── public/           # Static assets served by Express
│   └── css/styles.css
├── src/
│   ├── config/       # Environment + application configuration helpers
│   ├── middleware/   # Express middleware (authentication guard)
│   ├── services/     # Authentication service
│   ├── db.js         # SQLite initialisation + queries
│   └── server.js     # Express application entry point
├── views/            # EJS templates rendered on the server
├── .env.example      # Template for runtime configuration
└── README.md
```

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and set a **strong** `SESSION_SECRET`:

   ```bash
   cp .env.example .env
   # edit .env
   ```

3. Start the gateway locally:

   ```bash
   npm run dev
   ```

   The app will listen on [http://localhost:3000](http://localhost:3000) by default. Nodemon reloads the server on file changes.

4. Create a user via the UI (`/register`) and sign in. Once authenticated you will see the dashboard with the configured app links.

## Email notifications

New user registrations are held in a pending state until an administrator approves them. When a registration is submitted the gateway sends two emails: one to the configured administrator inbox requesting approval and another to the registrant confirming that their account is awaiting review. When an administrator approves the account the system generates a temporary password, stores the hash and emails the credentials to the registrant with instructions to change it after signing in.

Configure SMTP credentials in `.env` so these notifications can be delivered:

```
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-smtp-username
MAIL_PASSWORD=your-smtp-password
MAIL_FROM="Modini Apps <no-reply@example.com>"
MAIL_ADMIN_RECIPIENTS=approvals@example.com
PUBLIC_BASE_URL=https://apps.example.com
```

`MAIL_ADMIN_RECIPIENTS` accepts a comma-separated list of addresses. `PUBLIC_BASE_URL` is optional but recommended so links in the emails point back to the correct environment.

## Password reset

Users can reset their password via the "Forgot your password?" link on the login page. The password reset flow works as follows:

1. User enters their email address on the `/forgot-password` page
2. If an approved account exists with that email, the system generates a secure reset token and sends an email with a reset link
3. The reset link is valid for 1 hour and contains a unique token
4. User clicks the link and is taken to `/reset-password?token=...` where they can set a new password
5. After successfully resetting, the user can log in with their new password

Security features:
- Reset tokens are stored securely in the database with expiration timestamps
- Tokens can only be used once - they are marked as used after a successful reset
- The system does not reveal whether an email address exists in the database (to prevent email enumeration)
- Requesting a new reset invalidates any previous unused tokens for that user
- Password reset is only available for approved users (and admins)

## Configuring apps

The launcher reads from [`src/config/apps.json`](src/config/apps.json). Each entry must define a `slug`, `name`, `description` and the absolute `url` of the downstream app. Editing this file changes what appears on the dashboard and which destinations the `/apps/:slug` redirector targets.

Example entry:

```json
{
  "slug": "analytics",
  "name": "Analytics Dashboard",
  "description": "Business intelligence dashboards and reporting.",
  "url": "https://analytics.example.com"
}
```

## Sharing sessions with subdomains

When deployed in production you should configure the cookie domain so that all subdomains on the VPS receive the same session cookie. Set `COOKIE_DOMAIN=.yourdomain.com` in `.env` before starting the server. With that in place:

- Users who log in through `https://yourdomain.com` will receive the `modiniapps.sid` cookie scoped to `.yourdomain.com`.
- Downstream applications can use `fetch('https://yourdomain.com/api/auth/session', { credentials: 'include' })` to validate the session on every request or during their own middleware.
- The `/api/auth/session` endpoint returns `401` when the session is missing/invalid and `200` with `{ authenticated: true, user }` when valid.

If you need to call the session endpoint via XHR from subdomains, set `CORS_ALLOW_ORIGINS` in the environment file to a comma-separated list of allowed origins, for example:

```
CORS_ALLOW_ORIGINS=https://analytics.yourdomain.com,https://crm.yourdomain.com
```

## Protecting downstream apps

Each separate application should use middleware that:

1. Checks for the presence of the shared session cookie.
2. Calls `https://yourdomain.com/api/auth/session` (with `credentials: 'include'`) to confirm the user is authenticated.
3. Redirects unauthenticated requests back to `https://yourdomain.com/login?redirect=<encoded-original-url>` so the user can log in and then return.

Because the authentication logic and session storage live exclusively in this repository, downstream apps remain stateless with respect to authentication and simply delegate to the gateway.

## Deployment notes

- Run the server behind a reverse proxy (e.g. Nginx or Caddy) that terminates TLS. Set `COOKIE_SECURE=true` so cookies are only sent over HTTPS.
- Configure the proxy to redirect all unauthenticated traffic from subdomains back to the main domain if desired, or rely on application-level checks calling the session endpoint.
- Back up the SQLite database located at `data/modiniapps.sqlite` as it contains user credentials (password hashes).

## Scripts

| Command       | Description                         |
| ------------- | ----------------------------------- |
| `npm start`   | Starts the server without reload.   |
| `npm run dev` | Starts the server with nodemon.     |
| `npm run lint`| Placeholder lint command.           |

## License

ISC
