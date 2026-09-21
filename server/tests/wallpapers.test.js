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

describe('Wallpapers API', () => {
  let admin;

  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(async () => {
    await clearDatabase();
    admin = await makeAdmin();
  });

  function create(fields = {}) {
    const req = request(app)
      .post('/api/wallpapers')
      .set('Authorization', fields.auth ?? admin.auth);

    if (fields.title !== undefined) req.field('title', fields.title);
    if (fields.subtitle !== undefined) req.field('subtitle', fields.subtitle);
    if (fields.order !== undefined) req.field('order', String(fields.order));
    if (fields.isActive !== undefined) req.field('isActive', String(fields.isActive));
    if (fields.linkUrl !== undefined) req.field('linkUrl', fields.linkUrl);
    if (fields.linkLabel !== undefined) req.field('linkLabel', fields.linkLabel);

    return req.attach('image', fakePng(), {
      filename: fields.filename ?? 'hero.png',
      contentType: 'image/png',
    });
  }

  test('uploads a wallpaper and returns its image URL', async () => {
    const res = await create({ title: 'Summer Nights', subtitle: 'New arrivals' }).expect(201);

    assert.equal(res.body.title, 'Summer Nights');
    assert.equal(res.body.subtitle, 'New arrivals');
    assert.equal(res.body.isActive, true, 'new slides are live by default');
    assert.equal(res.body.order, 0, 'first slide goes to position 0');
    assert.ok(
      res.body.imageUrl.startsWith(`/api/wallpapers/${res.body.id}/image?v=`),
      'the image URL carries a version token'
    );
    assert.equal(res.body.fileName, 'hero.png');
    assert.ok(res.body.id);
  });

  test('serves the image to anonymous visitors', async () => {
    const { body: wallpaper } = await create().expect(201);

    const image = await request(app).get(wallpaper.imageUrl).expect(200);
    assert.match(image.headers['content-type'], /image\/png/);
    assert.ok(image.body.length > 0);
  });

  test('requires an image file', async () => {
    const res = await request(app)
      .post('/api/wallpapers')
      .set('Authorization', admin.auth)
      .field('title', 'No image')
      .expect(400);
    assert.match(res.body.message, /"image" file is required/);
  });

  test('rejects a non-image upload', async () => {
    const res = await request(app)
      .post('/api/wallpapers')
      .set('Authorization', admin.auth)
      .attach('image', Buffer.from('nope'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(400);
    assert.match(res.body.message, /Unsupported image type/);
  });

  test('appends each new slide to the end', async () => {
    const first = await create({ title: 'One' }).expect(201);
    const second = await create({ title: 'Two' }).expect(201);
    const third = await create({ title: 'Three' }).expect(201);

    assert.deepEqual([first.body.order, second.body.order, third.body.order], [0, 1, 2]);
  });

  describe('the public hero list', () => {
    test('returns active slides in display order', async () => {
      await create({ title: 'Second', order: 1 }).expect(201);
      await create({ title: 'First', order: 0 }).expect(201);
      await create({ title: 'Third', order: 2 }).expect(201);

      const res = await request(app).get('/api/wallpapers').expect(200);
      assert.deepEqual(
        res.body.map((w) => w.title),
        ['First', 'Second', 'Third']
      );
    });

    test('hides retired slides from anonymous visitors', async () => {
      await create({ title: 'Live' }).expect(201);
      await create({ title: 'Retired', isActive: false }).expect(201);

      const res = await request(app).get('/api/wallpapers').expect(200);
      assert.deepEqual(
        res.body.map((w) => w.title),
        ['Live']
      );
    });

    test('shows retired slides to an admin asking for all', async () => {
      await create({ title: 'Live' }).expect(201);
      await create({ title: 'Retired', isActive: false }).expect(201);

      const res = await request(app)
        .get('/api/wallpapers?all=true')
        .set('Authorization', admin.auth)
        .expect(200);
      assert.equal(res.body.length, 2);
    });

    test('ignores ?all=true from a non-admin', async () => {
      const listener = await makeUser();
      await create({ title: 'Live' }).expect(201);
      await create({ title: 'Retired', isActive: false }).expect(201);

      const asListener = await request(app)
        .get('/api/wallpapers?all=true')
        .set('Authorization', listener.auth)
        .expect(200);
      assert.equal(asListener.body.length, 1);

      const anonymous = await request(app).get('/api/wallpapers?all=true').expect(200);
      assert.equal(anonymous.body.length, 1);
    });

    test('an invalid token is treated as anonymous, not an error', async () => {
      await create({ title: 'Live' }).expect(201);

      const res = await request(app)
        .get('/api/wallpapers')
        .set('Authorization', 'Bearer nonsense')
        .expect(200);
      assert.equal(res.body.length, 1);
    });

    test('is an empty list when nothing has been uploaded', async () => {
      const res = await request(app).get('/api/wallpapers').expect(200);
      assert.deepEqual(res.body, []);
    });
  });

  describe('editing', () => {
    test('updates the caption without touching the image', async () => {
      const { body: wallpaper } = await create({ title: 'Old' }).expect(201);

      const res = await request(app)
        .put(`/api/wallpapers/${wallpaper.id}`)
        .set('Authorization', admin.auth)
        .field('title', 'New')
        .expect(200);

      assert.equal(res.body.title, 'New');
      assert.equal(res.body.imageUrl, wallpaper.imageUrl, 'same image');

      await request(app).get(res.body.imageUrl).expect(200);
    });

    test('retires and restores a slide', async () => {
      const { body: wallpaper } = await create({ title: 'Seasonal' }).expect(201);

      const retired = await request(app)
        .put(`/api/wallpapers/${wallpaper.id}`)
        .set('Authorization', admin.auth)
        .field('isActive', 'false')
        .expect(200);
      assert.equal(retired.body.isActive, false);
      assert.deepEqual((await request(app).get('/api/wallpapers')).body, []);

      await request(app)
        .put(`/api/wallpapers/${wallpaper.id}`)
        .set('Authorization', admin.auth)
        .field('isActive', 'true')
        .expect(200);
      assert.equal((await request(app).get('/api/wallpapers')).body.length, 1);
    });

    test('replaces the image and keeps serving the new one', async () => {
      const { body: wallpaper } = await create({ title: 'Swap' }).expect(201);

      const res = await request(app)
        .put(`/api/wallpapers/${wallpaper.id}`)
        .set('Authorization', admin.auth)
        .attach('image', fakePng(), { filename: 'new-hero.png', contentType: 'image/png' })
        .expect(200);

      assert.equal(res.body.fileName, 'new-hero.png');
      await request(app).get(res.body.imageUrl).expect(200);

      // The URL is addressed by id, so without a version token it would be
      // byte-identical to the old one and a cached browser would never refetch.
      assert.notEqual(
        res.body.imageUrl,
        wallpaper.imageUrl,
        'replacing the image changes its URL'
      );
    });

    test('reorders slides from an array of ids', async () => {
      const a = await create({ title: 'A' }).expect(201);
      const b = await create({ title: 'B' }).expect(201);
      const c = await create({ title: 'C' }).expect(201);

      const res = await request(app)
        .put('/api/wallpapers/reorder')
        .set('Authorization', admin.auth)
        .send({ ids: [c.body.id, a.body.id, b.body.id] })
        .expect(200);

      assert.deepEqual(
        res.body.map((w) => w.title),
        ['C', 'A', 'B']
      );

      const hero = await request(app).get('/api/wallpapers').expect(200);
      assert.deepEqual(
        hero.body.map((w) => w.title),
        ['C', 'A', 'B']
      );
    });

    test('rejects a reorder with a missing id or an empty list', async () => {
      const a = await create({ title: 'A' }).expect(201);

      await request(app)
        .put('/api/wallpapers/reorder')
        .set('Authorization', admin.auth)
        .send({ ids: [] })
        .expect(400);

      await request(app)
        .put('/api/wallpapers/reorder')
        .set('Authorization', admin.auth)
        .send({ ids: [a.body.id, '507f1f77bcf86cd799439011'] })
        .expect(404);
    });

    test('deletes a slide and stops serving its image', async () => {
      const { body: wallpaper } = await create().expect(201);

      await request(app)
        .delete(`/api/wallpapers/${wallpaper.id}`)
        .set('Authorization', admin.auth)
        .expect(204);

      await request(app).get(wallpaper.imageUrl).expect(404);
    });

    test('404s for a wallpaper that does not exist', async () => {
      const res = await request(app).get('/api/wallpapers/507f1f77bcf86cd799439011').expect(404);
      assert.equal(res.body.message, 'Wallpaper not found');
    });
  });

  describe('access control', () => {
    test('an anonymous visitor cannot upload, edit, reorder or delete', async () => {
      const { body: wallpaper } = await create().expect(201);

      await request(app)
        .post('/api/wallpapers')
        .attach('image', fakePng(), { filename: 'x.png', contentType: 'image/png' })
        .expect(401);

      await request(app).put(`/api/wallpapers/${wallpaper.id}`).field('title', 'Hacked').expect(401);
      await request(app).put('/api/wallpapers/reorder').send({ ids: [wallpaper.id] }).expect(401);
      await request(app).delete(`/api/wallpapers/${wallpaper.id}`).expect(401);
    });

    test('a signed-in non-admin is refused with 403', async () => {
      const listener = await makeUser();
      const { body: wallpaper } = await create({ title: 'Original' }).expect(201);

      await create({ title: 'Sneaky', auth: listener.auth }).expect(403);

      await request(app)
        .put(`/api/wallpapers/${wallpaper.id}`)
        .set('Authorization', listener.auth)
        .field('title', 'Hacked')
        .expect(403);

      await request(app)
        .delete(`/api/wallpapers/${wallpaper.id}`)
        .set('Authorization', listener.auth)
        .expect(403);

      const after = await request(app).get('/api/wallpapers').expect(200);
      assert.equal(after.body.length, 1);
      assert.equal(after.body[0].title, 'Original');
    });
  });
});
