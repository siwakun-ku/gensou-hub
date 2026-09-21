import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, startTestEnv, stopTestEnv, clearDatabase, makeUser, User } from './helpers.js';

const VALID = { name: 'Aoi', email: 'aoi@example.com', password: 'password123' };

describe('Auth API', () => {
  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(clearDatabase);

  describe('registration', () => {
    test('registers an account and returns a token', async () => {
      const res = await request(app).post('/api/auth/register').send(VALID).expect(201);

      assert.ok(res.body.token, 'returns a token');
      assert.equal(res.body.user.email, 'aoi@example.com');
      assert.equal(res.body.user.name, 'Aoi');
      assert.equal(res.body.user.role, 'user', 'defaults to the non-admin role');
      assert.equal(res.body.user.password, undefined, 'never returns the password');
    });

    test('stores the password hashed, not in plain text', async () => {
      await request(app).post('/api/auth/register').send(VALID).expect(201);

      const stored = await User.findOne({ email: VALID.email }).select('+password');
      assert.notEqual(stored.password, VALID.password);
      assert.match(stored.password, /^\$2[aby]\$/, 'looks like a bcrypt hash');
    });

    test('lowercases the email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...VALID, email: 'Aoi@Example.COM' })
        .expect(201);
      assert.equal(res.body.user.email, 'aoi@example.com');
    });

    test('rejects a duplicate email with 409', async () => {
      await request(app).post('/api/auth/register').send(VALID).expect(201);
      const res = await request(app).post('/api/auth/register').send(VALID).expect(409);
      assert.match(res.body.message, /already registered/);
    });

    test('rejects a malformed email and a short password', async () => {
      const badEmail = await request(app)
        .post('/api/auth/register')
        .send({ ...VALID, email: 'not-an-email' })
        .expect(400);
      assert.ok(badEmail.body.errors.email);

      const shortPassword = await request(app)
        .post('/api/auth/register')
        .send({ ...VALID, password: 'short' })
        .expect(400);
      assert.ok(shortPassword.body.errors.password);
    });

    test('ignores a role sent in the body — nobody self-promotes to admin', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...VALID, role: 'admin' })
        .expect(201);

      assert.equal(res.body.user.role, 'user');

      const stored = await User.findOne({ email: VALID.email });
      assert.equal(stored.role, 'user');
    });
  });

  describe('login', () => {
    test('logs in with correct credentials', async () => {
      const { user, password } = await makeUser({ email: 'beniko@example.com' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password })
        .expect(200);

      assert.ok(res.body.token);
      assert.equal(res.body.user.id, user._id.toString());
    });

    test('is case-insensitive about the email', async () => {
      const { user, password } = await makeUser({ email: 'beniko@example.com' });
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'BENIKO@EXAMPLE.COM', password })
        .expect(200);
      assert.ok(user);
    });

    test('rejects a wrong password without revealing the account exists', async () => {
      const { user } = await makeUser({ email: 'beniko@example.com' });

      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrong-password' })
        .expect(401);

      const noSuchUser = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' })
        .expect(401);

      assert.equal(wrongPassword.body.message, 'Invalid email or password');
      assert.equal(
        noSuchUser.body.message,
        wrongPassword.body.message,
        'identical message for both failures'
      );
    });

    test('requires both fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'beniko@example.com' })
        .expect(400);
      assert.match(res.body.message, /required/);
    });
  });

  describe('GET /api/auth/me', () => {
    test('returns the signed-in account', async () => {
      const { user, auth } = await makeUser({ role: 'admin' });

      const res = await request(app).get('/api/auth/me').set('Authorization', auth).expect(200);
      assert.equal(res.body.id, user._id.toString());
      assert.equal(res.body.role, 'admin');
    });

    test('401s without a token', async () => {
      const res = await request(app).get('/api/auth/me').expect(401);
      assert.equal(res.body.message, 'Authentication required');
    });

    test('401s on a malformed or wrongly-signed token', async () => {
      await request(app).get('/api/auth/me').set('Authorization', 'Bearer nonsense').expect(401);

      const forged = jwt.sign({ sub: '507f1f77bcf86cd799439011', role: 'admin' }, 'wrong-secret');
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
      assert.equal(res.body.message, 'Invalid token');
    });

    test('401s on an expired token', async () => {
      const { user } = await makeUser();
      const expired = jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
        expiresIn: '-1s',
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
      assert.equal(res.body.message, 'Session expired');
    });

    test('401s when the account was deleted after the token was issued', async () => {
      const { user, auth } = await makeUser();
      await User.deleteOne({ _id: user._id });

      const res = await request(app).get('/api/auth/me').set('Authorization', auth).expect(401);
      assert.match(res.body.message, /no longer exists/);
    });
  });
});
