const fs = require('fs');
const os = require('os');
const path = require('path');

describe('user app entitlements', () => {
  let tmpDir;
  let db;

  beforeAll(async () => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modiniapps-entitlements-'));
    process.env.SESSION_SECRET = 'test-secret';
    process.env.DATABASE_PATH = path.join(tmpDir, 'modiniapps.sqlite');
    process.env.SESSION_DB_PATH = path.join(tmpDir, 'sessions.sqlite');
    db = require('../src/db');
  });

  afterAll(async () => {
    if (db && db.closeDatabase) {
      await db.closeDatabase();
    }
    jest.resetModules();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('setUserApps persists and hydrates allowed apps', async () => {
    const passwordHash = 'hash-value';
    const user = await db.createUser('member@example.com', passwordHash, false, true);
    expect(user.allowedApps).toEqual([]);

    await db.setUserApps(user.id, ['alpha', 'beta', 'alpha']);
    const apps = await db.getUserApps(user.id);
    expect(apps).toEqual(['alpha', 'beta']);

    const byId = await db.findUserById(user.id);
    expect(byId.allowedApps).toEqual(['alpha', 'beta']);

    const byEmail = await db.findUserByEmail('member@example.com');
    expect(byEmail.allowedApps).toEqual(['alpha', 'beta']);

    await db.setUserApps(user.id, ['gamma']);
    const updated = await db.findUserByIdWithPassword(user.id);
    expect(updated.allowedApps).toEqual(['gamma']);

    const allUsers = await db.getAllUsers();
    const targetUser = allUsers.find((entry) => entry.id === user.id);
    expect(targetUser.allowedApps).toEqual(['gamma']);
  });

  test('clearing users removes associated app rows', async () => {
    const passwordHash = 'hash-value';
    const anotherUser = await db.createUser('other@example.com', passwordHash, false, true, {}, ['delta']);
    expect(anotherUser.allowedApps).toEqual(['delta']);

    await db.clearUsers();

    const fetched = await db.findUserByEmail('other@example.com');
    expect(fetched).toBeUndefined();
  });
});
