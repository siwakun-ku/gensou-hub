import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  app,
  startTestEnv,
  stopTestEnv,
  clearDatabase,
  fakeMp3,
  fakePng,
  makeUser,
  makeAdmin,
} from './helpers.js';

describe('Recommendations API', () => {
  let admin;

  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(async () => {
    await clearDatabase();
    admin = await makeAdmin();
  });

  async function makeAlbum(title = 'Nocturne', { withCover = false } = {}) {
    const req = request(app)
      .post('/api/albums')
      .set('Authorization', admin.auth)
      .field('title', title)
      .field('circle', 'Gensou');

    if (withCover) {
      req.attach('cover', fakePng(), { filename: 'cover.png', contentType: 'image/png' });
    }

    const res = await req.expect(201);
    return res.body;
  }

  async function addTrack(albumId, title, trackNumber) {
    const res = await request(app)
      .post(`/api/albums/${albumId}/tracks`)
      .set('Authorization', admin.auth)
      .field('title', title)
      .field('trackNumber', String(trackNumber))
      .attach('audio', fakeMp3(), { filename: 'a.mp3', contentType: 'audio/mpeg' })
      .expect(201);
    return res.body;
  }

  /** An album with `count` tracks on it. */
  async function albumWithTracks(count, title = 'Nocturne', options) {
    const album = await makeAlbum(title, options);
    const tracks = [];
    for (let i = 1; i <= count; i += 1) {
      tracks.push(await addTrack(album.id, `Track ${i}`, i));
    }
    return { album, tracks };
  }

  const setSettings = (body) =>
    request(app).put('/api/recommendations/settings').set('Authorization', admin.auth).send(body);

  describe('defaults', () => {
    test('starts in random mode without any configuration', async () => {
      const res = await request(app).get('/api/recommendations').expect(200);
      assert.equal(res.body.mode, 'random');
      assert.equal(res.body.limit, 6);
      assert.deepEqual(res.body.items, []);
    });

    test('the settings endpoint creates the document once and reuses it', async () => {
      const first = await request(app)
        .get('/api/recommendations/settings')
        .set('Authorization', admin.auth)
        .expect(200);
      assert.deepEqual(first.body, { mode: 'random', limit: 6, picks: [] });

      await setSettings({ limit: 3 }).expect(200);

      const second = await request(app)
        .get('/api/recommendations/settings')
        .set('Authorization', admin.auth)
        .expect(200);
      assert.equal(second.body.limit, 3, 'reads back the same document');
    });
  });

  describe('random mode', () => {
    test('returns tracks from across the library, capped at the limit', async () => {
      await albumWithTracks(4, 'One');
      await albumWithTracks(4, 'Two');
      await setSettings({ mode: 'random', limit: 3 }).expect(200);

      const res = await request(app).get('/api/recommendations').expect(200);
      assert.equal(res.body.mode, 'random');
      assert.equal(res.body.items.length, 3);
    });

    test('returns everything available when the limit exceeds the library', async () => {
      await albumWithTracks(2);
      await setSettings({ mode: 'random', limit: 10 }).expect(200);

      const res = await request(app).get('/api/recommendations').expect(200);
      assert.equal(res.body.items.length, 2);
    });

    test('is empty when albums exist but have no tracks', async () => {
      await makeAlbum('Empty');
      await setSettings({ mode: 'random' }).expect(200);

      const res = await request(app).get('/api/recommendations').expect(200);
      assert.deepEqual(res.body.items, []);
    });

    test('each item carries what a card needs to render and play', async () => {
      const { album } = await albumWithTracks(1, 'Nocturne', { withCover: true });
      await setSettings({ mode: 'random', limit: 1 }).expect(200);

      const res = await request(app).get('/api/recommendations').expect(200);
      const [item] = res.body.items;

      assert.equal(item.title, 'Track 1');
      assert.equal(item.albumId, album.id);
      assert.equal(item.albumTitle, 'Nocturne');
      assert.equal(item.albumCircle, 'Gensou');
      assert.ok(item.coverUrl.startsWith(`/api/albums/${album.id}/cover?v=`));
      assert.equal(item.streamUrl, `/api/albums/${album.id}/tracks/${item.id}/stream`);
      assert.equal(item.downloadUrl, `/api/albums/${album.id}/tracks/${item.id}/download`);

      // The URLs must actually work, not merely look right.
      await request(app).get(item.streamUrl).expect(200);
      await request(app).get(item.coverUrl).expect(200);
    });

    test('reports a null cover for an album without artwork', async () => {
      await albumWithTracks(1);
      await setSettings({ mode: 'random', limit: 1 }).expect(200);

      const res = await request(app).get('/api/recommendations').expect(200);
      assert.equal(res.body.items[0].coverUrl, null);
    });
  });

  describe('fixed mode', () => {
    test('returns exactly the chosen tracks, in the chosen order', async () => {
      const { album, tracks } = await albumWithTracks(3);

      await setSettings({
        mode: 'fixed',
        picks: [
          { albumId: album.id, trackId: tracks[2].id },
          { albumId: album.id, trackId: tracks[0].id },
        ],
      }).expect(200);

      const res = await request(app).get('/api/recommendations').expect(200);
      assert.equal(res.body.mode, 'fixed');
      assert.deepEqual(
        res.body.items.map((item) => item.title),
        ['Track 3', 'Track 1']
      );
    });

    test('picks tracks from more than one album', async () => {
      const one = await albumWithTracks(1, 'One');
      const two = await albumWithTracks(1, 'Two');

      await setSettings({
        mode: 'fixed',
        picks: [
          { albumId: two.album.id, trackId: two.tracks[0].id },
          { albumId: one.album.id, trackId: one.tracks[0].id },
        ],
      }).expect(200);

      const res = await request(app).get('/api/recommendations').expect(200);
      assert.deepEqual(
        res.body.items.map((item) => item.albumTitle),
        ['Two', 'One']
      );
    });

    test('is empty when nothing has been picked', async () => {
      await albumWithTracks(2);
      await setSettings({ mode: 'fixed', picks: [] }).expect(200);

      const res = await request(app).get('/api/recommendations').expect(200);
      assert.deepEqual(res.body.items, []);
    });

    test('skips a pick whose track was deleted afterwards', async () => {
      const { album, tracks } = await albumWithTracks(2);

      await setSettings({
        mode: 'fixed',
        picks: [
          { albumId: album.id, trackId: tracks[0].id },
          { albumId: album.id, trackId: tracks[1].id },
        ],
      }).expect(200);

      await request(app)
        .delete(`/api/albums/${album.id}/tracks/${tracks[0].id}`)
        .set('Authorization', admin.auth)
        .expect(204);

      const res = await request(app).get('/api/recommendations').expect(200);
      assert.deepEqual(
        res.body.items.map((item) => item.title),
        ['Track 2'],
        'the surviving pick still shows'
      );
    });

    test('skips a pick whose whole album was deleted afterwards', async () => {
      const gone = await albumWithTracks(1, 'Gone');
      const kept = await albumWithTracks(1, 'Kept');

      await setSettings({
        mode: 'fixed',
        picks: [
          { albumId: gone.album.id, trackId: gone.tracks[0].id },
          { albumId: kept.album.id, trackId: kept.tracks[0].id },
        ],
      }).expect(200);

      await request(app)
        .delete(`/api/albums/${gone.album.id}`)
        .set('Authorization', admin.auth)
        .expect(204);

      const res = await request(app).get('/api/recommendations').expect(200);
      assert.deepEqual(
        res.body.items.map((item) => item.albumTitle),
        ['Kept']
      );
    });

    test('honours the limit', async () => {
      const { album, tracks } = await albumWithTracks(3);

      await setSettings({
        mode: 'fixed',
        limit: 2,
        picks: tracks.map((track) => ({ albumId: album.id, trackId: track.id })),
      }).expect(200);

      const res = await request(app).get('/api/recommendations').expect(200);
      assert.equal(res.body.items.length, 2);
    });
  });

  describe('changing the settings', () => {
    test('switching to random keeps the picks for later', async () => {
      const { album, tracks } = await albumWithTracks(1);

      await setSettings({
        mode: 'fixed',
        picks: [{ albumId: album.id, trackId: tracks[0].id }],
      }).expect(200);

      const switched = await setSettings({ mode: 'random' }).expect(200);
      assert.equal(switched.body.picks.length, 1, 'the selection survives the toggle');

      const back = await setSettings({ mode: 'fixed' }).expect(200);
      assert.equal(back.body.picks.length, 1);
    });

    test('rejects an unknown mode', async () => {
      const res = await setSettings({ mode: 'shuffle' }).expect(400);
      assert.match(res.body.message, /mode must be one of/);
    });

    test('rejects a limit outside the allowed range', async () => {
      await setSettings({ limit: 0 }).expect(400);
      await setSettings({ limit: 99 }).expect(400);
    });

    test('rejects a pick that does not exist', async () => {
      const { album } = await albumWithTracks(1);

      const badTrack = await setSettings({
        picks: [{ albumId: album.id, trackId: '507f1f77bcf86cd799439011' }],
      }).expect(404);
      assert.match(badTrack.body.message, /No such track/);

      await setSettings({
        picks: [{ albumId: '507f1f77bcf86cd799439011', trackId: '507f1f77bcf86cd799439011' }],
      }).expect(404);
    });

    test('rejects a malformed picks payload', async () => {
      await setSettings({ picks: 'not-an-array' }).expect(400);

      const missingField = await setSettings({ picks: [{ albumId: 'x' }] }).expect(400);
      assert.match(missingField.body.message, /needs an albumId and a trackId/);
    });

    test('a rejected update leaves the previous settings intact', async () => {
      await setSettings({ mode: 'fixed', limit: 4 }).expect(200);
      await setSettings({ mode: 'shuffle' }).expect(400);

      const res = await request(app)
        .get('/api/recommendations/settings')
        .set('Authorization', admin.auth)
        .expect(200);
      assert.equal(res.body.mode, 'fixed');
      assert.equal(res.body.limit, 4);
    });
  });

  describe('access control', () => {
    test('anyone can read the recommendations without signing in', async () => {
      await albumWithTracks(1);
      await request(app).get('/api/recommendations').expect(200);
    });

    test('only an admin can read the settings', async () => {
      const listener = await makeUser();

      await request(app).get('/api/recommendations/settings').expect(401);
      await request(app)
        .get('/api/recommendations/settings')
        .set('Authorization', listener.auth)
        .expect(403);
    });

    test('only an admin can change the settings', async () => {
      const listener = await makeUser();

      await request(app).put('/api/recommendations/settings').send({ mode: 'fixed' }).expect(401);

      const refused = await request(app)
        .put('/api/recommendations/settings')
        .set('Authorization', listener.auth)
        .send({ mode: 'fixed' })
        .expect(403);
      assert.match(refused.body.message, /requires an admin account/);

      const res = await request(app).get('/api/recommendations').expect(200);
      assert.equal(res.body.mode, 'random', 'unchanged');
    });
  });
});
