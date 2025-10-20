const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');

const { loadApps } = require('./config');
const requireAuth = require('./middleware/requireAuth');
const requireAdmin = require('./middleware/requireAdmin');
const {
  registerUser,
  authenticateUser,
  sanitizeUser,
  findUserById,
  verifyUserPassword,
  changeUserPassword,
} = require('./services/authService');
const { sendPendingRegistrationEmails } = require('./services/mailService');
const { approvePendingUser } = require('./services/userApprovalService');
const {
  updateUserAdmin,
  updateUserApproval,
  getAllUsers,
  getPendingUsers,
  updateUserProfile,
  deleteUser,
} = require('./db');
const {
  PORT,
  SESSION_SECRET,
  SESSION_NAME,
  COOKIE_DOMAIN,
  COOKIE_SECURE,
  SESSION_DB_PATH,
  CORS_ALLOW_ORIGINS,
} = require('./config/env');

const apps = loadApps();
const app = express();

function validateProfileInput(profile) {
  const errors = [];
  const trimmedName = (profile.fullName || '').trim();
  const trimmedJob = (profile.jobTitle || '').trim();
  const trimmedPhone = (profile.phone || '').trim();

  if (!trimmedName) {
    errors.push('Full name is required');
  } else if (trimmedName.length < 2) {
    errors.push('Full name must be at least 2 characters');
  }

  if (trimmedJob.length > 120) {
    errors.push('Job title must be 120 characters or fewer');
  }

  if (trimmedPhone && !/^\+?[0-9 ()-]{7,20}$/.test(trimmedPhone)) {
    errors.push('Phone number must contain only digits and basic punctuation');
  }

  return { errors, values: { fullName: trimmedName, jobTitle: trimmedJob, phone: trimmedPhone } };
}

function validatePasswordChangeInput(data) {
  const errors = [];
  const currentPassword = data.currentPassword || '';
  const newPassword = data.newPassword || '';
  const confirmPassword = data.confirmPassword || '';

  if (!currentPassword) {
    errors.push('Current password is required');
  }
  if (!newPassword) {
    errors.push('New password is required');
  } else if (newPassword.length < 8) {
    errors.push('New password must be at least 8 characters long');
  }
  if (newPassword !== confirmPassword) {
    errors.push('New password and confirmation do not match');
  }

  return { errors, currentPassword, newPassword };
}

// Trust proxy - we're behind Traefik
app.set('trust proxy', 1);

// Seed admin user on startup
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'mark.wharry@modini.co.uk';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kulsedcew1!';

async function seedAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn('Admin email or password not set in environment. Skipping admin seeding.');
    return;
  }

  try {
    const bcrypt = require('bcrypt');
    const { findUserByEmail, createUser } = require('./db');

    const normalisedEmail = ADMIN_EMAIL.trim().toLowerCase();
    const existingAdmin = await findUserByEmail(normalisedEmail);

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
      await createUser(normalisedEmail, passwordHash, true, true);
      console.log(`✓ Admin user seeded: ${normalisedEmail}`);
    } else {
      // Ensure existing admin is marked as admin and approved
      if (!existingAdmin.isAdmin || !existingAdmin.approved) {
        await updateUserAdmin(existingAdmin.id, true);
        await updateUserApproval(existingAdmin.id, true);
        console.log(`✓ Existing admin user updated: ${normalisedEmail}`);
      } else {
        console.log(`Admin user already exists: ${normalisedEmail}`);
      }
    }
  } catch (error) {
    console.error('Failed to seed admin user', error);
  }
}

seedAdmin().catch((err) => {
  console.error('Failed to seed admin user', err);
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(compression());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

if (CORS_ALLOW_ORIGINS.length > 0) {
  app.use(
    cors({
      origin: CORS_ALLOW_ORIGINS,
      credentials: true,
    })
  );
}

const sessionStoreDir = path.dirname(SESSION_DB_PATH);
const sessionStoreDb = path.basename(SESSION_DB_PATH);

const cookieConfig = {
  httpOnly: true,
  sameSite: 'lax',
  secure: COOKIE_SECURE,
  maxAge: 1000 * 60 * 60 * 24 * 7,
};
if (COOKIE_DOMAIN) {
  cookieConfig.domain = COOKIE_DOMAIN;
}

app.use(
  session({
    store: new SQLiteStore({
      db: sessionStoreDb,
      dir: sessionStoreDir,
    }),
    secret: SESSION_SECRET,
    name: SESSION_NAME,
    resave: true,  // Changed to true to ensure session is saved on every request
    saveUninitialized: false,
    cookie: cookieConfig,
    rolling: true,  // Reset cookie maxAge on every request
  })
);

app.use(async (req, res, next) => {
  res.locals.currentUser = null;
  if (req.session) {
    console.log('Session middleware - ID:', req.session.id, 'userId:', req.session.userId);
  }
  if (req.session && req.session.userId) {
    try {
      const user = await findUserById(req.session.userId);
      if (user) {
        req.user = user;
        res.locals.currentUser = user;
      }
    } catch (error) {
      console.error('Failed to load user from session', error);
    }
  }
  res.locals.apps = apps;
  next();
});

app.get('/', (req, res) => {
  console.log('GET / - session exists:', !!req.session, 'userId:', req.session?.userId);
  if (!req.session || !req.session.userId) {
    return res.render('login', { error: null, redirect: req.query.redirect || null });
  }
  return res.render('dashboard');
});

app.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/');
  }
  return res.render('login', { error: null, redirect: req.query.redirect || null });
});

