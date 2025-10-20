const sqlite3 = require('sqlite3').verbose();
const { DATABASE_PATH } = require('./config/env');

const db = new sqlite3.Database(DATABASE_PATH, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database', err);
    process.exit(1);
  }
});

db.serialize(() => {
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

function createUser(email, passwordHash, isAdmin = false, approved = false, profile = {}) {
  return new Promise((resolve, reject) => {
    const { fullName = '', jobTitle = '', phone = '' } = profile;
    const stmt = `INSERT INTO users (email, password_hash, full_name, job_title, phone, is_admin, approved) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(stmt, [email, passwordHash, fullName, jobTitle, phone, isAdmin ? 1 : 0, approved ? 1 : 0], function (err) {
      if (err) {
        return reject(err);
      }
      resolve({ id: this.lastID, email, fullName, jobTitle, phone, isAdmin, approved });
    });
  });
}

function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const stmt = `SELECT id, email, password_hash as passwordHash, full_name as fullName, job_title as jobTitle, phone, is_admin as isAdmin, approved, created_at as createdAt FROM users WHERE email = ?`;
    db.get(stmt, [email], (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
}

function findUserById(id) {
  return new Promise((resolve, reject) => {
    const stmt = `SELECT id, email, full_name as fullName, job_title as jobTitle, phone, is_admin as isAdmin, approved, created_at as createdAt FROM users WHERE id = ?`;
    db.get(stmt, [id], (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
}

function findUserByIdWithPassword(id) {
  return new Promise((resolve, reject) => {
    const stmt = `SELECT id, email, password_hash as passwordHash, full_name as fullName, job_title as jobTitle, phone, is_admin as isAdmin, approved, created_at as createdAt FROM users WHERE id = ?`;
    db.get(stmt, [id], (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
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
  return new Promise((resolve, reject) => {
    const stmt = `SELECT id, email, full_name as fullName, job_title as jobTitle, phone, is_admin as isAdmin, approved, created_at as createdAt FROM users ORDER BY created_at DESC`;
    db.all(stmt, [], (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function getPendingUsers() {
  return new Promise((resolve, reject) => {
    const stmt = `SELECT id, email, full_name as fullName, job_title as jobTitle, phone, created_at as createdAt FROM users WHERE approved = 0 ORDER BY created_at ASC`;
    db.all(stmt, [], (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function deleteUser(id) {
  return new Promise((resolve, reject) => {
    const stmt = `DELETE FROM users WHERE id = ?`;
    db.run(stmt, [id], function (err) {
      if (err) {
        return reject(err);
      }
      resolve({ id, changes: this.changes });
    });
  });
}

function clearUsers() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM users', (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
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
  deleteUser,
  clearUsers,
  closeDatabase,
};
