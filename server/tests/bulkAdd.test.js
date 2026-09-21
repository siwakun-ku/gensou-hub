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

describe('Adding several tracks at once', () => {
  let admin;
  let listener;
  let album;
  let other;

  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(async () => {
    await clearDatabase();
    admin = await makeAdmin();
    listener = await makeUser();
    album = await seedAlbum('Nocturne', ['One', 'Two', 'Three']);
    other = await seedAlbum('Reverie', ['Elsewhere']);
  });

  async function seedAlbum(title, trackTitles) {
    const created = await request(app)
      .post('/api/albums')
      .set('Authorization', admin.auth)
      .field('title', title)
      .field('circle', 'Gensou')
      .expect(201);

    for (const [index, trackTitle] of trackTitles.entries()) {
      await request(app)
        .post(`/api/albums/${created.body.id}/tracks`)
        .set('Authorization', admin.auth)
        .field('title', trackTitle)
        .field('trackNumber', String(index + 1))
        .field('duration', '100')
        .attach('audio', fakeMp3(), { filename: `${trackTitle}.mp3`, contentType: 'audio/mpeg' })
        .expect(201);
    }

    return (await request(app).get(`/api/albums/${created.body.id}`).expect(200)).body;
  }

  const itemsFor = (from, ...titles) =>
    titles.map((title) => ({
      albumId: from.id,
      trackId: from.tracks.find((track) => track.title === title).id,
    }));

  async function makePlaylist(name = 'Evening') {
    const res = await request(app)
      .post('/api/playlists')
      .set('Authorization', listener.auth)
      .send({ name })
      .expect(201);
    return res.body;
  }

  const bulkToPlaylist = (playlistId, body, auth = listener.auth) =>
    request(app)
      .post(`/api/playlists/${playlistId}/items/bulk`)
      .set('Authorization', auth)
      .send(body);

  const bulkToFavourites = (body, auth = listener.auth) =>
    request(app).post('/api/favourites/bulk').set('Authorization', auth).send(body);

  const favouriteIds = (auth = listener.auth) =>
    request(app).get('/api/favourites/ids').set('Authorization', auth);

  describe('onto a playlist', () => {
    test('adds a whole album from its id alone', async () => {
      const playlist = await makePlaylist();

      const res = await bulkToPlaylist(playlist.id, { albumId: album.id }).expect(201);
      assert.equal(res.body.added, 3);
      assert.equal(res.body.skipped, 0);
      assert.deepEqual(
        res.body.playlist.tracks.map((track) => track.title),
        ['One', 'Two', 'Three'],
        'in playing order'
      );
    });

    test('adds a hand-picked few, in the order given', async () => {
      const playlist = await makePlaylist();

      const res = await bulkToPlaylist(playlist.id, {
        items: [...itemsFor(album, 'Three', 'One'), ...itemsFor(other, 'Elsewhere')],
      }).expect(201);

      assert.equal(res.body.added, 3);
      assert.deepEqual(
        res.body.playlist.tracks.map((track) => track.title),
        ['Three', 'One', 'Elsewhere']
      );
    });

    test('counts what was already there instead of refusing or doubling it', async () => {
      const playlist = await makePlaylist();
      await bulkToPlaylist(playlist.id, { items: itemsFor(album, 'One') }).expect(201);

      const res = await bulkToPlaylist(playlist.id, { albumId: album.id }).expect(201);
      assert.equal(res.body.added, 2);
      assert.equal(res.body.skipped, 1);
      assert.equal(res.body.playlist.trackCount, 3, 'no duplicate entry');
    });

    test('the same track named twice in one request is added once', async () => {
      const playlist = await makePlaylist();

      const res = await bulkToPlaylist(playlist.id, {
        items: [...itemsFor(album, 'One'), ...itemsFor(album, 'One')],
      }).expect(201);

      assert.equal(res.body.added, 1);
      assert.equal(res.body.playlist.trackCount, 1);
    });

    test('an empty album adds nothing and is not an error', async () => {
      const empty = (
        await request(app)
          .post('/api/albums')
          .set('Authorization', admin.auth)
          .field('title', 'Silence')
          .field('circle', 'Gensou')
          .expect(201)
      ).body;
      const playlist = await makePlaylist();

      const res = await bulkToPlaylist(playlist.id, { albumId: empty.id }).expect(201);
      assert.equal(res.body.added, 0);
    });

    /*
     * All of it or none of it: a request naming a track that does not exist is
     * a mistake worth reporting, not something to half-apply and leave the
     * caller guessing which half landed.
     */
    test('one bad reference writes nothing at all', async () => {
      const playlist = await makePlaylist();

      await bulkToPlaylist(playlist.id, {
        items: [...itemsFor(album, 'One'), { albumId: album.id, trackId: '507f1f77bcf86cd799439011' }],
      }).expect(404);

      const after = await request(app)
        .get(`/api/playlists/${playlist.id}`)
        .set('Authorization', listener.auth)
        .expect(200);
      assert.equal(after.body.trackCount, 0);
    });

    test('refuses a malformed or oversized request', async () => {
      const playlist = await makePlaylist();

      await bulkToPlaylist(playlist.id, {}).expect(400);
      await bulkToPlaylist(playlist.id, { items: [] }).expect(400);
      await bulkToPlaylist(playlist.id, { items: [{ albumId: album.id }] }).expect(400);
      await bulkToPlaylist(playlist.id, {
        items: Array.from({ length: 301 }, () => itemsFor(album, 'One')[0]),
      }).expect(400);
    });

    test('refuses an album that does not exist', async () => {
      const playlist = await makePlaylist();
      await bulkToPlaylist(playlist.id, { albumId: '507f1f77bcf86cd799439011' }).expect(404);
    });

    test('cannot be pointed at somebody else playlist', async () => {
      const playlist = await makePlaylist();
      const stranger = await makeUser();

      await bulkToPlaylist(playlist.id, { albumId: album.id }, stranger.auth).expect(404);
      await request(app)
        .post(`/api/playlists/${playlist.id}/items/bulk`)
        .send({ albumId: album.id })
        .expect(401);
    });

    test('is refused for the built-in favourites playlist', async () => {
      // It is filled by starring tracks, not by adding entries to it.
      await bulkToPlaylist('favourites', { albumId: album.id }).expect(400);
    });
  });

  describe('onto favourites', () => {
    test('stars a whole album from its id alone', async () => {
      const res = await bulkToFavourites({ albumId: album.id }).expect(201);

      assert.equal(res.body.added, 3);
      assert.equal(res.body.skipped, 0);
      assert.equal(res.body.trackIds.length, 3);

      const ids = await favouriteIds().expect(200);
      assert.equal(ids.body.data.length, 3);
    });

    test('stars a hand-picked few', async () => {
      const res = await bulkToFavourites({
        items: [...itemsFor(album, 'Two'), ...itemsFor(other, 'Elsewhere')],
      }).expect(201);

      assert.equal(res.body.added, 2);

      const listed = await request(app)
        .get('/api/favourites')
        .set('Authorization', listener.auth)
        .expect(200);
      assert.deepEqual(
        listed.body.data.map((track) => track.title).sort(),
        ['Elsewhere', 'Two']
      );
    });

    test('counts what was already starred rather than reporting it as new', async () => {
      await bulkToFavourites({ items: itemsFor(album, 'One') }).expect(201);

      const res = await bulkToFavourites({ albumId: album.id }).expect(201);
      assert.equal(res.body.added, 2);
      assert.equal(res.body.skipped, 1);

      const ids = await favouriteIds().expect(200);
      assert.equal(ids.body.data.length, 3, 'still one mark per track');
    });

    test('the same track named twice in one request is starred once', async () => {
      const res = await bulkToFavourites({
        items: [...itemsFor(album, 'One'), ...itemsFor(album, 'One')],
      }).expect(201);

      assert.equal(res.body.added, 1);
      assert.equal((await favouriteIds().expect(200)).body.data.length, 1);
    });

    test('hands back every track asked for, marked or already marked', async () => {
      await bulkToFavourites({ items: itemsFor(album, 'One') }).expect(201);

      const res = await bulkToFavourites({ albumId: album.id }).expect(201);
      assert.equal(res.body.trackIds.length, 3, 'so the client can light all three stars');
    });

    test('one bad reference stars nothing at all', async () => {
      await bulkToFavourites({
        items: [...itemsFor(album, 'One'), { albumId: album.id, trackId: '507f1f77bcf86cd799439011' }],
      }).expect(404);

      assert.deepEqual((await favouriteIds().expect(200)).body.data, []);
    });

    test('marks are private to the account that made them', async () => {
      const stranger = await makeUser();
      await bulkToFavourites({ albumId: album.id }).expect(201);

      assert.deepEqual((await favouriteIds(stranger.auth).expect(200)).body.data, []);
    });

    test('an anonymous visitor is refused', async () => {
      await request(app).post('/api/favourites/bulk').send({ albumId: album.id }).expect(401);
    });
  });

  describe('unstarring several at once', () => {
    const bulkRemove = (body, auth = listener.auth) =>
      request(app).delete('/api/favourites/bulk').set('Authorization', auth).send(body);

    test('unstars a whole album from its id alone', async () => {
      await bulkToFavourites({ albumId: album.id }).expect(201);

      const res = await bulkRemove({ albumId: album.id }).expect(200);
      assert.equal(res.body.removed, 3);
      assert.deepEqual((await favouriteIds().expect(200)).body.data, []);
    });

    test('unstars a hand-picked few and leaves the rest', async () => {
      await bulkToFavourites({ albumId: album.id }).expect(201);

      const res = await bulkRemove({ items: itemsFor(album, 'One', 'Two') }).expect(200);
      assert.equal(res.body.removed, 2);

      const listed = await request(app)
        .get('/api/favourites')
        .set('Authorization', listener.auth)
        .expect(200);
      assert.deepEqual(
        listed.body.data.map((track) => track.title),
        ['Three']
      );
    });

    test('unstarring what was never starred is not an error', async () => {
      // The caller wants these unfavourited; they are.
      const res = await bulkRemove({ albumId: album.id }).expect(200);
      assert.equal(res.body.removed, 0);
    });

    test('counts only what was actually removed', async () => {
      await bulkToFavourites({ items: itemsFor(album, 'One') }).expect(201);

      const res = await bulkRemove({ albumId: album.id }).expect(200);
      assert.equal(res.body.removed, 1);
      assert.equal(res.body.trackIds.length, 3, 'but names every track asked for');
    });

    test('never reaches another account marks', async () => {
      const stranger = await makeUser();
      await bulkToFavourites({ albumId: album.id }).expect(201);
      await bulkToFavourites({ albumId: album.id }, stranger.auth).expect(201);

      await bulkRemove({ albumId: album.id }).expect(200);

      assert.deepEqual((await favouriteIds().expect(200)).body.data, []);
      assert.equal(
        (await favouriteIds(stranger.auth).expect(200)).body.data.length,
        3,
        'the other account keeps theirs'
      );
    });

    test('an empty album removes nothing and is not an error', async () => {
      const empty = (
        await request(app)
          .post('/api/albums')
          .set('Authorization', admin.auth)
          .field('title', 'Silence')
          .field('circle', 'Gensou')
          .expect(201)
      ).body;

      const res = await bulkRemove({ albumId: empty.id }).expect(200);
      assert.equal(res.body.removed, 0);
    });

    test('an anonymous visitor is refused', async () => {
      await request(app).delete('/api/favourites/bulk').send({ albumId: album.id }).expect(401);
    });
  });
});