app.get('/register', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/');
  }
  return res.render('register', { error: null, success: null, redirect: req.query.redirect || null });
});

app.get('/profile', requireAuth, (req, res) => {
  return res.render('profile', {
    user: req.user,
    errors: [],
    success: null,
  });
});

app.post('/profile', requireAuth, async (req, res) => {
  const { errors, values } = validateProfileInput(req.body);

  if (errors.length > 0) {
    return res.status(400).render('profile', {
      user: { ...req.user, ...values },
      errors,
      success: null,
    });
  }

  try {
    await updateUserProfile(req.session.userId, values);
    const updatedUser = await findUserById(req.session.userId);
    req.user = updatedUser;
    res.locals.currentUser = updatedUser;
    return res.render('profile', {
      user: updatedUser,
      errors: [],
      success: 'Profile updated successfully.',
    });
  } catch (error) {
    console.error('Failed to update profile', error);
    return res.status(500).render('profile', {
      user: { ...req.user, ...values },
      errors: ['Failed to update profile. Please try again.'],
      success: null,
    });
  }
});

app.get('/profile/password', requireAuth, (req, res) => {
  return res.render('password', {
    errors: [],
    success: null,
  });
});

app.post('/profile/password', requireAuth, async (req, res) => {
  const { errors, currentPassword, newPassword } = validatePasswordChangeInput(req.body);

  if (errors.length > 0) {
    return res.status(400).render('password', {
      errors,
      success: null,
    });
  }

  try {
    await verifyUserPassword(req.session.userId, currentPassword);
    await changeUserPassword(req.session.userId, newPassword);
    return res.render('password', {
      errors: [],
      success: 'Password updated successfully.',
    });
  } catch (error) {
    console.error('Failed to change password', error);
    const message = error.code === 'INVALID_PASSWORD' ? 'Current password is incorrect.' : 'Failed to update password.';
    return res.status(400).render('password', {
      errors: [message],
      success: null,
    });
  }
});

app.post('/auth/register', async (req, res) => {
  const { email, password, confirmPassword, redirect } = req.body;
  if (!email || !password) {
    return res.status(400).render('register', {
      error: 'Email and password are required',
      success: null,
      redirect: redirect || null,
    });
  }
  if (password !== confirmPassword) {
    return res.status(400).render('register', {
      error: 'Passwords do not match',
      success: null,
      redirect: redirect || null,
    });
  }
  try {
    const user = await registerUser(email, password);
    try {
      await sendPendingRegistrationEmails(user);
    } catch (notifyError) {
      console.error('Failed to dispatch registration emails', notifyError);
    }
    return res.status(200).render('register', {
      error: null,
      success: 'Your registration request is pending administrator approval. You will receive an email once your account is ready.',
      redirect: redirect || null,
    });
  } catch (error) {
    const message = error.code === 'USER_EXISTS' ? 'That email is already registered' : 'Failed to create account';
    console.error('Register error', error);
    return res.status(400).render('register', {
      error: message,
      success: null,
      redirect: redirect || null,
    });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password, redirect } = req.body;
  console.log('Login attempt for:', email);
  if (!email || !password) {
    return res.status(400).render('login', {
      error: 'Email and password are required',
      redirect: redirect || null,
    });
  }
  try {
    const user = await authenticateUser(email, password);
    console.log('Auth successful, setting session for user ID:', user.id);
    req.session.userId = user.id;
    
    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).render('login', {
          error: 'Login failed. Please try again.',
          redirect: redirect || null,
        });
      }
      console.log('Session saved, redirecting');
      return res.redirect(redirect || '/');
    });
  } catch (error) {
    let message = 'Unable to log in';
    if (error.code === 'INVALID_CREDENTIALS') {
      message = 'Invalid email or password';
    } else if (error.code === 'PENDING_APPROVAL') {
      message = 'Account pending approval';
    }
    console.error('Login error', error);
    return res.status(401).render('login', {
      error: message,
      redirect: redirect || null,
    });
  }
});

