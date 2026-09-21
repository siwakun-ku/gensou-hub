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
  zipEntryNames,
  bufferResponse,
} from './helpers.js';

describe('Playlist download', () => {
  let admin;
  let owner;
  let album;
  let playlist;

  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(async () => {
    await clearDatabase();
    admin = await makeAdmin();
    owner = await makeUser();
    album = await seedAlbum();
    playlist = (
      await request(app)
        .post('/api/playlists')
        .set('Authorization', owner.auth)
        .send({ name: 'Late night' })
        .expect(201)
    ).body;
  });

  async function seedAlbum() {
    const created = await request(app)
      .post('/api/albums')
      .set('Authorization', admin.auth)
      .field('title', 'Nocturne')
      .field('circle', 'Gensou')
      .expect(201);

    for (const [index, title] of ['Opening Theme', 'Closing Theme'].entries()) {
      await request(app)
        .post(`/api/albums/${created.body.id}/tracks`)
        .set('Authorization', admin.auth)
        .field('title', title)
        .field('trackNumber', String(index + 1))
        .attach('audio', fakeMp3(), { filename: `${title}.mp3`, contentType: 'audio/mpeg' })
        .expect(201);
    }

    return (await request(app).get(`/api/albums/${created.body.id}`).expect(200)).body;
  }

  function addTrack(track, auth = owner.auth) {
    return request(app)
      .post(`/api/playlists/${playlist.id}/items`)
      .set('Authorization', auth)
      .send({ albumId: album.id, trackId: track.id });
  }

  function mintToken(id = playlist.id, auth = owner.auth) {
    return request(app).post(`/api/playlists/${id}/download-token`).set('Authorization', auth);
  }

  test('zips every track, numbered by the running order', async () => {
    // Added back to front, so playlist order and album order disagree.
    await addTrack(album.tracks[1]).expect(201);
    await addTrack(album.tracks[0]).expect(201);

    const { token } = (await mintToken().expect(200)).body;

    const res = await bufferResponse(
      request(app).get(`/api/playlists/${playlist.id}/download`).query({ token })
    ).expect(200);

    assert.match(res.headers['content-type'], /application\/zip/);
    assert.match(res.headers['content-disposition'], /Late night\.zip/);

    assert.deepEqual(zipEntryNames(res.body).sort(), [
      '01 - Gensou - Closing Theme.mp3',
      '02 - Gensou - Opening Theme.mp3',
    ]);
  });

  test('the owner can also download with a normal Bearer token', async () => {
    await addTrack(album.tracks[0]).expect(201);

    const res = await bufferResponse(
      request(app).get(`/api/playlists/${playlist.id}/download`).set('Authorization', owner.auth)
    ).expect(200);

    assert.deepEqual(zipEntryNames(res.body), ['01 - Gensou - Opening Theme.mp3']);
  });

  test('exposes a download URL only once the playlist has tracks', async () => {
    assert.equal(playlist.downloadUrl, null);

    const updated = (await addTrack(album.tracks[0]).expect(201)).body;
    assert.equal(updated.downloadUrl, `/api/playlists/${playlist.id}/download`);
  });

  test('404s for an empty playlist', async () => {
    const { token } = (await mintToken().expect(200)).body;

    await request(app)
      .get(`/api/playlists/${playlist.id}/download`)
      .query({ token })
      .expect(404);
  });

  test('skips entries whose album has been deleted', async () => {
    await addTrack(album.tracks[0]).expect(201);
    await request(app)
      .delete(`/api/albums/${album.id}`)
      .set('Authorization', admin.auth)
      .expect(204);

    const { token } = (await mintToken().expect(200)).body;

    // Nothing left that can be resolved, so there is nothing to send.
    await request(app)
      .get(`/api/playlists/${playlist.id}/download`)
      .query({ token })
      .expect(404);
  });

  describe('the download credential', () => {
    test('is refused without one', async () => {
      await addTrack(album.tracks[0]).expect(201);

      await request(app).get(`/api/playlists/${playlist.id}/download`).expect(401);
    });

    test('is refused when it is not a real token', async () => {
      await addTrack(album.tracks[0]).expect(201);

      await request(app)
        .get(`/api/playlists/${playlist.id}/download`)
        .query({ token: 'not-a-token' })
        .expect(401);
    });

    test('cannot be replayed against another playlist', async () => {
      await addTrack(album.tracks[0]).expect(201);

      const other = (
        await request(app)
          .post('/api/playlists')
          .set('Authorization', owner.auth)
          .send({ name: 'Morning' })
          .expect(201)
      ).body;

      const { token } = (await mintToken().expect(200)).body;

      // Scoped to the playlist it was minted for, even though the same account
      // owns both.
      const res = await request(app)
        .get(`/api/playlists/${other.id}/download`)
        .query({ token })
        .expect(401);

      assert.match(res.body.message, /not valid/);
    });

    test('a session token is not accepted as a download token', async () => {
      await addTrack(album.tracks[0]).expect(201);

      // The owner's own login token, which has no download purpose or scope.
      await request(app)
        .get(`/api/playlists/${playlist.id}/download`)
        .query({ token: owner.token })
        .expect(401);
    });

    test('is only minted for the owner', async () => {
      const intruder = await makeUser();

      await mintToken(playlist.id, intruder.auth).expect(404);
      await mintToken(playlist.id, admin.auth).expect(404);
      await request(app).post(`/api/playlists/${playlist.id}/download-token`).expect(401);
    });

    test('does not let its holder reach anything else', async () => {
      await addTrack(album.tracks[0]).expect(201);
      const { token } = (await mintToken().expect(200)).body;

      // A download credential is not a session: it opens one door only.
      await request(app).get('/api/playlists').query({ token }).expect(401);
      await request(app).get(`/api/playlists/${playlist.id}`).query({ token }).expect(401);
    });
  });
});
