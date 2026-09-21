import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  app,
  startTestEnv,
  stopTestEnv,
  clearDatabase,
  fakePng,
  makeUser,
  makeAdmin,
} from './helpers.js';

describe('Albums API', () => {
  let admin;

  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(async () => {
    await clearDatabase();
    admin = await makeAdmin();
  });

  function createAlbum(fields = {}) {
    return request(app)
      .post('/api/albums')
      .set('Authorization', admin.auth)
      .field('title', fields.title ?? 'Nocturne')
      .field('circle', fields.circle ?? 'Gensou')
      .field('year', String(fields.year ?? 2024))
      .field('genre', fields.genre ?? 'Ambient');
  }

  test('GET /api/health reports ok', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.equal(res.body.status, 'ok');
  });

  test('creates an album and returns the serialized shape', async () => {
    const res = await createAlbum().expect(201);

    assert.equal(res.body.title, 'Nocturne');
    assert.equal(res.body.circle, 'Gensou');
    assert.equal(res.body.year, 2024);
    assert.equal(res.body.trackCount, 0);
    assert.equal(res.body.totalDuration, 0);
    assert.equal(res.body.coverUrl, null);
    assert.deepEqual(res.body.tracks, []);
    assert.ok(res.body.id, 'exposes id');
    assert.equal(res.body._id, undefined, 'hides raw _id');
  });

  test('rejects an album without a title or circle', async () => {
    const res = await request(app)
      .post('/api/albums')
      .set('Authorization', admin.auth)
      .field('genre', 'Ambient')
      .expect(400);

    assert.equal(res.body.message, 'Validation failed');
    assert.ok(res.body.errors.title);
    assert.ok(res.body.errors.circle);
  });

  test('rejects a year in the future', async () => {
    const res = await createAlbum({ year: new Date().getFullYear() + 5 }).expect(400);
    assert.ok(res.body.errors.year);
  });

  test('lists albums with pagination metadata', async () => {
    await createAlbum({ title: 'One' }).expect(201);
    await createAlbum({ title: 'Two' }).expect(201);
    await createAlbum({ title: 'Three' }).expect(201);

    const res = await request(app).get('/api/albums?limit=2&page=1').expect(200);
    assert.equal(res.body.data.length, 2);
    assert.deepEqual(res.body.pagination, { page: 1, limit: 2, total: 3, pages: 2 });
  });

  test('searches by title and circle, case-insensitively', async () => {
    await createAlbum({ title: 'Midnight Rain', circle: 'Aoi' }).expect(201);
    await createAlbum({ title: 'Sunrise', circle: 'Beniko' }).expect(201);

    const byTitle = await request(app).get('/api/albums?q=midnight').expect(200);
    assert.equal(byTitle.body.data.length, 1);
    assert.equal(byTitle.body.data[0].title, 'Midnight Rain');

    const byCircle = await request(app).get('/api/albums?q=beniko').expect(200);
    assert.equal(byCircle.body.data.length, 1);
    assert.equal(byCircle.body.data[0].circle, 'Beniko');
  });

  test('filters by genre', async () => {
    await createAlbum({ title: 'A', genre: 'Jazz' }).expect(201);
    await createAlbum({ title: 'B', genre: 'Ambient' }).expect(201);

    const res = await request(app).get('/api/albums?genre=jazz').expect(200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].genre, 'Jazz');
  });

  test('gets, updates and deletes a single album', async () => {
    const { body: album } = await createAlbum().expect(201);

    const fetched = await request(app).get(`/api/albums/${album.id}`).expect(200);
    assert.equal(fetched.body.id, album.id);

    const updated = await request(app)
      .put(`/api/albums/${album.id}`)
      .set('Authorization', admin.auth)
      .field('title', 'Nocturne II')
      .expect(200);
    assert.equal(updated.body.title, 'Nocturne II');
    assert.equal(updated.body.circle, 'Gensou', 'leaves untouched fields alone');

    await request(app)
      .delete(`/api/albums/${album.id}`)
      .set('Authorization', admin.auth)
      .expect(204);
    await request(app).get(`/api/albums/${album.id}`).expect(404);
  });

  describe('editing an album', () => {
    test('changes every field it is given and leaves the rest alone', async () => {
      const { body: album } = await createAlbum().expect(201);

      const res = await request(app)
        .put(`/api/albums/${album.id}`)
        .set('Authorization', admin.auth)
        .field('title', 'Nocturne II')
        .field('circle', 'Gensou Kai')
        .field('year', '2019')
        .field('genre', 'Shoegaze')
        .field('description', 'A second pressing.')
        .expect(200);

      assert.equal(res.body.title, 'Nocturne II');
      assert.equal(res.body.circle, 'Gensou Kai');
      assert.equal(res.body.year, 2019);
      assert.equal(res.body.genre, 'Shoegaze');
      assert.equal(res.body.description, 'A second pressing.');
    });

    test('clears the year when it is sent empty', async () => {
      const { body: album } = await createAlbum().expect(201);

      const res = await request(app)
        .put(`/api/albums/${album.id}`)
        .set('Authorization', admin.auth)
        .field('year', '')
        .expect(200);

      assert.equal(res.body.year, null);
    });

    test('rejects an edit that would empty a required field', async () => {
      const { body: album } = await createAlbum().expect(201);

      const res = await request(app)
        .put(`/api/albums/${album.id}`)
        .set('Authorization', admin.auth)
        .field('circle', '')
        .expect(400);

      assert.ok(res.body.errors.circle);

      // The rejected edit must not have taken.
      const fetched = await request(app).get(`/api/albums/${album.id}`).expect(200);
      assert.equal(fetched.body.circle, 'Gensou');
    });

    test('replaces the cover and stops serving the old one', async () => {
      const { body: album } = await createAlbum()
        .attach('cover', fakePng(), { filename: 'first.png', contentType: 'image/png' })
        .expect(201);

      const replaced = await request(app)
        .put(`/api/albums/${album.id}`)
        .set('Authorization', admin.auth)
        .attach('cover', fakePng(), { filename: 'second.png', contentType: 'image/png' })
        .expect(200);

      // The URL carries a hash of the stored file, so replacing the art has to
      // change it or browsers would keep showing the old cover.
      assert.notEqual(replaced.body.coverUrl, album.coverUrl);
      await request(app).get(`/api/albums/${album.id}/cover`).expect(200);
    });

    test('removes the cover on request', async () => {
      const { body: album } = await createAlbum()
        .attach('cover', fakePng(), { filename: 'art.png', contentType: 'image/png' })
        .expect(201);
      assert.ok(album.coverUrl);

      const res = await request(app)
        .put(`/api/albums/${album.id}`)
        .set('Authorization', admin.auth)
        .field('removeCover', 'true')
        .expect(200);

      assert.equal(res.body.coverUrl, null);
      await request(app).get(`/api/albums/${album.id}/cover`).expect(404);
    });

    test('an edit with no cover field leaves the artwork alone', async () => {
      const { body: album } = await createAlbum()
        .attach('cover', fakePng(), { filename: 'art.png', contentType: 'image/png' })
        .expect(201);

      const res = await request(app)
        .put(`/api/albums/${album.id}`)
        .set('Authorization', admin.auth)
        .field('title', 'Renamed')
        .expect(200);

      assert.equal(res.body.coverUrl, album.coverUrl, 'an untouched file input sends nothing');
    });

    test('only an admin can edit', async () => {
      const listener = await makeUser();
      const { body: album } = await createAlbum().expect(201);

      await request(app).put(`/api/albums/${album.id}`).field('title', 'Hijacked').expect(401);
      await request(app)
        .put(`/api/albums/${album.id}`)
        .set('Authorization', listener.auth)
        .field('title', 'Hijacked')
        .expect(403);
    });
  });

  test('returns 404 for a missing album and 400 for a malformed id', async () => {
    const missing = await request(app).get('/api/albums/507f1f77bcf86cd799439011').expect(404);
    assert.equal(missing.body.message, 'Album not found');

    const malformed = await request(app).get('/api/albums/not-an-id').expect(400);
    assert.match(malformed.body.message, /Invalid _id/);
  });

  describe('access control', () => {
    test('anyone can browse the library without signing in', async () => {
      await createAlbum().expect(201);
      const res = await request(app).get('/api/albums').expect(200);
      assert.equal(res.body.data.length, 1);
    });

    test('an anonymous visitor cannot create, update or delete', async () => {
      const { body: album } = await createAlbum().expect(201);

      const create = await request(app)
        .post('/api/albums')
        .field('title', 'Sneaky')
        .field('circle', 'Nobody')
        .expect(401);
      assert.equal(create.body.message, 'Authentication required');

      await request(app).put(`/api/albums/${album.id}`).field('title', 'Hacked').expect(401);
      await request(app).delete(`/api/albums/${album.id}`).expect(401);
    });

    test('a signed-in non-admin is refused with 403', async () => {
      const listener = await makeUser();
      const { body: album } = await createAlbum().expect(201);

      const create = await request(app)
        .post('/api/albums')
        .set('Authorization', listener.auth)
        .field('title', 'Sneaky')
        .field('circle', 'Nobody')
        .expect(403);
      assert.match(create.body.message, /requires an admin account/);

      await request(app)
        .put(`/api/albums/${album.id}`)
        .set('Authorization', listener.auth)
        .field('title', 'Hacked')
        .expect(403);

      await request(app)
        .delete(`/api/albums/${album.id}`)
        .set('Authorization', listener.auth)
        .expect(403);
    });

    test('a rejected write changes nothing', async () => {
      const listener = await makeUser();
      const { body: album } = await createAlbum().expect(201);

      await request(app)
        .put(`/api/albums/${album.id}`)
        .set('Authorization', listener.auth)
        .field('title', 'Hacked')
        .expect(403);

      const after = await request(app).get(`/api/albums/${album.id}`).expect(200);
      assert.equal(after.body.title, 'Nocturne');
    });
  });

  describe('cover art', () => {
    function createWithCover(title = 'Covered') {
      return request(app)
        .post('/api/albums')
        .set('Authorization', admin.auth)
        .field('title', title)
        .field('circle', 'Gensou')
        .attach('cover', fakePng(), { filename: 'cover.png', contentType: 'image/png' });
    }

    test('uploads a cover and serves it back', async () => {
      const created = await createWithCover().expect(201);

      assert.ok(
        created.body.coverUrl.startsWith(`/api/albums/${created.body.id}/cover?v=`),
        'the cover URL carries a version token so a replacement busts the cache'
      );

      const cover = await request(app).get(created.body.coverUrl).expect(200);
      assert.match(cover.headers['content-type'], /image\/png/);
      assert.ok(cover.body.length > 0);
    });

    test('serves a cover to anonymous visitors', async () => {
      const created = await createWithCover().expect(201);
      await request(app).get(created.body.coverUrl).expect(200);
    });

    test('404s when the album has no cover', async () => {
      const { body: album } = await createAlbum().expect(201);
      const res = await request(app).get(`/api/albums/${album.id}/cover`).expect(404);
      assert.equal(res.body.message, 'Album has no cover');
    });

    test('rejects a non-image cover', async () => {
      const res = await request(app)
        .post('/api/albums')
        .set('Authorization', admin.auth)
        .field('title', 'Bad cover')
        .field('circle', 'Gensou')
        .attach('cover', Buffer.from('not an image'), {
          filename: 'evil.txt',
          contentType: 'text/plain',
        })
        .expect(400);
      assert.match(res.body.message, /Unsupported image type/);
    });
  });
});
