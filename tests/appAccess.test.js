const bcrypt = require('bcrypt');
const request = require('supertest');
const { createTestServer } = require('./helpers/createTestServer');

describe('App access controls', () => {
  let app;
  let db;
  let adminAgent;
  let memberAgent;

  beforeAll(() => {
    ({ app, db } = createTestServer());
  });

  beforeEach(async () => {
    await db.clearUsers();

    const adminHash = await bcrypt.hash('AdminPass1!', 12);
    const memberHash = await bcrypt.hash('MemberPass1!', 12);

    await db.createUser('admin@example.com', adminHash, true, true);
    await db.createUser('member@example.com', memberHash, false, true, {}, ['dart']);

    adminAgent = request.agent(app);
    await adminAgent
      .post('/auth/login')
      .type('form')
      .send({ email: 'admin@example.com', password: 'AdminPass1!' })
      .expect(302);

    memberAgent = request.agent(app);
    await memberAgent
      .post('/auth/login')
      .type('form')
      .send({ email: 'member@example.com', password: 'MemberPass1!' })
      .expect(302);
  });

  test('prevents members from reaching apps they are not entitled to', async () => {
    const listResponse = await memberAgent.get('/api/apps').expect(200);
    expect(listResponse.body.apps.map((entry) => entry.slug)).toEqual(['dart']);

    await memberAgent.get('/apps/skylens').expect(403);

    const sessionResponse = await memberAgent.get('/api/auth/session').expect(200);
    expect(sessionResponse.body.apps.map((entry) => entry.slug)).toEqual(['dart']);
    expect(sessionResponse.body.user.allowedApps).toEqual(['dart']);

    const forwardedHeader = sessionResponse.headers['x-forwarded-user'];
    expect(forwardedHeader).toBeTruthy();
    const forwardedPayload = JSON.parse(Buffer.from(forwardedHeader, 'base64url').toString('utf8'));
    expect(forwardedPayload.allowedApps).toEqual(['dart']);
    expect(forwardedPayload.apps.map((entry) => entry.slug)).toEqual(['dart']);
  });

  test('admins can grant and revoke app permissions', async () => {
    const targetHash = await bcrypt.hash('TargetPass1!', 12);
    const targetUser = await db.createUser('target@example.com', targetHash, false, true, {}, []);

    await adminAgent
      .post(`/admin/users/${targetUser.id}/apps`)
      .type('form')
      .send('allowedApps=risk&allowedApps=skylens&redirectTo=/admin')
      .expect(302)
      .expect('Location', '/admin');

    const updated = await db.findUserById(targetUser.id);
    expect(updated.allowedApps).toEqual(['risk', 'skylens']);

    await adminAgent
      .post(`/admin/users/${targetUser.id}/apps`)
      .type('form')
      .send('redirectTo=/admin')
      .expect(302)
      .expect('Location', '/admin');

    const cleared = await db.findUserById(targetUser.id);
    expect(cleared.allowedApps).toEqual([]);
  });
});
