const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');

const { loadApps } = require('./config');
const requireAuth = require('./middleware/requireAuth');
const {
  registerUser,
  authenticateUser,
  sanitizeUser,
  findUserById,
} = require('./services/authService');
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
    resave: false,
    saveUninitialized: false,
    cookie: cookieConfig,
  })
);

app.use(async (req, res, next) => {
  res.locals.currentUser = null;
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
  return res.render('register', { error: null, redirect: req.query.redirect || null });
});

app.post('/auth/register', async (req, res) => {
  const { email, password, confirmPassword, redirect } = req.body;
  if (!email || !password) {
    return res.status(400).render('register', {
      error: 'Email and password are required',
      redirect: redirect || null,
    });
  }
  if (password !== confirmPassword) {
    return res.status(400).render('register', {
      error: 'Passwords do not match',
      redirect: redirect || null,
    });
  }
  try {
    const user = await registerUser(email, password);
    req.session.userId = user.id;
    return res.redirect(redirect || '/');
  } catch (error) {
    const message = error.code === 'USER_EXISTS' ? 'That email is already registered' : 'Failed to create account';
    console.error('Register error', error);
    return res.status(400).render('register', {
      error: message,
      redirect: redirect || null,
    });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password, redirect } = req.body;
  if (!email || !password) {
    return res.status(400).render('login', {
      error: 'Email and password are required',
      redirect: redirect || null,
    });
  }
  try {
    const user = await authenticateUser(email, password);
    req.session.userId = user.id;
    return res.redirect(redirect || '/');
  } catch (error) {
    const message = error.code === 'INVALID_CREDENTIALS' ? 'Invalid email or password' : 'Unable to log in';
    console.error('Login error', error);
    return res.status(401).render('login', {
      error: message,
      redirect: redirect || null,
    });
  }
});

app.post('/auth/logout', (req, res, next) => {
  if (!req.session) {
    return res.redirect('/');
  }
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    const clearOptions = {};
    if (COOKIE_DOMAIN) {
      clearOptions.domain = COOKIE_DOMAIN;
    }
    res.clearCookie(SESSION_NAME, clearOptions);
    return res.redirect('/');
  });
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

app.get('/api/auth/session', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ authenticated: false });
  }
  const user = sanitizeUser(req.user);
  return res.json({ authenticated: true, user });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  if (req.accepts('json')) {
    res.status(500).json({ error: 'Internal Server Error' });
  } else {
    res.status(500).render('error', { message: 'Something went wrong' });
  }
});

app.listen(PORT, () => {
  console.log(`Modini Apps gateway listening on port ${PORT}`);
});
