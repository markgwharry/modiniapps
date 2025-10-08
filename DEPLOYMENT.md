# Modini Apps Authentication Gateway - Deployment Notes

This document describes how the authentication gateway is deployed on the Modini Apps VPS.

## Purpose

The auth gateway serves as:
1. **Single Sign-On (SSO)** for all Modini Apps subdomains
2. **User registration and login** with secure password hashing
3. **Admin panel** for user approval and management
4. **Forward Auth provider** for Traefik to protect downstream apps
5. **App launcher dashboard** with links to all available applications

## Architecture

- **Framework:** Express 5 (Node.js)
- **Session Store:** SQLite via connect-sqlite3
- **User Database:** SQLite
- **Password Hashing:** bcrypt (cost: 12)
- **Reverse Proxy:** Traefik with Let's Encrypt
- **Port:** 3000

## Domains

- https://modiniapps.co.uk
- https://www.modiniapps.co.uk

## Server Paths

- **Repo clone:** `/home/vpsadmin/work/apps/auth/repo/`
- **Compose:** `/home/vpsadmin/work/apps/auth/compose/docker-compose.yml`
- **Environment:** `/home/vpsadmin/work/apps/auth/env/.env` (secrets, not in git)
- **Deploy script:** `/home/vpsadmin/work/apps/auth/ops/deploy.sh`
- **Data:** `/home/vpsadmin/work/apps/auth/data/`
  - `modiniapps.sqlite` - user accounts
  - `sessions.db` - active sessions

## Container

- `modiniapps-auth` - Express app on port 3000

## Environment Variables

Set in `/home/vpsadmin/work/apps/auth/env/.env` (not committed):

```bash
NODE_ENV=production
PORT=3000
SESSION_SECRET=<generated-hex>
SESSION_NAME=modiniapps.sid
COOKIE_DOMAIN=.modiniapps.co.uk
COOKIE_SECURE=true
DATABASE_PATH=/app/data/modiniapps.sqlite
SESSION_DB_PATH=/app/data/sessions.db
CORS_ALLOW_ORIGINS=https://skylens.modiniapps.co.uk,https://risk.modiniapps.co.uk
ADMIN_EMAIL=mark.wharry@modini.co.uk
ADMIN_PASSWORD=kulsedcew1!
```

## Admin Account

**Pre-seeded on startup:**
- Email: mark.wharry@modini.co.uk
- Password: kulsedcew1!
- Admin flag: `is_admin=1`
- Auto-approved: `approved=1`

**Admin panel:** https://modiniapps.co.uk/admin

## User Approval Flow

1. New user registers at `/register`
2. Account created with `approved=0`
3. User cannot log in (gets "Account pending approval")
4. Admin visits `/admin` and clicks "Approve"
5. User can now log in and access apps

## Session Sharing

Sessions are shared across all `*.modiniapps.co.uk` subdomains via:
- **Cookie domain:** `.modiniapps.co.uk`
- **Cookie name:** `modiniapps.sid`
- **Secure flag:** true (HTTPS only)
- **Max age:** 7 days

This allows downstream apps to validate sessions without their own auth.

## Forward Auth Integration

### Traefik Middleware

Defined in auth gateway's Traefik labels:
```yaml
- "traefik.http.middlewares.modiniapps-auth.forwardauth.address=http://modiniapps-auth:3000/api/auth/session"
- "traefik.http.middlewares.modiniapps-auth.forwardauth.authResponseHeaders=X-Forwarded-User"
```

### How Apps Use It

Apps add this label to their routers:
```yaml
- "traefik.http.routers.myapp.middlewares=modiniapps-auth@docker"
```

### Auth Flow
1. User visits `skylens.modiniapps.co.uk`
2. Traefik intercepts and calls `/api/auth/session` on auth gateway
3. If valid session → request proxied to skylens
4. If invalid → returns 401 to user

### Session Validation Endpoint

**URL:** `/api/auth/session`

**Response (authenticated):**
```json
{
  "authenticated": true,
  "user": {
    "id": 1,
    "email": "mark.wharry@modini.co.uk",
    "isAdmin": true,
    "approved": true,
    "createdAt": "2025-10-08T16:29:00.000Z"
  }
}
```

**Response (unauthenticated):**
```json
{
  "authenticated": false
}
```
Status: 401

## App Configuration

Apps are defined in `src/config/apps.json`:

```json
[
  {
    "slug": "skylens",
    "name": "Skylens",
    "description": "Aircraft fleet operations console for airworthiness and sortie logging.",
    "url": "https://skylens.modiniapps.co.uk"
  },
  {
    "slug": "risk",
    "name": "Modini Risk",
    "description": "Risk management system with matrices, bow-ties, and compliance tracking.",
    "url": "https://risk.modiniapps.co.uk"
  }
]
```

**To add a new app:**
1. Edit `src/config/apps.json`
2. Commit and push
3. GitHub Actions redeploys automatically
4. New app appears on dashboard

## Routes

### Public Routes
- `GET /` - login page (if unauthenticated) or dashboard (if authenticated)
- `GET /login` - login page
- `GET /register` - registration page
- `POST /auth/login` - login form handler
- `POST /auth/register` - registration form handler
- `POST /auth/logout` - logout handler

### Protected Routes
- `GET /admin` - user management panel (admin only)
- `POST /admin/users/:id/approve` - approve user (admin only)
- `POST /admin/users/:id/reject` - revoke approval (admin only)
- `POST /admin/users/:id/delete` - delete user (admin only)
- `GET /apps/:slug` - redirect to app URL (requires auth)

### API Routes
- `GET /api/auth/session` - validate session (used by Forward Auth)
- `GET /api/apps` - list apps (requires auth)

## Database Schema

### users table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  approved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### sessions table
Managed by `connect-sqlite3` session store.

## Deployment

### Automatic (on push to main)
GitHub Actions triggers SSH deploy script automatically.

### Manual Deploy
```bash
/home/vpsadmin/work/apps/auth/ops/deploy.sh
```

### View Logs
```bash
cd /home/vpsadmin/work/apps/auth/compose
sg docker -c "docker compose logs -f"
```

## Backup

**Users database:**
```bash
cp /home/vpsadmin/work/apps/auth/data/modiniapps.sqlite \
   backup_auth_$(date +%Y%m%d).db
```

**Sessions database:**
```bash
cp /home/vpsadmin/work/apps/auth/data/sessions.db \
   backup_sessions_$(date +%Y%m%d).db
```

## Troubleshooting

### Users can't log in
- Check account is approved: `sqlite3 /home/vpsadmin/work/apps/auth/data/modiniapps.sqlite "SELECT * FROM users;"`
- Verify password with admin account
- Check container logs: `sg docker -c "docker logs modiniapps-auth"`

### Session not shared with subdomains
- Verify `COOKIE_DOMAIN=.modiniapps.co.uk` in env
- Verify `COOKIE_SECURE=true` and testing over HTTPS
- Check browser cookies in dev tools

### Forward Auth returns 401 for all apps
- Check auth container is running: `sg docker -c "docker ps | grep modiniapps-auth"`
- Test session endpoint: `curl http://localhost:3000/api/auth/session` (from inside container)
- Check Traefik can reach auth on web network

### Admin panel shows "Access denied"
- Verify user has `is_admin=1` in database
- Check session is valid (logout and login again)

---

See `/home/vpsadmin/work/DEPLOYMENT.md` for overall VPS setup and other apps.

