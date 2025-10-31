const bcrypt = require('bcrypt');
const request = require('supertest');
const cheerio = require('cheerio');
const { createTestServer } = require('./helpers/createTestServer');

describe('Admin approvals', () => {
  let app;
  let db;
  let agent;
  let pendingUser;
  let rejectUser;

  beforeAll(async () => {
    ({ app, db } = createTestServer());
  });

  beforeEach(async () => {
    await db.clearUsers();
    const adminHash = await bcrypt.hash('AdminPass1!', 12);
    const pendingHash = await bcrypt.hash('PendingPass1!', 12);
    await db.createUser('admin@example.com', adminHash, true, true, {
      fullName: 'Admin User',
    });
    pendingUser = await db.createUser('pending@example.com', pendingHash, false, false, {
      fullName: 'Pending User',
    });
    rejectUser = await db.createUser('reject@example.com', pendingHash, false, false, {
      fullName: 'Reject User',
    });
    agent = request.agent(app);
    await agent
      .post('/auth/login')
      .type('form')
      .send({ email: 'admin@example.com', password: 'AdminPass1!' })
      .expect(302);
  });

  test('lists pending users and supports approve/reject actions', async () => {
    const adminPage = await agent.get('/admin').expect(200);
    const $admin = cheerio.load(adminPage.text);
    const pendingLinkText = $admin('a.button').filter((_, el) => $admin(el).attr('href') === '/admin/pending').text();
    expect(pendingLinkText).toContain('Pending approvals (2)');

    const pendingPage = await agent.get('/admin/pending').expect(200);
    const $pending = cheerio.load(pendingPage.text);
    const emails = $pending('tbody tr td:nth-child(3)')
      .map((_, el) => $pending(el).text().trim())
      .get();
    expect(emails).toEqual(expect.arrayContaining(['pending@example.com', 'reject@example.com']));

    await agent
      .post(`/admin/users/${pendingUser.id}/approve`)
      .type('form')
      .send('allowedApps=dart&allowedApps=skylens')
      .expect(302)
      .expect('Location', '/admin');
    const approvedUser = await db.findUserById(pendingUser.id);
    expect(approvedUser.approved).toBe(1);
    expect(approvedUser.allowedApps).toEqual(['dart', 'skylens']);

    await agent.post(`/admin/users/${rejectUser.id}/reject`).expect(302).expect('Location', '/admin/pending');
    const rejectedUser = await db.findUserById(rejectUser.id);
    expect(rejectedUser).toBeUndefined();
  });
});
