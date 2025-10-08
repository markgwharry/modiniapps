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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
});

function createUser(email, passwordHash) {
  return new Promise((resolve, reject) => {
    const stmt = `INSERT INTO users (email, password_hash) VALUES (?, ?)`;
    db.run(stmt, [email, passwordHash], function (err) {
      if (err) {
        return reject(err);
      }
      resolve({ id: this.lastID, email });
    });
  });
}

function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const stmt = `SELECT id, email, password_hash as passwordHash, created_at as createdAt FROM users WHERE email = ?`;
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
    const stmt = `SELECT id, email, created_at as createdAt FROM users WHERE id = ?`;
    db.get(stmt, [id], (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
};
