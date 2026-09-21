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

describe('Tracks API', () => {
  let admin;

  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(async () => {
    await clearDatabase();
    admin = await makeAdmin();
  });

  async function newAlbum() {
    const res = await request(app)
      .post('/api/albums')
      .set('Authorization', admin.auth)
      .field('title', 'Nocturne')
      .field('circle', 'Gensou')
      .field('year', '2021')
      .expect(201);
    return res.body;
  }

  function addTrack(albumId, fields = {}) {
    const req = request(app)
      .post(`/api/albums/${albumId}/tracks`)
      .set('Authorization', fields.auth ?? admin.auth);

    req.field('title', fields.title ?? 'Opening Theme');
    if (fields.contributingArtists !== undefined) {
      req.field('contributingArtists', fields.contributingArtists);
    }
    if (fields.trackNumber !== undefined) req.field('trackNumber', String(fields.trackNumber));
    if (fields.duration !== undefined) req.field('duration', String(fields.duration));

    return req.attach('audio', fakeMp3(fields.size ?? 2048), {
      filename: fields.filename ?? 'opening.mp3',
      contentType: 'audio/mpeg',
    });
  }

  test('adds a track with playable and downloadable URLs', async () => {
    const album = await newAlbum();
    const res = await addTrack(album.id, { title: 'Opening Theme', duration: 214 }).expect(201);

    assert.equal(res.body.title, 'Opening Theme');
    assert.equal(res.body.trackNumber, 1, 'defaults to the next position');
    assert.equal(res.body.duration, 214);
    assert.equal(res.body.format, 'audio/mpeg');
    assert.equal(res.body.size, 2048);
    assert.equal(res.body.fileName, 'opening.mp3');
    assert.equal(res.body.streamUrl, `/api/albums/${album.id}/tracks/${res.body.id}/stream`);
    assert.equal(res.body.downloadUrl, `/api/albums/${album.id}/tracks/${res.body.id}/download`);
  });

  test('requires an audio file', async () => {
    const album = await newAlbum();
    const res = await request(app)
      .post(`/api/albums/${album.id}/tracks`)
      .set('Authorization', admin.auth)
      .field('title', 'No file')
      .expect(400);
    assert.match(res.body.message, /"audio" file is required/);
  });

  test('rejects a non-audio upload', async () => {
    const album = await newAlbum();
    const res = await request(app)
      .post(`/api/albums/${album.id}/tracks`)
      .set('Authorization', admin.auth)
      .field('title', 'Malware')
      .attach('audio', Buffer.from('MZ'), {
        filename: 'virus.exe',
        contentType: 'application/x-msdownload',
      })
      .expect(400);
    assert.match(res.body.message, /Unsupported audio type/);
  });

  test('rejects a track without a title and leaves no orphan file behind', async () => {
    const album = await newAlbum();
    const res = await request(app)
      .post(`/api/albums/${album.id}/tracks`)
      .set('Authorization', admin.auth)
      .attach('audio', fakeMp3(), { filename: 'x.mp3', contentType: 'audio/mpeg' })
      .expect(400);
    assert.ok(res.body.errors['tracks.0.title']);

    const album2 = await request(app).get(`/api/albums/${album.id}`).expect(200);
    assert.equal(album2.body.trackCount, 0);
  });

  test('keeps tracks sorted by track number and totals their duration', async () => {
    const album = await newAlbum();
    await addTrack(album.id, { title: 'Third', trackNumber: 3, duration: 100 }).expect(201);
    await addTrack(album.id, { title: 'First', trackNumber: 1, duration: 60 }).expect(201);
    await addTrack(album.id, { title: 'Second', trackNumber: 2, duration: 40 }).expect(201);

    const res = await request(app).get(`/api/albums/${album.id}`).expect(200);
    assert.deepEqual(
      res.body.tracks.map((t) => t.title),
      ['First', 'Second', 'Third']
    );
    assert.equal(res.body.trackCount, 3);
    assert.equal(res.body.totalDuration, 200);
  });

  test('updates track metadata', async () => {
    const album = await newAlbum();
    const { body: track } = await addTrack(album.id).expect(201);

    const res = await request(app)
      .put(`/api/albums/${album.id}/tracks/${track.id}`)
      .set('Authorization', admin.auth)
      .send({ title: 'Renamed', duration: 300 })
      .expect(200);

    assert.equal(res.body.title, 'Renamed');
    assert.equal(res.body.duration, 300);
    assert.equal(res.body.trackNumber, 1, 'leaves untouched fields alone');
  });

  test('deletes a track', async () => {
    const album = await newAlbum();
    const { body: track } = await addTrack(album.id).expect(201);

    await request(app)
      .delete(`/api/albums/${album.id}/tracks/${track.id}`)
      .set('Authorization', admin.auth)
      .expect(204);

    const res = await request(app).get(`/api/albums/${album.id}`).expect(200);
    assert.equal(res.body.trackCount, 0);
  });

  test('404s for a track that does not belong to the album', async () => {
    const album = await newAlbum();
    const res = await request(app)
      .get(`/api/albums/${album.id}/tracks/507f1f77bcf86cd799439011/stream`)
      .expect(404);
    assert.equal(res.body.message, 'Track not found');
  });

  describe('access control', () => {
    test('an anonymous visitor cannot add, edit or delete a track', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id).expect(201);

      await request(app)
        .post(`/api/albums/${album.id}/tracks`)
        .field('title', 'Sneaky')
        .attach('audio', fakeMp3(), { filename: 'x.mp3', contentType: 'audio/mpeg' })
        .expect(401);

      await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .send({ title: 'Hacked' })
        .expect(401);

      await request(app).delete(`/api/albums/${album.id}/tracks/${track.id}`).expect(401);
    });

    test('a signed-in non-admin is refused with 403', async () => {
      const listener = await makeUser();
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id).expect(201);

      await addTrack(album.id, { title: 'Sneaky', auth: listener.auth }).expect(403);

      await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', listener.auth)
        .send({ title: 'Hacked' })
        .expect(403);

      await request(app)
        .delete(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', listener.auth)
        .expect(403);

      const after = await request(app).get(`/api/albums/${album.id}`).expect(200);
      assert.equal(after.body.trackCount, 1);
      assert.equal(after.body.tracks[0].title, 'Opening Theme');
    });

    test('a signed-in listener can still stream and download', async () => {
      const listener = await makeUser();
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id).expect(201);

      await request(app).get(track.streamUrl).set('Authorization', listener.auth).expect(200);
      await request(app).get(track.downloadUrl).set('Authorization', listener.auth).expect(200);
    });
  });

  describe('playback and download', () => {
    test('streams a track and advertises range support', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id, { size: 4096 }).expect(201);

      const res = await request(app).get(track.streamUrl).expect(200);
      assert.match(res.headers['content-type'], /audio\/mpeg/);
      assert.equal(res.headers['accept-ranges'], 'bytes');
      assert.equal(res.headers['content-length'], '4096');
    });

    test('serves a byte range so the player can seek', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id, { size: 4096 }).expect(201);

      const res = await request(app)
        .get(track.streamUrl)
        .set('Range', 'bytes=0-1023')
        .expect(206);

      assert.equal(res.headers['content-range'], 'bytes 0-1023/4096');
      assert.equal(res.headers['content-length'], '1024');
    });

    test('anyone can stream and download without signing in', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id).expect(201);

      await request(app).get(track.streamUrl).expect(200);
      await request(app).get(track.downloadUrl).expect(200);
    });

    test('downloads with a readable file name', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id, {
        title: 'Opening Theme',
        trackNumber: 2,
      }).expect(201);

      const res = await request(app).get(track.downloadUrl).expect(200);
      assert.match(res.headers['content-disposition'], /attachment/);
      assert.match(res.headers['content-disposition'], /02 - Gensou - Opening Theme\.mp3/);
    });

    test('strips path characters from the download file name', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id, { title: 'A/B: C' }).expect(201);

      const res = await request(app).get(track.downloadUrl).expect(200);
      assert.doesNotMatch(res.headers['content-disposition'], /A\/B: C/);
      assert.match(res.headers['content-disposition'], /A_B_ C/);
    });
  });

  describe('editing track information', () => {
    test('an admin edits every field at once', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id, {
        title: 'Draft Title',
        trackNumber: 1,
        duration: 100,
      }).expect(201);

      const res = await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({
          title: 'Final Title',
          contributingArtists: 'Guest Vocalist',
          trackNumber: 4,
          duration: 250,
        })
        .expect(200);

      assert.equal(res.body.title, 'Final Title');
      assert.deepEqual(res.body.contributingArtists, ['Guest Vocalist']);
      assert.equal(res.body.trackNumber, 4);
      assert.equal(res.body.duration, 250);
      assert.equal(res.body.id, track.id, 'edits in place rather than replacing');
    });

    test('the edit is persisted, not just echoed back', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id).expect(201);

      await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({ title: 'Persisted' })
        .expect(200);

      const reloaded = await request(app).get(`/api/albums/${album.id}`).expect(200);
      assert.equal(reloaded.body.tracks[0].title, 'Persisted');
    });

    test('editing metadata leaves the audio file playable', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id, { size: 4096 }).expect(201);

      await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({ title: 'Renamed Again' })
        .expect(200);

      const streamed = await request(app).get(track.streamUrl).expect(200);
      assert.equal(streamed.headers['content-length'], '4096');
    });

    test('changing the track number reorders the album', async () => {
      const album = await newAlbum();
      const first = await addTrack(album.id, { title: 'First', trackNumber: 1 }).expect(201);
      await addTrack(album.id, { title: 'Second', trackNumber: 2 }).expect(201);
      await addTrack(album.id, { title: 'Third', trackNumber: 3 }).expect(201);

      await request(app)
        .put(`/api/albums/${album.id}/tracks/${first.body.id}`)
        .set('Authorization', admin.auth)
        .send({ trackNumber: 5 })
        .expect(200);

      const res = await request(app).get(`/api/albums/${album.id}`).expect(200);
      assert.deepEqual(
        res.body.tracks.map((t) => t.title),
        ['Second', 'Third', 'First']
      );
    });

    test('recalculates the album duration after an edit', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id, { duration: 60 }).expect(201);
      await addTrack(album.id, { title: 'Other', trackNumber: 2, duration: 60 }).expect(201);

      await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({ duration: 200 })
        .expect(200);

      const res = await request(app).get(`/api/albums/${album.id}`).expect(200);
      assert.equal(res.body.totalDuration, 260);
    });

    test('clearing the credits leaves the circle to speak for the track', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id, {
        contributingArtists: 'Guest',
      }).expect(201);

      const res = await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({ contributingArtists: '' })
        .expect(200);

      assert.deepEqual(res.body.contributingArtists, []);
      assert.equal(res.body.albumCircle, 'Gensou');
    });

    test('rejects an empty title', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id).expect(201);

      const res = await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({ title: '   ' })
        .expect(400);

      assert.ok(res.body.errors['tracks.0.title']);

      const unchanged = await request(app).get(`/api/albums/${album.id}`).expect(200);
      assert.equal(unchanged.body.tracks[0].title, 'Opening Theme');
    });

    test('rejects a track number below 1 and a non-numeric one', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id).expect(201);
      const url = `/api/albums/${album.id}/tracks/${track.id}`;

      const tooLow = await request(app)
        .put(url)
        .set('Authorization', admin.auth)
        .send({ trackNumber: 0 })
        .expect(400);
      assert.ok(tooLow.body.errors['tracks.0.trackNumber']);

      await request(app)
        .put(url)
        .set('Authorization', admin.auth)
        .send({ trackNumber: 'first' })
        .expect(400);
    });

    test('rejects a negative duration', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id).expect(201);

      await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({ duration: -5 })
        .expect(400);
    });

    test('ignores fields that are not editable', async () => {
      const album = await newAlbum();
      const { body: track } = await addTrack(album.id).expect(201);

      const res = await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({ title: 'Kept', size: 999999, format: 'audio/fake', streamUrl: '/evil' })
        .expect(200);

      assert.equal(res.body.title, 'Kept');
      assert.equal(res.body.size, 2048, 'file size comes from the stored file');
      assert.equal(res.body.format, 'audio/mpeg');
      assert.equal(res.body.streamUrl, `/api/albums/${album.id}/tracks/${track.id}/stream`);
    });

    test('404s when the track belongs to a different album', async () => {
      const albumA = await newAlbum();
      const albumB = await newAlbum();
      const { body: track } = await addTrack(albumA.id).expect(201);

      await request(app)
        .put(`/api/albums/${albumB.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({ title: 'Wrong album' })
        .expect(404);
    });
  });

  test('deleting an album removes its tracks', async () => {
    const album = await newAlbum();
    const { body: track } = await addTrack(album.id).expect(201);

    await request(app)
      .delete(`/api/albums/${album.id}`)
      .set('Authorization', admin.auth)
      .expect(204);
    await request(app).get(track.streamUrl).expect(404);
  });

  describe('track information', () => {
    test('carries its album title, circle and year', async () => {
      const album = await newAlbum();
      const res = await addTrack(album.id, { title: 'Opening Theme' }).expect(201);

      // A track is read in places its album is not — a playlist, the player
      // bar — so it has to describe itself.
      assert.equal(res.body.albumId, album.id);
      assert.equal(res.body.albumTitle, 'Nocturne');
      assert.equal(res.body.albumCircle, 'Gensou');
      assert.equal(res.body.year, 2021);
      assert.equal(res.body.trackNumber, 1);
    });

    test('year is null on an album that has none', async () => {
      const bare = (
        await request(app)
          .post('/api/albums')
          .set('Authorization', admin.auth)
          .field('title', 'Undated')
          .field('circle', 'Gensou')
          .expect(201)
      ).body;

      const res = await addTrack(bare.id, {}).expect(201);
      assert.equal(res.body.year, null);
    });

    test('records contributing artists as a list', async () => {
      const album = await newAlbum();
      const res = await addTrack(album.id, {
        contributingArtists: 'Aoi, Mizuki, Ren',
      }).expect(201);

      assert.deepEqual(res.body.contributingArtists, ['Aoi', 'Mizuki', 'Ren']);
    });

    test('drops blanks and repeats from the credits', async () => {
      const album = await newAlbum();
      const res = await addTrack(album.id, {
        contributingArtists: ' Aoi ,, Mizuki,Aoi,  ',
      }).expect(201);

      assert.deepEqual(res.body.contributingArtists, ['Aoi', 'Mizuki']);
    });

    test('defaults to no credits', async () => {
      const album = await newAlbum();
      const res = await addTrack(album.id, {}).expect(201);

      assert.deepEqual(res.body.contributingArtists, []);
    });

    test('edits the credits, and can clear them', async () => {
      const album = await newAlbum();
      const track = (await addTrack(album.id, { contributingArtists: 'Aoi' }).expect(201)).body;

      const updated = await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({ contributingArtists: ['Mizuki', 'Ren'] })
        .expect(200);
      assert.deepEqual(updated.body.contributingArtists, ['Mizuki', 'Ren']);

      const cleared = await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({ contributingArtists: '' })
        .expect(200);
      assert.deepEqual(cleared.body.contributingArtists, []);
    });

    test('leaves the credits alone when the edit does not mention them', async () => {
      const album = await newAlbum();
      const track = (await addTrack(album.id, { contributingArtists: 'Aoi' }).expect(201)).body;

      const res = await request(app)
        .put(`/api/albums/${album.id}/tracks/${track.id}`)
        .set('Authorization', admin.auth)
        .send({ title: 'Renamed' })
        .expect(200);

      assert.deepEqual(res.body.contributingArtists, ['Aoi']);
    });

    test('the album listing carries the same information on every track', async () => {
      const album = await newAlbum();
      await addTrack(album.id, { contributingArtists: 'Aoi' }).expect(201);

      const res = await request(app).get(`/api/albums/${album.id}`).expect(200);
      const [track] = res.body.tracks;

      assert.equal(track.albumTitle, 'Nocturne');
      assert.equal(track.year, 2021);
      assert.deepEqual(track.contributingArtists, ['Aoi']);
    });
  });

});
