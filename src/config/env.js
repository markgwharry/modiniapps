const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const SESSION_NAME = process.env.SESSION_NAME || 'modiniapps.sid';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'modiniapps.sqlite');
const SESSION_DB_PATH = process.env.SESSION_DB_PATH || path.join(process.cwd(), 'data', 'sessions.sqlite');
const CORS_ALLOW_ORIGINS = (process.env.CORS_ALLOW_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

ensureDirExists(DATABASE_PATH);
ensureDirExists(SESSION_DB_PATH);

module.exports = {
  PORT,
  SESSION_SECRET,
  SESSION_NAME,
  COOKIE_DOMAIN,
  COOKIE_SECURE,
  DATABASE_PATH,
  SESSION_DB_PATH,
  CORS_ALLOW_ORIGINS,
};
