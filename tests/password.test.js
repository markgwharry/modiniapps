const bcrypt = require('bcrypt');
const request = require('supertest');
const { createTestServer } = require('./helpers/createTestServer');

describe('Password updates', () => {
  let app;
  let db;
  let agent;

  beforeAll(() => {
    ({ app, db } = createTestServer());
  });

  beforeEach(async () => {
    await db.clearUsers();
    agent = request.agent(app);
  });

  test('rejects incorrect current password and accepts a valid change via the form', async () => {
    const passwordHash = await bcrypt.hash('initialPass1!', 12);
    await db.createUser('change@example.com', passwordHash, false, true);

    await agent
      .post('/auth/login')
      .type('form')
      .send({ email: 'change@example.com', password: 'initialPass1!' })
      .expect(302);

    const incorrect = await agent
      .post('/profile/password')
      .type('form')
      .send({
        currentPassword: 'wrongpass',
        newPassword: 'Newpass123!',
        confirmPassword: 'Newpass123!',
      })
      .expect(400);

    expect(incorrect.text).toContain('Current password is incorrect');

    const success = await agent
      .post('/profile/password')
      .type('form')
      .send({
        currentPassword: 'initialPass1!',
        newPassword: 'AnotherPass9!',
        confirmPassword: 'AnotherPass9!',
      })
      .expect(200);

    expect(success.text).toContain('Password updated successfully');

    await request(app)
      .post('/auth/login')
      .type('form')
      .send({ email: 'change@example.com', password: 'initialPass1!' })
      .expect(401);

    await request(app)
      .post('/auth/login')
      .type('form')
      .send({ email: 'change@example.com', password: 'AnotherPass9!' })
      .expect(302);
  });

  test('validates password payloads via the API', async () => {
    const passwordHash = await bcrypt.hash('Initial123!', 12);
    await db.createUser('api-pass@example.com', passwordHash, false, true);

    const apiAgent = request.agent(app);
    await apiAgent
      .post('/auth/login')
      .type('form')
      .send({ email: 'api-pass@example.com', password: 'Initial123!' })
      .expect(302);

    const invalid = await apiAgent
      .put('/api/profile/password')
      .send({ currentPassword: '', newPassword: 'short', confirmPassword: 'short' })
      .expect(400);

    expect(invalid.body.errors).toContain('Current password is required');
    expect(invalid.body.errors).toContain('New password must be at least 8 characters long');

    await apiAgent
      .put('/api/profile/password')
      .send({ currentPassword: 'Initial123!', newPassword: 'ValidPass88', confirmPassword: 'ValidPass88' })
      .expect(200);

    await request(app)
      .post('/auth/login')
      .type('form')
      .send({ email: 'api-pass@example.com', password: 'ValidPass88' })
      .expect(302);
  });
});