function handleLogout(req, res, next, redirectTarget) {
  const redirectTo = redirectTarget || '/';
  const clearOptions = {};
  if (COOKIE_DOMAIN) {
    clearOptions.domain = COOKIE_DOMAIN;
  }

  const finish = () => {
    res.clearCookie(SESSION_NAME, clearOptions);
    return res.redirect(redirectTo);
  };

  if (!req.session) {
    return finish();
  }

  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    finish();
  });
}

app.post('/auth/logout', (req, res, next) => {
  const redirectTo = req.body?.redirect;
  handleLogout(req, res, next, redirectTo);
});

app.get('/auth/logout', (req, res, next) => {
  const redirectTo = req.query.redirect;
  handleLogout(req, res, next, redirectTo);
});

app.get('/apps/:slug', requireAuth, (req, res) => {
  const appEntry = apps.find((entry) => entry.slug === req.params.slug);
  if (!appEntry) {
    return res.status(404).render('error', { message: 'App not found' });
  }
  return res.redirect(appEntry.url);
});

app.get('/api/apps', requireAuth, (req, res) => {
  res.json({ apps });
});

app.get('/api/profile', requireAuth, (req, res) => {
  return res.json({ profile: sanitizeUser(req.user) });
});

app.put('/api/profile', requireAuth, async (req, res) => {
  const { errors, values } = validateProfileInput(req.body || {});
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    await updateUserProfile(req.session.userId, values);
    const updatedUser = await findUserById(req.session.userId);
    req.user = updatedUser;
    res.locals.currentUser = updatedUser;
    return res.json({ profile: sanitizeUser(updatedUser) });
  } catch (error) {
    console.error('Failed to update profile via API', error);
    return res.status(500).json({ errors: ['Failed to update profile'] });
  }
});

app.put('/api/profile/password', requireAuth, async (req, res) => {
  const { errors, currentPassword, newPassword } = validatePasswordChangeInput(req.body || {});
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    await verifyUserPassword(req.session.userId, currentPassword);
    await changeUserPassword(req.session.userId, newPassword);
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to update password via API', error);
    if (error.code === 'INVALID_PASSWORD') {
      return res.status(400).json({ errors: ['Current password is incorrect'] });
    }
    return res.status(500).json({ errors: ['Failed to update password'] });
  }
});

app.get('/api/auth/session', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ authenticated: false });
  }
  const user = sanitizeUser(req.user);
  if (user) {
    try {
      const encodedUser = Buffer.from(JSON.stringify(user), 'utf8').toString('base64url');
      res.set('X-Forwarded-User', encodedUser);
    } catch (error) {
      console.error('Failed to encode forwarded user payload', error);
    }
  }
  return res.json({ authenticated: true, user });
});

// Admin routes
app.get('/admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [users, pendingUsers] = await Promise.all([getAllUsers(), getPendingUsers()]);
    return res.render('admin', { users, pendingCount: pendingUsers.length });
  } catch (error) {
    console.error('Failed to load users', error);
    return res.status(500).render('error', { message: 'Failed to load admin panel' });
  }
});

app.get('/admin/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pendingUsers = await getPendingUsers();
    return res.render('admin-pending', { users: pendingUsers });
  } catch (error) {
    console.error('Failed to load pending users', error);
    return res.status(500).render('error', { message: 'Failed to load pending users' });
  }
});

app.post('/admin/users/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    await approvePendingUser(req.params.id);
    return res.redirect('/admin');
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).render('error', { message: 'User not found' });
    }
    console.error('Failed to approve user', error);
    return res.status(500).render('error', { message: 'Failed to approve user' });
  }
});

app.post('/admin/users/:id/unapprove', requireAuth, requireAdmin, async (req, res) => {
  try {
    await updateUserApproval(req.params.id, false);
    return res.redirect('/admin');
  } catch (error) {
    console.error('Failed to unapprove user', error);
    return res.status(500).render('error', { message: 'Failed to unapprove user' });
  }
});

app.post('/admin/users/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    await deleteUser(req.params.id);
    return res.redirect('/admin/pending');
  } catch (error) {
    console.error('Failed to reject user', error);
    return res.status(500).render('error', { message: 'Failed to reject user' });
  }
});

app.post('/admin/users/:id/make-admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    await updateUserAdmin(req.params.id, true);
    return res.redirect('/admin');
  } catch (error) {
    console.error('Failed to make user admin', error);
    return res.status(500).render('error', { message: 'Failed to make user admin' });
  }
});

app.post('/admin/users/:id/remove-admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    await updateUserAdmin(req.params.id, false);
    return res.redirect('/admin');
  } catch (error) {
    console.error('Failed to remove admin', error);
    return res.status(500).render('error', { message: 'Failed to remove admin' });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  if (req.accepts('json')) {
    res.status(500).json({ error: 'Internal Server Error' });
  } else {
    res.status(500).render('error', { message: 'Something went wrong' });
  }
});

function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`Modini Apps gateway listening on port ${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
};
