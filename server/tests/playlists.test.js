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

describe('Playlists API', () => {
  let admin;
  let owner;
  let album;

  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(async () => {
    await clearDatabase();
    admin = await makeAdmin();
    owner = await makeUser();
    album = await seedAlbum();
  });

  /** An album with two tracks, which every playlist test draws from. */
  async function seedAlbum() {
    const res = await request(app)
      .post('/api/albums')
      .set('Authorization', admin.auth)
      .field('title', 'Nocturne')
      .field('circle', 'Gensou')
      .expect(201);

    for (const [index, title] of ['Opening Theme', 'Closing Theme'].entries()) {
      await request(app)
        .post(`/api/albums/${res.body.id}/tracks`)
        .set('Authorization', admin.auth)
        .field('title', title)
        .field('trackNumber', String(index + 1))
        .field('duration', String(120 + index))
        .attach('audio', fakeMp3(), { filename: `${title}.mp3`, contentType: 'audio/mpeg' })
        .expect(201);
    }

    return (await request(app).get(`/api/albums/${res.body.id}`).expect(200)).body;
  }

  function createPlaylist(fields = {}, auth = owner.auth) {
    return request(app)
      .post('/api/playlists')
      .set('Authorization', auth)
      .send({ name: 'Late night', ...fields });
  }

  function addTrack(playlistId, track, auth = owner.auth) {
    return request(app)
      .post(`/api/playlists/${playlistId}/items`)
      .set('Authorization', auth)
      .send({ albumId: album.id, trackId: track.id });
  }

  describe('creating', () => {
    test('creates an empty playlist', async () => {
      const res = await createPlaylist({ description: 'For the small hours' }).expect(201);

      assert.equal(res.body.name, 'Late night');
      assert.equal(res.body.description, 'For the small hours');
      assert.equal(res.body.trackCount, 0);
      assert.deepEqual(res.body.tracks, []);
    });

    test('rejects a playlist with no name', async () => {
      const res = await createPlaylist({ name: '' }).expect(400);
      assert.match(res.body.message, /Validation failed/);
    });

    test('rejects a second playlist with the same name', async () => {
      await createPlaylist().expect(201);
      const res = await createPlaylist().expect(409);

      assert.match(res.body.message, /already have a playlist with that name/);
    });

    test('lets a different account reuse the name', async () => {
      const other = await makeUser();

      await createPlaylist().expect(201);
      await createPlaylist({}, other.auth).expect(201);
    });
  });

  describe('entries', () => {
    test('adds a track and returns it ready to play', async () => {
      const playlist = (await createPlaylist().expect(201)).body;
      const res = await addTrack(playlist.id, album.tracks[0]).expect(201);

      assert.equal(res.body.trackCount, 1);

      const [entry] = res.body.tracks;
      assert.equal(entry.title, 'Opening Theme');
      assert.equal(entry.albumId, album.id);
      assert.equal(entry.albumTitle, 'Nocturne');
      assert.equal(entry.streamUrl, `/api/albums/${album.id}/tracks/${album.tracks[0].id}/stream`);
      assert.ok(entry.itemId, 'carries the entry id used to remove or reorder it');
    });

    test('keeps entries in the order they were added and totals their duration', async () => {
      const playlist = (await createPlaylist().expect(201)).body;
      await addTrack(playlist.id, album.tracks[1]).expect(201);
      const res = await addTrack(playlist.id, album.tracks[0]).expect(201);

      assert.deepEqual(
        res.body.tracks.map((t) => t.title),
        ['Closing Theme', 'Opening Theme']
      );
      assert.equal(res.body.totalDuration, 241);
    });

    test('adding the same track twice is a no-op', async () => {
      const playlist = (await createPlaylist().expect(201)).body;
      await addTrack(playlist.id, album.tracks[0]).expect(201);
      const res = await addTrack(playlist.id, album.tracks[0]).expect(201);

      assert.equal(res.body.trackCount, 1);
    });

    test('rejects a track that does not exist', async () => {
      const playlist = (await createPlaylist().expect(201)).body;

      await request(app)
        .post(`/api/playlists/${playlist.id}/items`)
        .set('Authorization', owner.auth)
        .send({ albumId: album.id, trackId: '507f1f77bcf86cd799439011' })
        .expect(404);

      await request(app)
        .post(`/api/playlists/${playlist.id}/items`)
        .set('Authorization', owner.auth)
        .send({ albumId: album.id })
        .expect(400);
    });

    test('removes an entry by its id', async () => {
      const playlist = (await createPlaylist().expect(201)).body;
      await addTrack(playlist.id, album.tracks[0]).expect(201);
      const added = (await addTrack(playlist.id, album.tracks[1]).expect(201)).body;

      const res = await request(app)
        .delete(`/api/playlists/${playlist.id}/items/${added.tracks[0].itemId}`)
        .set('Authorization', owner.auth)
        .expect(200);

      assert.deepEqual(
        res.body.tracks.map((t) => t.title),
        ['Closing Theme']
      );
    });

    test('reorders entries', async () => {
      const playlist = (await createPlaylist().expect(201)).body;
      await addTrack(playlist.id, album.tracks[0]).expect(201);
      const added = (await addTrack(playlist.id, album.tracks[1]).expect(201)).body;
      const ids = added.tracks.map((t) => t.itemId);

      const res = await request(app)
        .put(`/api/playlists/${playlist.id}/items`)
        .set('Authorization', owner.auth)
        .send({ itemIds: [ids[1], ids[0]] })
        .expect(200);

      assert.deepEqual(
        res.body.tracks.map((t) => t.title),
        ['Closing Theme', 'Opening Theme']
      );
    });

    test('rejects a reorder that does not list every entry exactly once', async () => {
      const playlist = (await createPlaylist().expect(201)).body;
      await addTrack(playlist.id, album.tracks[0]).expect(201);
      const added = (await addTrack(playlist.id, album.tracks[1]).expect(201)).body;
      const ids = added.tracks.map((t) => t.itemId);

      for (const itemIds of [[ids[0]], [ids[0], ids[0]], []]) {
        await request(app)
          .put(`/api/playlists/${playlist.id}/items`)
          .set('Authorization', owner.auth)
          .send({ itemIds })
          .expect(400);
      }
    });

    test('drops entries whose album has been deleted', async () => {
      const playlist = (await createPlaylist().expect(201)).body;
      await addTrack(playlist.id, album.tracks[0]).expect(201);

      await request(app)
        .delete(`/api/albums/${album.id}`)
        .set('Authorization', admin.auth)
        .expect(204);

      const res = await request(app)
        .get(`/api/playlists/${playlist.id}`)
        .set('Authorization', owner.auth)
        .expect(200);

      assert.equal(res.body.trackCount, 0, 'a stale entry is hidden, not fatal');
    });
  });

  describe('editing and listing', () => {
    test('lists only the callers own playlists, by name, behind Favourites', async () => {
      const other = await makeUser();
      await createPlaylist({ name: 'Morning' }).expect(201);
      await createPlaylist({ name: 'Evening' }).expect(201);
      await createPlaylist({ name: 'Someone elses' }, other.auth).expect(201);

      const res = await request(app)
        .get('/api/playlists')
        .set('Authorization', owner.auth)
        .expect(200);

      assert.deepEqual(
        res.body.data.map((p) => p.name),
        ['Favourites', 'Evening', 'Morning']
      );
    });

    test('renames a playlist', async () => {
      const playlist = (await createPlaylist().expect(201)).body;

      const res = await request(app)
        .put(`/api/playlists/${playlist.id}`)
        .set('Authorization', owner.auth)
        .send({ name: 'Very late night' })
        .expect(200);

      assert.equal(res.body.name, 'Very late night');
    });

    test('refuses a rename that collides with another playlist', async () => {
      await createPlaylist({ name: 'Morning' }).expect(201);
      const evening = (await createPlaylist({ name: 'Evening' }).expect(201)).body;

      await request(app)
        .put(`/api/playlists/${evening.id}`)
        .set('Authorization', owner.auth)
        .send({ name: 'Morning' })
        .expect(409);
    });

    test('deletes a playlist', async () => {
      const playlist = (await createPlaylist().expect(201)).body;

      await request(app)
        .delete(`/api/playlists/${playlist.id}`)
        .set('Authorization', owner.auth)
        .expect(204);

      await request(app)
        .get(`/api/playlists/${playlist.id}`)
        .set('Authorization', owner.auth)
        .expect(404);
    });
  });

  describe('the favourites playlist', () => {
    const favourite = (track) =>
      request(app)
        .post('/api/favourites')
        .set('Authorization', owner.auth)
        .send({ albumId: album.id, trackId: track.id });

    const getFavourites = () =>
      request(app).get('/api/playlists/favourites').set('Authorization', owner.auth);

    test('every account has one, even with nothing starred', async () => {
      const res = await request(app)
        .get('/api/playlists')
        .set('Authorization', owner.auth)
        .expect(200);

      const [first] = res.body.data;
      assert.equal(first.id, 'favourites');
      assert.equal(first.name, 'Favourites');
      assert.equal(first.isDefault, true);
      assert.equal(first.trackCount, 0);
      assert.equal(first.downloadUrl, null, 'nothing to download while it is empty');
    });

    test('fills itself from what has been starred', async () => {
      await favourite(album.tracks[1]).expect(201);
      await favourite(album.tracks[0]).expect(201);

      const res = await getFavourites().expect(200);

      // Most recently starred first, as on the favourites page itself.
      assert.deepEqual(
        res.body.tracks.map((t) => t.title),
        ['Opening Theme', 'Closing Theme']
      );
      assert.equal(res.body.trackCount, 2);
      assert.equal(res.body.totalDuration, 241);
      assert.ok(res.body.downloadUrl);
    });

    test('empties itself when a track is unstarred', async () => {
      await favourite(album.tracks[0]).expect(201);
      await request(app)
        .delete(`/api/favourites/${album.id}/${album.tracks[0].id}`)
        .set('Authorization', owner.auth)
        .expect(204);

      const res = await getFavourites().expect(200);
      assert.equal(res.body.trackCount, 0, 'nothing to keep in step — it is read fresh');
    });

    test('is private to its owner, like any other', async () => {
      const other = await makeUser();
      await favourite(album.tracks[0]).expect(201);

      const theirs = await request(app)
        .get('/api/playlists/favourites')
        .set('Authorization', other.auth)
        .expect(200);

      assert.equal(theirs.body.trackCount, 0);
      await request(app).get('/api/playlists/favourites').expect(401);
    });

    test('cannot be renamed, deleted or added to', async () => {
      const auth = ['Authorization', owner.auth];

      const rename = await request(app)
        .put('/api/playlists/favourites')
        .set(...auth)
        .send({ name: 'Mine now' })
        .expect(400);
      assert.match(rename.body.message, /cannot be edited as a playlist/);

      await request(app).delete('/api/playlists/favourites').set(...auth).expect(400);
      await request(app)
        .post('/api/playlists/favourites/items')
        .set(...auth)
        .send({ albumId: album.id, trackId: album.tracks[0].id })
        .expect(400);
      await request(app)
        .put('/api/playlists/favourites/items')
        .set(...auth)
        .send({ itemIds: [] })
        .expect(400);
    });

    test('can still be downloaded, because reading is not editing', async () => {
      await favourite(album.tracks[0]).expect(201);

      const res = await request(app)
        .post('/api/playlists/favourites/download-token')
        .set('Authorization', owner.auth)
        .expect(200);

      assert.ok(res.body.token);
    });

    test('a real playlist may still be called Favourites', async () => {
      // The built-in one is not a document, so it occupies no name.
      await createPlaylist({ name: 'Favourites' }).expect(201);
    });
  });

  describe('access control', () => {
    test('an anonymous visitor cannot reach any playlist route', async () => {
      await request(app).get('/api/playlists').expect(401);
      await request(app).post('/api/playlists').send({ name: 'Mine' }).expect(401);
    });

    test('another account cannot see, change or delete a playlist', async () => {
      const intruder = await makeUser();
      const playlist = (await createPlaylist().expect(201)).body;

      // 404 rather than 403: the existence of the playlist is not their business.
      await request(app)
        .get(`/api/playlists/${playlist.id}`)
        .set('Authorization', intruder.auth)
        .expect(404);

      await request(app)
        .put(`/api/playlists/${playlist.id}`)
        .set('Authorization', intruder.auth)
        .send({ name: 'Hijacked' })
        .expect(404);

      await request(app)
        .delete(`/api/playlists/${playlist.id}`)
        .set('Authorization', intruder.auth)
        .expect(404);

      await addTrack(playlist.id, album.tracks[0], intruder.auth).expect(404);
    });

    test('not even an admin reaches another accounts playlist', async () => {
      const playlist = (await createPlaylist().expect(201)).body;

      await request(app)
        .get(`/api/playlists/${playlist.id}`)
        .set('Authorization', admin.auth)
        .expect(404);
    });
  });
});
