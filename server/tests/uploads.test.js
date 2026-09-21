import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, startTestEnv, stopTestEnv, clearDatabase, makeUser, makeAdmin } from './helpers.js';
import { fileFromBlob, UPLOAD_RULES } from '../src/middleware/upload.js';
import { storeUpload, TRACKS } from '../src/config/storage.js';

const MB = 1024 * 1024;
const STORE = 'https://abc123.public.blob.vercel-storage.com';

/**
 * A stand-in for the blob store: `head` answers from a fixed list, as the real
 * one does for URLs in its own store, and fails for anything else.
 */
function fakeStore(blobs) {
  const removed = [];
  return {
    removed,
    head: async (url) => {
      const blob = blobs.find((b) => b.url === url);
      if (!blob) throw new Error('BlobNotFoundError');
      return blob;
    },
    remove: async (url) => removed.push(url),
  };
}

const track = (overrides = {}) => ({
  url: `${STORE}/tracks/1700000000000-Ab12Cd.mp3`,
  pathname: 'tracks/1700000000000-Ab12Cd.mp3',
  contentType: 'audio/mpeg',
  size: 12 * MB,
  ...overrides,
});

describe('Direct uploads', () => {
  describe('checking a file the browser uploaded', () => {
    const rule = UPLOAD_RULES[TRACKS];

    test('is skipped when the form names no uploaded file', async () => {
      assert.equal(await fileFromBlob(TRACKS, rule, {}, fakeStore([])), null);
    });

    test('describes a valid file the way multer would, using what the store reports', async () => {
      const blob = track();
      const store = fakeStore([blob]);

      const file = await fileFromBlob(
        TRACKS,
        rule,
        // The form claims a size and type; neither is what the result uses.
        { audioUrl: blob.url, audioName: 'Song.mp3', size: 1, type: 'audio/wav' },
        store
      );

      assert.deepEqual(file, {
        filename: '1700000000000-Ab12Cd.mp3',
        originalname: 'Song.mp3',
        mimetype: 'audio/mpeg',
        size: 12 * MB,
        url: blob.url,
      });
      assert.deepEqual(store.removed, []);
    });

    // Over the 4.5 MB a Vercel function can receive, which is the whole point.
    test('accepts a file far larger than a function request may be', async () => {
      const blob = track({ size: 40 * MB });
      const file = await fileFromBlob(TRACKS, rule, { audioUrl: blob.url }, fakeStore([blob]));
      assert.equal(file.size, 40 * MB);
    });

    test('rejects a URL the store does not know', async () => {
      await assert.rejects(
        fileFromBlob(TRACKS, rule, { audioUrl: 'https://evil.example.com/x.mp3' }, fakeStore([])),
        { status: 400, message: /could not be found/ }
      );
    });

    test('rejects, and removes, a file uploaded into another folder', async () => {
      const blob = track({ pathname: 'covers/1700000000000-Ab12Cd.mp3' });
      const store = fakeStore([blob]);

      await assert.rejects(fileFromBlob(TRACKS, rule, { audioUrl: blob.url }, store), {
        status: 400,
      });
      assert.deepEqual(store.removed, [blob.url]);
    });

    test('rejects, and removes, a file of the wrong type', async () => {
      const blob = track({ contentType: 'image/png' });
      const store = fakeStore([blob]);

      await assert.rejects(fileFromBlob(TRACKS, rule, { audioUrl: blob.url }, store), {
        status: 400,
        message: /Unsupported audio type/,
      });
      assert.deepEqual(store.removed, [blob.url]);
    });

    test('rejects, and removes, a file over the size limit', async () => {
      const blob = track({ size: rule.maxBytes + 1 });
      const store = fakeStore([blob]);

      await assert.rejects(fileFromBlob(TRACKS, rule, { audioUrl: blob.url }, store), {
        status: 400,
        message: /too large/,
      });
      assert.deepEqual(store.removed, [blob.url]);
    });
  });

  test('storing a file the browser already uploaded writes nothing more', async () => {
    const stored = await storeUpload(TRACKS, {
      filename: '1700000000000-Ab12Cd.mp3',
      originalname: 'Song.mp3',
      mimetype: 'audio/mpeg',
      size: 12 * MB,
      url: `${STORE}/tracks/1700000000000-Ab12Cd.mp3`,
    });

    assert.deepEqual(stored, {
      fileName: '1700000000000-Ab12Cd.mp3',
      url: `${STORE}/tracks/1700000000000-Ab12Cd.mp3`,
      originalName: 'Song.mp3',
      mimeType: 'audio/mpeg',
      size: 12 * MB,
    });
  });

  // The test server runs on the disk driver, as a local one does.
  describe('over HTTP, on the disk driver', () => {
    before(startTestEnv);
    after(stopTestEnv);
    beforeEach(clearDatabase);

    test('tells the browser to send files the ordinary way', async () => {
      const res = await request(app).get('/api/uploads/config').expect(200);
      assert.deepEqual(res.body, { direct: false });
    });

    test('hands out no upload permission', async () => {
      const admin = await makeAdmin();
      await request(app).post('/api/uploads').set('Authorization', admin.auth).send({}).expect(404);
    });

    test('keeps upload permission to admins', async () => {
      const user = await makeUser();
      await request(app).post('/api/uploads').send({}).expect(401);
      await request(app).post('/api/uploads').set('Authorization', user.auth).send({}).expect(403);
    });

    test('ignores an uploaded-file address sent to a local server', async () => {
      const admin = await makeAdmin();
      const album = await request(app)
        .post('/api/albums')
        .set('Authorization', admin.auth)
        .field('title', 'Direct')
        .field('circle', 'Test Circle')
        .expect(201);

      // Locally there is no store to have uploaded to, so the track has no file.
      await request(app)
        .post(`/api/albums/${album.body.id}/tracks`)
        .set('Authorization', admin.auth)
        .field('title', 'Song')
        .field('audioUrl', `${STORE}/tracks/x.mp3`)
        .expect(400);
    });
  });
});
