import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, startTestEnv, stopTestEnv, clearDatabase } from './helpers.js';
import {
  isAllowedOrigin,
  isLocalHostname,
  isSameOrigin,
  configuredOrigins,
} from '../src/config/cors.js';

const DEFAULT_ENV = { CLIENT_ORIGIN: 'http://localhost:5173' };

describe('CORS policy', () => {
  describe('isLocalHostname', () => {
    test('accepts loopback and mDNS names', () => {
      for (const host of ['localhost', '127.0.0.1', '::1', 'my-laptop.local', 'PHONE.LOCAL']) {
        assert.equal(isLocalHostname(host), true, host);
      }
    });

    test('accepts every private IPv4 range', () => {
      for (const host of ['192.168.1.20', '10.0.0.5', '172.16.4.1', '172.31.255.254', '169.254.1.1']) {
        assert.equal(isLocalHostname(host), true, host);
      }
    });

    test('rejects public addresses, including 172 ranges that are not private', () => {
      for (const host of ['172.15.0.1', '172.32.0.1', '8.8.8.8', 'example.com', '']) {
        assert.equal(isLocalHostname(host), false, host);
      }
    });
  });

  describe('isAllowedOrigin', () => {
    test('allows a request with no Origin header', () => {
      // curl, mobile apps and same-origin fetches send no Origin.
      assert.equal(isAllowedOrigin(undefined, DEFAULT_ENV), true);
    });

    test('allows the configured origin, with or without a trailing slash', () => {
      assert.equal(isAllowedOrigin('http://localhost:5173', DEFAULT_ENV), true);
      assert.equal(isAllowedOrigin('http://localhost:5173/', DEFAULT_ENV), true);
    });

    test('allows any LAN device on any port', () => {
      assert.equal(isAllowedOrigin('http://192.168.1.20:5173', DEFAULT_ENV), true);
      assert.equal(isAllowedOrigin('http://192.168.1.20:4173', DEFAULT_ENV), true);
      assert.equal(isAllowedOrigin('http://10.0.0.5:3000', DEFAULT_ENV), true);
      assert.equal(isAllowedOrigin('http://desktop.local:5173', DEFAULT_ENV), true);
    });

    test('rejects an outside origin', () => {
      assert.equal(isAllowedOrigin('https://evil.example.com', DEFAULT_ENV), false);
      assert.equal(isAllowedOrigin('http://172.32.0.1:5173', DEFAULT_ENV), false);
    });

    test('rejects a value that is not a URL', () => {
      assert.equal(isAllowedOrigin('not-an-origin', DEFAULT_ENV), false);
    });

    test('honours a comma-separated allow-list', () => {
      const env = { CLIENT_ORIGIN: 'http://localhost:5173, https://gensou.example.com' };
      assert.equal(isAllowedOrigin('https://gensou.example.com', env), true);
      assert.equal(isAllowedOrigin('https://other.example.com', env), false);
    });

    test('ALLOW_LAN_ORIGINS=false locks it down to the configured list', () => {
      const env = { ...DEFAULT_ENV, ALLOW_LAN_ORIGINS: 'false' };
      assert.equal(isAllowedOrigin('http://localhost:5173', env), true);
      assert.equal(isAllowedOrigin('http://192.168.1.20:5173', env), false);
    });

    test('a wildcard allows anything', () => {
      assert.equal(isAllowedOrigin('https://anywhere.example.com', { CLIENT_ORIGIN: '*' }), true);
    });

    test('defaults to the dev client when CLIENT_ORIGIN is unset', () => {
      assert.deepEqual(configuredOrigins({}), ['http://localhost:5173']);
    });
  });

  describe('isSameOrigin', () => {
    test('matches an origin to the host it is calling', () => {
      assert.equal(isSameOrigin('https://gensou-hub-one.vercel.app', 'gensou-hub-one.vercel.app'), true);
      assert.equal(isSameOrigin('http://localhost:5000', 'localhost:5000'), true);
    });

    test('does not match a different host or port', () => {
      assert.equal(isSameOrigin('https://evil.example.com', 'gensou-hub-one.vercel.app'), false);
      assert.equal(isSameOrigin('http://localhost:5173', 'localhost:5000'), false);
    });

    test('is false when either side is missing or malformed', () => {
      assert.equal(isSameOrigin(undefined, 'gensou-hub-one.vercel.app'), false);
      assert.equal(isSameOrigin('https://gensou-hub-one.vercel.app', undefined), false);
      assert.equal(isSameOrigin('not-an-origin', 'gensou-hub-one.vercel.app'), false);
    });
  });

  describe('over HTTP', () => {
    before(startTestEnv);
    after(stopTestEnv);
    beforeEach(clearDatabase);

    test('a LAN origin gets an allow header back', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://192.168.1.20:5173')
        .expect(200);

      assert.equal(res.headers['access-control-allow-origin'], 'http://192.168.1.20:5173');
    });

    test('a request with no Origin still works', async () => {
      await request(app).get('/api/health').expect(200);
    });

    test('an outside origin gets no allow header', async () => {
      const res = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    });

    // A deployment serving the client and the API from one domain, whose URL
    // is on no list: its own login POST must still get through.
    test('a same-origin POST is allowed without being configured', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Host', 'gensou-hub-one.vercel.app')
        .set('Origin', 'https://gensou-hub-one.vercel.app')
        .send({ email: 'nobody@example.com', password: 'wrong-password' });

      // Refused as a bad login, not as a bad origin.
      assert.notEqual(res.status, 403);
      assert.equal(res.headers['access-control-allow-origin'], 'https://gensou-hub-one.vercel.app');
    });

    test('an outside origin calling that deployment is still refused', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Host', 'gensou-hub-one.vercel.app')
        .set('Origin', 'https://evil.example.com')
        .send({ email: 'nobody@example.com', password: 'wrong-password' });

      assert.equal(res.status, 403);
    });
  });
});
