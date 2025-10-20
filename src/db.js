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
      is_admin INTEGER DEFAULT 0,
      approved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
});

function createUser(email, passwordHash, isAdmin = false, approved = false) {
  return new Promise((resolve, reject) => {
    const stmt = `INSERT INTO users (email, password_hash, is_admin, approved) VALUES (?, ?, ?, ?)`;
    db.run(stmt, [email, passwordHash, isAdmin ? 1 : 0, approved ? 1 : 0], function (err) {
      if (err) {
        return reject(err);
      }
      resolve({ id: this.lastID, email, isAdmin, approved });
    });
  });
}

function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const stmt = `SELECT id, email, password_hash as passwordHash, is_admin as isAdmin, approved, created_at as createdAt FROM users WHERE email = ?`;
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
    const stmt = `SELECT id, email, is_admin as isAdmin, approved, created_at as createdAt FROM users WHERE id = ?`;
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

function getAllUsers() {
  return new Promise((resolve, reject) => {
    const stmt = `SELECT id, email, is_admin as isAdmin, approved, created_at as createdAt FROM users ORDER BY created_at DESC`;
    db.all(stmt, [], (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
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
  updateUserAdmin,
  updateUserApproval,
  updateUserPassword,
  getAllUsers,
  closeDatabase,
};
