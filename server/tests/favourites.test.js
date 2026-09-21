import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  app,
  startTestEnv,
  stopTestEnv,
  clearDatabase,
  fakeMp3,
  makeUser,
  makeAdmin,
} from './helpers.js';

describe('Favourites API', () => {
  let admin;
  let listener;
  let album;

  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(async () => {
    await clearDatabase();
    admin = await makeAdmin();
    listener = await makeUser();
    album = await seedAlbum();
  });

  async function seedAlbum() {
    const created = await request(app)
      .post('/api/albums')
      .set('Authorization', admin.auth)
      .field('title', 'Nocturne')
      .field('circle', 'Gensou')
      .field('year', '2021')
      .expect(201);

    for (const [index, title] of ['Opening Theme', 'Closing Theme'].entries()) {
      await request(app)
        .post(`/api/albums/${created.body.id}/tracks`)
        .set('Authorization', admin.auth)
        .field('title', title)
        .field('trackNumber', String(index + 1))
        .field('duration', String(120 + index))
        .attach('audio', fakeMp3(), { filename: `${title}.mp3`, contentType: 'audio/mpeg' })
        .expect(201);
    }

    return (await request(app).get(`/api/albums/${created.body.id}`).expect(200)).body;
  }

  const mark = (track, auth = listener.auth) =>
    request(app)
      .post('/api/favourites')
      .set('Authorization', auth)
      .send({ albumId: album.id, trackId: track.id });

  const unmark = (track, auth = listener.auth) =>
    request(app)
      .delete(`/api/favourites/${album.id}/${track.id}`)
      .set('Authorization', auth);

  const list = (auth = listener.auth) =>
    request(app).get('/api/favourites').set('Authorization', auth);

  const ids = (auth = listener.auth) =>
    request(app).get('/api/favourites/ids').set('Authorization', auth);

  describe('marking', () => {
    test('marks a track and returns it ready to play', async () => {
      await mark(album.tracks[0]).expect(201);

      const res = await list().expect(200);
      assert.equal(res.body.data.length, 1);

      const [track] = res.body.data;
      assert.equal(track.title, 'Opening Theme');
      assert.equal(track.albumTitle, 'Nocturne');
      assert.equal(track.albumCircle, 'Gensou');
      assert.equal(track.year, 2021);
      assert.equal(track.streamUrl, `/api/albums/${album.id}/tracks/${album.tracks[0].id}/stream`);
      assert.ok(track.favouritedAt, 'carries when it was marked');
    });

    test('marking twice leaves one favourite, not two', async () => {
      await mark(album.tracks[0]).expect(201);
      await mark(album.tracks[0]).expect(201);

      const res = await list().expect(200);
      assert.equal(res.body.data.length, 1);
    });

    test('unmarks a track', async () => {
      await mark(album.tracks[0]).expect(201);
      await unmark(album.tracks[0]).expect(204);

      const res = await list().expect(200);
      assert.deepEqual(res.body.data, []);
    });

    test('unmarking something that was never marked is not an error', async () => {
      // The caller wants it unfavourited; it is.
      await unmark(album.tracks[0]).expect(204);
    });

    test('lists the most recently marked first', async () => {
      await mark(album.tracks[0]).expect(201);
      await mark(album.tracks[1]).expect(201);

      const res = await list().expect(200);
      assert.deepEqual(
        res.body.data.map((track) => track.title),
        ['Closing Theme', 'Opening Theme']
      );
    });

    test('totals the duration of what is marked', async () => {
      await mark(album.tracks[0]).expect(201);
      await mark(album.tracks[1]).expect(201);

      const res = await list().expect(200);
      assert.equal(res.body.totalDuration, 241);
    });

    test('refuses a track that does not exist', async () => {
      await request(app)
        .post('/api/favourites')
        .set('Authorization', listener.auth)
        .send({ albumId: album.id, trackId: '507f1f77bcf86cd799439011' })
        .expect(404);

      await request(app)
        .post('/api/favourites')
        .set('Authorization', listener.auth)
        .send({ albumId: album.id })
        .expect(400);
    });

    test('drops marks whose album has been deleted', async () => {
      await mark(album.tracks[0]).expect(201);

      await request(app)
        .delete(`/api/albums/${album.id}`)
        .set('Authorization', admin.auth)
        .expect(204);

      const res = await list().expect(200);
      assert.deepEqual(res.body.data, [], 'a stale mark is hidden, not fatal');
    });
  });

  describe('the id list', () => {
    test('returns just the marked track ids', async () => {
      await mark(album.tracks[0]).expect(201);

      const res = await ids().expect(200);
      assert.deepEqual(res.body.data, [album.tracks[0].id]);
    });

    test('is empty for an account that has marked nothing', async () => {
      const res = await ids().expect(200);
      assert.deepEqual(res.body.data, []);
    });
  });

  describe('access control', () => {
    test('an anonymous visitor cannot reach any favourite route', async () => {
      await request(app).get('/api/favourites').expect(401);
      await request(app).get('/api/favourites/ids').expect(401);
      await request(app)
        .post('/api/favourites')
        .send({ albumId: album.id, trackId: album.tracks[0].id })
        .expect(401);
      await request(app).delete(`/api/favourites/${album.id}/${album.tracks[0].id}`).expect(401);
    });

    test('favourites are private to the account that made them', async () => {
      const other = await makeUser();

      await mark(album.tracks[0]).expect(201);
      await mark(album.tracks[1], other.auth).expect(201);

      const mine = await list().expect(200);
      const theirs = await list(other.auth).expect(200);

      assert.deepEqual(
        mine.body.data.map((t) => t.title),
        ['Opening Theme']
      );
      assert.deepEqual(
        theirs.body.data.map((t) => t.title),
        ['Closing Theme']
      );
    });

    test('one account cannot unmark another account favourite', async () => {
      const other = await makeUser();
      await mark(album.tracks[0]).expect(201);

      // Accepted, because unmarking is idempotent — but it only ever touches
      // the caller's own marks.
      await unmark(album.tracks[0], other.auth).expect(204);

      const res = await list().expect(200);
      assert.equal(res.body.data.length, 1, 'the owner still has it');
    });

    test('the same track can be a favourite of two accounts at once', async () => {
      const other = await makeUser();

      await mark(album.tracks[0]).expect(201);
      await mark(album.tracks[0], other.auth).expect(201);

      assert.equal((await list().expect(200)).body.data.length, 1);
      assert.equal((await list(other.auth).expect(200)).body.data.length, 1);
    });
  });
});
