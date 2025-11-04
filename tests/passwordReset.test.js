const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcrypt');
const request = require('supertest');

// Mock the mail service BEFORE loading the server
jest.mock('../src/services/mailService', () => ({
  sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
  sendPendingRegistrationEmails: jest.fn(() => Promise.resolve()),
  sendUserApprovalEmail: jest.fn(() => Promise.resolve()),
  renderTemplate: jest.fn(),
}));

const mailService = require('../src/services/mailService');

let tmpDir;
let app;
let db;

async function waitForAdminAccount() {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const admin = await db.findUserByEmail(process.env.ADMIN_EMAIL);
    if (admin) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Admin account was not seeded');
}

describe('Password reset flow', () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modiniapps-reset-tests-'));
    process.env.SESSION_SECRET = 'test-secret';
    process.env.DATABASE_PATH = path.join(tmpDir, 'modiniapps.sqlite');
    process.env.SESSION_DB_PATH = path.join(tmpDir, 'sessions.sqlite');
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'AdminPass123!';
    process.env.MAIL_ADMIN_RECIPIENTS = 'approvals@example.com';
    process.env.MAIL_FROM = 'no-reply@example.com';
    process.env.MAIL_HOST = '';
    process.env.PUBLIC_BASE_URL = 'https://apps.test';

    ({ app } = require('../src/server'));
    db = require('../src/db');
    await waitForAdminAccount();
  });

  afterAll(async () => {
    if (db && db.closeDatabase) {
      await db.closeDatabase();
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await db.clearUsers();
    jest.clearAllMocks();
  });

  describe('Forgot password request', () => {
    test('renders forgot password page', async () => {
      const response = await request(app).get('/forgot-password').expect(200);
      expect(response.text).toContain('Reset Your Password');
      expect(response.text).toContain('Enter your email address');
    });

    test('sends reset email for existing approved user', async () => {
      const passwordHash = await bcrypt.hash('testPass123!', 12);
      await db.createUser('user@example.com', passwordHash, false, true);

      const response = await request(app)
        .post('/forgot-password')
        .type('form')
        .send({ email: 'user@example.com' })
        .expect(200);

      expect(response.text).toContain('If an account exists with that email');
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);

      // Verify token was created in database
      const user = await db.findUserByEmail('user@example.com');
      expect(user).toBeDefined();
    });

    test('does not reveal if email exists (security)', async () => {
      const response = await request(app)
        .post('/forgot-password')
        .type('form')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.text).toContain('If an account exists with that email');
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    test('does not send reset email for pending user', async () => {
      const passwordHash = await bcrypt.hash('testPass123!', 12);
      await db.createUser('pending@example.com', passwordHash, false, false);

      const response = await request(app)
        .post('/forgot-password')
        .type('form')
        .send({ email: 'pending@example.com' })
        .expect(200);

      expect(response.text).toContain('If an account exists with that email');
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    test('requires email address', async () => {
      const response = await request(app)
        .post('/forgot-password')
        .type('form')
        .send({ email: '' })
        .expect(400);

      expect(response.text).toContain('Email address is required');
    });

    test('allows admin to reset password even if not approved', async () => {
      const passwordHash = await bcrypt.hash('adminPass123!', 12);
      await db.createUser('admin@example.com', passwordHash, true, true);

      await request(app)
        .post('/forgot-password')
        .type('form')
        .send({ email: 'admin@example.com' })
        .expect(200);

      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('Password reset with token', () => {
    test('validates token and renders reset form', async () => {
      const passwordHash = await bcrypt.hash('testPass123!', 12);
      const user = await db.createUser('reset@example.com', passwordHash, false, true);

      // Create a reset token
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      const tokenRecord = await db.createPasswordResetToken(user.id, 'valid-token-123', expiresAt.toISOString());

      const response = await request(app).get('/reset-password?token=valid-token-123').expect(200);

      expect(response.text).toContain('Reset Your Password');
      expect(response.text).toContain('Choose a new password');
      expect(response.text).toContain('value="valid-token-123"');
    });

    test('rejects invalid token', async () => {
      const response = await request(app).get('/reset-password?token=invalid-token').expect(200);

      expect(response.text).toContain('Invalid or expired reset link');
      expect(response.text).not.toContain('<form');
    });

    test('rejects expired token', async () => {
      const passwordHash = await bcrypt.hash('testPass123!', 12);
      const user = await db.createUser('expired@example.com', passwordHash, false, true);

      // Create an expired token
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() - 1);
      await db.createPasswordResetToken(user.id, 'expired-token', expiresAt.toISOString());

      const response = await request(app).get('/reset-password?token=expired-token').expect(200);

      expect(response.text).toContain('This reset link has expired');
    });

    test('rejects already used token', async () => {
      const passwordHash = await bcrypt.hash('testPass123!', 12);
      const user = await db.createUser('used@example.com', passwordHash, false, true);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      const tokenRecord = await db.createPasswordResetToken(user.id, 'used-token', expiresAt.toISOString());
      await db.markTokenAsUsed(tokenRecord.id);

      const response = await request(app).get('/reset-password?token=used-token').expect(200);

      expect(response.text).toContain('This reset link has already been used');
    });

    test('requires token in query string', async () => {
      const response = await request(app).get('/reset-password').expect(200);

      expect(response.text).toContain('Invalid or missing reset token');
      expect(response.text).not.toContain('<form');
    });
  });

  describe('Submitting new password', () => {
    test('successfully resets password with valid token', async () => {
      const passwordHash = await bcrypt.hash('oldPass123!', 12);
      const user = await db.createUser('success@example.com', passwordHash, false, true);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      await db.createPasswordResetToken(user.id, 'reset-token', expiresAt.toISOString());

      const response = await request(app)
        .post('/reset-password')
        .type('form')
        .send({
          token: 'reset-token',
          newPassword: 'newPass456!',
          confirmPassword: 'newPass456!',
        })
        .expect(200);

      expect(response.text).toContain('Your password has been reset successfully');

      // Verify old password doesn't work
      await request(app)
        .post('/auth/login')
        .type('form')
        .send({ email: 'success@example.com', password: 'oldPass123!' })
        .expect(401);

      // Verify new password works
      await request(app)
        .post('/auth/login')
        .type('form')
        .send({ email: 'success@example.com', password: 'newPass456!' })
        .expect(302);
    });

    test('requires password confirmation to match', async () => {
      const passwordHash = await bcrypt.hash('testPass123!', 12);
      const user = await db.createUser('mismatch@example.com', passwordHash, false, true);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      await db.createPasswordResetToken(user.id, 'mismatch-token', expiresAt.toISOString());

      const response = await request(app)
        .post('/reset-password')
        .type('form')
        .send({
          token: 'mismatch-token',
          newPassword: 'newPass456!',
          confirmPassword: 'different456!',
        })
        .expect(400);

      expect(response.text).toContain('Passwords do not match');
    });

    test('enforces minimum password length', async () => {
      const passwordHash = await bcrypt.hash('testPass123!', 12);
      const user = await db.createUser('short@example.com', passwordHash, false, true);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      await db.createPasswordResetToken(user.id, 'short-token', expiresAt.toISOString());

      const response = await request(app)
        .post('/reset-password')
        .type('form')
        .send({
          token: 'short-token',
          newPassword: 'short',
          confirmPassword: 'short',
        })
        .expect(400);

      expect(response.text).toContain('Password must be at least 8 characters');
    });

    test('requires token', async () => {
      const response = await request(app)
        .post('/reset-password')
        .type('form')
        .send({
          newPassword: 'newPass456!',
          confirmPassword: 'newPass456!',
        })
        .expect(400);

      expect(response.text).toContain('Invalid or missing reset token');
    });

    test('marks token as used after successful reset', async () => {
      const passwordHash = await bcrypt.hash('oldPass123!', 12);
      const user = await db.createUser('oneuse@example.com', passwordHash, false, true);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      await db.createPasswordResetToken(user.id, 'oneuse-token', expiresAt.toISOString());

      // First reset succeeds
      await request(app)
        .post('/reset-password')
        .type('form')
        .send({
          token: 'oneuse-token',
          newPassword: 'newPass456!',
          confirmPassword: 'newPass456!',
        })
        .expect(200);

      // Second attempt with same token fails
      const response = await request(app)
        .post('/reset-password')
        .type('form')
        .send({
          token: 'oneuse-token',
          newPassword: 'anotherPass789!',
          confirmPassword: 'anotherPass789!',
        })
        .expect(400);

      expect(response.text).toContain('This reset link has already been used');
    });

    test('invalidates old tokens when new reset is requested', async () => {
      const passwordHash = await bcrypt.hash('testPass123!', 12);
      const user = await db.createUser('multi@example.com', passwordHash, false, true);

      // Create first token
      const expiresAt1 = new Date();
      expiresAt1.setHours(expiresAt1.getHours() + 1);
      await db.createPasswordResetToken(user.id, 'old-token', expiresAt1.toISOString());

      // Request another reset (this should invalidate the first token)
      await request(app).post('/forgot-password').type('form').send({ email: 'multi@example.com' }).expect(200);

      // Old token should no longer work
      const response = await request(app).get('/reset-password?token=old-token').expect(200);

      expect(response.text).toContain('Invalid or expired reset link');
    });
  });
});
