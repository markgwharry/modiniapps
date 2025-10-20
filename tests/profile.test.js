const bcrypt = require('bcrypt');
const request = require('supertest');
const { createTestServer } = require('./helpers/createTestServer');

describe('Profile management', () => {
  let app;
  let db;
  let agent;

  beforeAll(async () => {
    ({ app, db } = createTestServer());
  });

  beforeEach(async () => {
    await db.clearUsers();
    agent = request.agent(app);
  });

  test('allows an authenticated user to update profile details via the form', async () => {
    const passwordHash = await bcrypt.hash('password123', 12);
    const user = await db.createUser('user@example.com', passwordHash, false, true);

    await agent
      .post('/auth/login')
      .type('form')
      .send({ email: 'user@example.com', password: 'password123' })
      .expect(302);

    const response = await agent
      .post('/profile')
      .type('form')
      .send({
        email: 'user@example.com',
        fullName: 'Jane Doe',
        jobTitle: 'Flight Lead',
        phone: '+44 1234 567890',
      })
      .expect(200);

    expect(response.text).toContain('Profile updated successfully');

    const updatedUser = await db.findUserById(user.id);
    expect(updatedUser.fullName).toBe('Jane Doe');
    expect(updatedUser.jobTitle).toBe('Flight Lead');
    expect(updatedUser.phone).toBe('+44 1234 567890');
  });

  test('validates profile payloads via the API', async () => {
    const passwordHash = await bcrypt.hash('password456', 12);
    const user = await db.createUser('api@example.com', passwordHash, false, true);

    const apiAgent = request.agent(app);
    await apiAgent
      .post('/auth/login')
      .type('form')
      .send({ email: 'api@example.com', password: 'password456' })
      .expect(302);

    const invalid = await apiAgent
      .put('/api/profile')
      .send({ fullName: '', phone: 'abc' })
      .expect(400);

    expect(invalid.body.errors).toContain('Full name is required');
    expect(invalid.body.errors).toContain('Phone number must contain only digits and basic punctuation');

    const valid = await apiAgent
      .put('/api/profile')
      .send({ fullName: 'API User', jobTitle: 'Dispatcher', phone: '+1 555 000 1111' })
      .expect(200);

    expect(valid.body.profile.fullName).toBe('API User');
    expect(valid.body.profile.jobTitle).toBe('Dispatcher');

    const updated = await db.findUserById(user.id);
    expect(updated.fullName).toBe('API User');
  });
});
