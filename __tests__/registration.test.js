const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

jest.mock('../src/services/mailService', () => ({
  sendPendingRegistrationEmails: jest.fn(() => Promise.resolve()),
  sendUserApprovalEmail: jest.fn(() => Promise.resolve()),
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

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modiniapps-tests-'));
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('registration notifications', () => {
  test('creates pending user and notifies admin and registrant', async () => {
    const response = await request(app)
      .post('/auth/register')
      .type('form')
      .send({
        email: 'new.user@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Your registration request is pending administrator approval');

    const user = await db.findUserByEmail('new.user@example.com');
    expect(user).toBeDefined();
    expect(user.approved).toBe(0);
    expect(mailService.sendPendingRegistrationEmails).toHaveBeenCalledTimes(1);
    expect(mailService.sendPendingRegistrationEmails).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new.user@example.com' })
    );
  });
});

describe('admin approval flow', () => {
  test('activates user, rotates password and sends approval email', async () => {
    const email = 'pending.user@example.com';
    await request(app)
      .post('/auth/register')
      .type('form')
      .send({
        email,
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    const pendingUser = await db.findUserByEmail(email);
    expect(pendingUser).toBeDefined();
    const originalHash = pendingUser.passwordHash;

    const agent = request.agent(app);
    const loginResponse = await agent
      .post('/auth/login')
      .type('form')
      .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });

    expect(loginResponse.status).toBe(302);

    mailService.sendUserApprovalEmail.mockClear();

    const approvalResponse = await agent.post(`/admin/users/${pendingUser.id}/approve`);
    expect(approvalResponse.status).toBe(302);
    expect(mailService.sendUserApprovalEmail).toHaveBeenCalledTimes(1);

    const [userArg, passwordArg] = mailService.sendUserApprovalEmail.mock.calls[0];
    expect(userArg.email).toBe(email);
    expect(typeof passwordArg).toBe('string');
    expect(passwordArg.length).toBeGreaterThanOrEqual(12);

    const updatedUser = await db.findUserByEmail(email);
    expect(updatedUser.approved).toBe(1);
    expect(updatedUser.passwordHash).not.toEqual(originalHash);
  });
});
