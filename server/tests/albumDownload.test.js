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
  makeAdmin,
  zipEntryNames,
  bufferResponse,
} from './helpers.js';

describe('Album download', () => {
  let admin;

  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(async () => {
    await clearDatabase();
    admin = await makeAdmin();
  });

  async function newAlbum({ withCover = false } = {}) {
    const req = request(app)
      .post('/api/albums')
      .set('Authorization', admin.auth)
      .field('title', 'Nocturne')
      .field('circle', 'Gensou');

    if (withCover) req.attach('cover', fakePng(), { filename: 'art.png', contentType: 'image/png' });

    const res = await req.expect(201);
    return res.body;
  }

  function addTrack(albumId, { title, trackNumber, size = 2048 }) {
    return request(app)
      .post(`/api/albums/${albumId}/tracks`)
      .set('Authorization', admin.auth)
      .field('title', title)
      .field('trackNumber', String(trackNumber))
      .attach('audio', fakeMp3(size), {
        filename: `${title}.mp3`,
        contentType: 'audio/mpeg',
      })
      .expect(201);
  }

  test('zips every track, named and numbered, with the cover alongside', async () => {
    const album = await newAlbum({ withCover: true });
    await addTrack(album.id, { title: 'Opening Theme', trackNumber: 1 });
    await addTrack(album.id, { title: 'Closing Theme', trackNumber: 2 });

    const res = await bufferResponse(
      request(app).get(`/api/albums/${album.id}/download`)
    ).expect(200);

    assert.match(res.headers['content-type'], /application\/zip/);
    assert.match(res.headers['content-disposition'], /Gensou - Nocturne\.zip/);
    assert.equal(res.body.readUInt32LE(0), 0x04034b50, 'starts with a zip signature');

    // Sorted: archiver reads the files concurrently, so the order entries land
    // in the zip is not fixed. The names are what matter.
    assert.deepEqual(zipEntryNames(res.body).sort(), [
      '01 - Gensou - Opening Theme.mp3',
      '02 - Gensou - Closing Theme.mp3',
      'cover.png',
    ]);
  });

  test('exposes a download URL only once the album has tracks', async () => {
    const album = await newAlbum();
    assert.equal(album.downloadUrl, null);

    await addTrack(album.id, { title: 'Opening Theme', trackNumber: 1 });

    const res = await request(app).get(`/api/albums/${album.id}`).expect(200);
    assert.equal(res.body.downloadUrl, `/api/albums/${album.id}/download`);
  });

  test('404s for an empty album and for one that does not exist', async () => {
    const album = await newAlbum();

    await request(app).get(`/api/albums/${album.id}/download`).expect(404);
    await request(app).get('/api/albums/507f1f77bcf86cd799439011/download').expect(404);
  });
});
