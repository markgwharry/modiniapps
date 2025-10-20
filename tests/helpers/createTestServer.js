const fs = require('fs');
const os = require('os');
const path = require('path');

function createTestServer() {
  jest.resetModules();

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modiniapps-tests-'));

  process.env.DATABASE_PATH = path.join(tempDir, 'db.sqlite');
  process.env.SESSION_DB_PATH = path.join(tempDir, 'sessions.sqlite');
  process.env.SESSION_SECRET = 'test-secret';
  process.env.SESSION_NAME = 'test.sid';
  process.env.COOKIE_SECURE = 'false';
  process.env.CORS_ALLOW_ORIGINS = '';
  process.env.PORT = '0';

  const { app } = require('../../src/server');
  const db = require('../../src/db');

  return { app, db, tempDir };
}

module.exports = { createTestServer };
