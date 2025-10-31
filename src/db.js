const sqlite3 = require('sqlite3').verbose();
const { DATABASE_PATH } = require('./config/env');

const db = new sqlite3.Database(DATABASE_PATH, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database', err);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT DEFAULT '',
      job_title TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      is_admin INTEGER DEFAULT 0,
      approved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS user_apps (
      user_id INTEGER NOT NULL,
      app_slug TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, app_slug),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
});

function ensureColumn(column, sql) {
  db.all(`PRAGMA table_info(users)`, (err, rows) => {
    if (err) {
      console.error('Failed to inspect users table', err);
      return;
    }

    const hasColumn = rows.some((row) => row.name === column);
    if (!hasColumn) {
      db.run(sql, (alterErr) => {
        if (alterErr) {
          console.error(`Failed to add column ${column}`, alterErr);
        }
      });
    }
  });
}

ensureColumn('full_name', "ALTER TABLE users ADD COLUMN full_name TEXT DEFAULT ''");
ensureColumn('job_title', "ALTER TABLE users ADD COLUMN job_title TEXT DEFAULT ''");
ensureColumn('phone', "ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''");

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        return reject(err);
      }
      resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

async function getUserApps(userId) {
  const rows = await allAsync(`SELECT app_slug as appSlug FROM user_apps WHERE user_id = ? ORDER BY app_slug ASC`, [userId]);
  return rows.map((row) => row.appSlug);
}

async function setUserApps(userId, appSlugs = []) {
  const uniqueSlugs = Array.from(
    new Set(
      (appSlugs || [])
        .map((slug) => (typeof slug === 'string' ? slug.trim() : ''))
        .filter((slug) => slug.length > 0)
    )
  );

  await runAsync(`DELETE FROM user_apps WHERE user_id = ?`, [userId]);
  for (const slug of uniqueSlugs) {
    await runAsync(`INSERT INTO user_apps (user_id, app_slug) VALUES (?, ?)`, [userId, slug]);
  }

  return uniqueSlugs;
}

async function hydrateUser(row) {
  if (!row) {
    return undefined;
  }
  const allowedApps = await getUserApps(row.id);
  return {
    ...row,
    allowedApps,
  };
}

async function createUser(email, passwordHash, isAdmin = false, approved = false, profile = {}, allowedApps = []) {
  const { fullName = '', jobTitle = '', phone = '' } = profile;
  const stmt = `INSERT INTO users (email, password_hash, full_name, job_title, phone, is_admin, approved) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const result = await runAsync(stmt, [
    email,
    passwordHash,
    fullName,
    jobTitle,
    phone,
    isAdmin ? 1 : 0,
    approved ? 1 : 0,
  ]);

  const userId = result.lastID;
  const apps = await setUserApps(userId, allowedApps);

  return {
    id: userId,
    email,
    fullName,
    jobTitle,
    phone,
    isAdmin,
    approved,
    allowedApps: apps,
  };
}

async function findUserByEmail(email) {
  const stmt = `SELECT id, email, password_hash as passwordHash, full_name as fullName, job_title as jobTitle, phone, is_admin as isAdmin, approved, created_at as createdAt FROM users WHERE email = ?`;
  const row = await getAsync(stmt, [email]);
  return hydrateUser(row);
}

async function findUserById(id) {
  const stmt = `SELECT id, email, full_name as fullName, job_title as jobTitle, phone, is_admin as isAdmin, approved, created_at as createdAt FROM users WHERE id = ?`;
  const row = await getAsync(stmt, [id]);
  return hydrateUser(row);
}

async function findUserByIdWithPassword(id) {
  const stmt = `SELECT id, email, password_hash as passwordHash, full_name as fullName, job_title as jobTitle, phone, is_admin as isAdmin, approved, created_at as createdAt FROM users WHERE id = ?`;
  const row = await getAsync(stmt, [id]);
  return hydrateUser(row);
}

function updateUserAdmin(id, isAdmin) {
  return new Promise((resolve, reject) => {
    const stmt = `UPDATE users SET is_admin = ? WHERE id = ?`;
    db.run(stmt, [isAdmin ? 1 : 0, id], function (err) {
      if (err) {
        return reject(err);
      }
      resolve({ id, isAdmin });
    });
  });
}

function updateUserApproval(id, approved) {
  return new Promise((resolve, reject) => {
    const stmt = `UPDATE users SET approved = ? WHERE id = ?`;
    db.run(stmt, [approved ? 1 : 0, id], function (err) {
      if (err) {
        return reject(err);
      }
      resolve({ id, approved });
    });
  });
}

function updateUserPassword(id, passwordHash) {
  return new Promise((resolve, reject) => {
    const stmt = `UPDATE users SET password_hash = ? WHERE id = ?`;
    db.run(stmt, [passwordHash, id], function (err) {
      if (err) {
        return reject(err);
      }
      resolve({ id });
    });
  });
}

function updateUserProfile(id, profile) {
  const { fullName = '', jobTitle = '', phone = '' } = profile;
  return new Promise((resolve, reject) => {
    const stmt = `UPDATE users SET full_name = ?, job_title = ?, phone = ? WHERE id = ?`;
    db.run(stmt, [fullName, jobTitle, phone, id], function (err) {
      if (err) {
        return reject(err);
      }
      resolve({ id, fullName, jobTitle, phone });
    });
  });
}

function getAllUsers() {
  return allAsync(
    `SELECT id, email, full_name as fullName, job_title as jobTitle, phone, is_admin as isAdmin, approved, created_at as createdAt FROM users ORDER BY created_at DESC`
  ).then((rows) => Promise.all(rows.map((row) => hydrateUser(row))));
}

function getPendingUsers() {
  return allAsync(
    `SELECT id, email, full_name as fullName, job_title as jobTitle, phone, created_at as createdAt FROM users WHERE approved = 0 ORDER BY created_at ASC`
  ).then((rows) => Promise.all(rows.map((row) => hydrateUser(row))));
}

async function deleteUser(id) {
  await runAsync(`DELETE FROM user_apps WHERE user_id = ?`, [id]);
  const result = await runAsync(`DELETE FROM users WHERE id = ?`, [id]);
  return { id, changes: result.changes };
}

async function clearUsers() {
  await runAsync('DELETE FROM user_apps');
  await runAsync('DELETE FROM users');
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByIdWithPassword,
  updateUserAdmin,
  updateUserApproval,
  updateUserPassword,
  updateUserProfile,
  getAllUsers,
  getPendingUsers,
  getUserApps,
  setUserApps,
  deleteUser,
  clearUsers,
  closeDatabase,
};
