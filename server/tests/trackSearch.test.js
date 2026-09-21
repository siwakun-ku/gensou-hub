import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, startTestEnv, stopTestEnv, clearDatabase, fakeMp3, makeAdmin } from './helpers.js';

describe('Track search', () => {
  let admin;

  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(async () => {
    await clearDatabase();
    admin = await makeAdmin();
    await seedLibrary();
  });

  async function newAlbum(title, circle, year) {
    const res = await request(app)
      .post('/api/albums')
      .set('Authorization', admin.auth)
      .field('title', title)
      .field('circle', circle)
      .field('year', String(year))
      .expect(201);
    return res.body;
  }

  function addTrack(albumId, title, trackNumber, contributingArtists) {
    const req = request(app)
      .post(`/api/albums/${albumId}/tracks`)
      .set('Authorization', admin.auth)
      .field('title', title)
      .field('trackNumber', String(trackNumber));

    if (contributingArtists) req.field('contributingArtists', contributingArtists);

    return req
      .attach('audio', fakeMp3(), { filename: `${title}.mp3`, contentType: 'audio/mpeg' })
      .expect(201);
  }

  /** Two albums, so a search can match one without dragging in the other. */
  async function seedLibrary() {
    const nocturne = await newAlbum('Nocturne', 'Gensou', 2021);
    await addTrack(nocturne.id, 'Moonlit Road', 1, 'Aoi');
    await addTrack(nocturne.id, 'Closing Theme', 2);

    const daybreak = await newAlbum('Daybreak', 'Beniko', 2023);
    await addTrack(daybreak.id, 'Morning Road', 1, 'Mizuki, Aoi');
  }

  const search = (params) => request(app).get('/api/tracks').query(params);

  const titles = (res) => res.body.data.map((track) => track.title);

  test('finds tracks by title, across albums', async () => {
    const res = await search({ q: 'road' }).expect(200);

    assert.deepEqual(titles(res).sort(), ['Moonlit Road', 'Morning Road']);
    assert.equal(res.body.pagination.total, 2);
  });

  test('returns only the matching tracks, not the rest of their album', async () => {
    const res = await search({ q: 'Moonlit' }).expect(200);

    // "Closing Theme" shares an album with the match and must stay out of it.
    assert.deepEqual(titles(res), ['Moonlit Road']);
  });

  test('finds tracks by contributing artist', async () => {
    const res = await search({ q: 'Mizuki' }).expect(200);
    assert.deepEqual(titles(res), ['Morning Road']);

    const shared = await search({ q: 'Aoi' }).expect(200);
    assert.deepEqual(titles(shared).sort(), ['Moonlit Road', 'Morning Road']);
  });

  test('finds every track on an album matched by its title or circle', async () => {
    const byAlbum = await search({ q: 'Nocturne' }).expect(200);
    assert.deepEqual(titles(byAlbum).sort(), ['Closing Theme', 'Moonlit Road']);

    const byCircle = await search({ q: 'beniko' }).expect(200);
    assert.deepEqual(titles(byCircle), ['Morning Road']);
  });

  test('each result describes itself and is ready to play', async () => {
    const res = await search({ q: 'Moonlit' }).expect(200);
    const [track] = res.body.data;

    assert.equal(track.albumTitle, 'Nocturne');
    assert.equal(track.albumCircle, 'Gensou');
    assert.equal(track.year, 2021);
    assert.equal(track.trackNumber, 1);
    assert.deepEqual(track.contributingArtists, ['Aoi']);
    assert.ok(track.streamUrl.includes(track.albumId));
    assert.ok(track.downloadUrl);
    assert.ok(track.coverUrl === null || typeof track.coverUrl === 'string');
  });

  test('is case insensitive and matches partway into a word', async () => {
    for (const q of ['MOONLIT', 'moonlit', 'onli']) {
      const res = await search({ q }).expect(200);
      assert.deepEqual(titles(res), ['Moonlit Road'], `for ${q}`);
    }
  });

  test('treats regex characters as text rather than as a pattern', async () => {
    // Would match everything if it reached the engine unescaped.
    const res = await search({ q: '.*' }).expect(200);

    assert.deepEqual(res.body.data, []);
    assert.equal(res.body.pagination.total, 0);
  });

  test('an empty search returns nothing rather than the whole library', async () => {
    for (const params of [{}, { q: '' }, { q: '   ' }]) {
      const res = await search(params).expect(200);
      assert.deepEqual(res.body.data, []);
      assert.equal(res.body.pagination.total, 0);
    }
  });

  test('pages the results and counts every match', async () => {
    const first = await search({ q: 'road', page: 1, limit: 1 }).expect(200);
    const second = await search({ q: 'road', page: 2, limit: 1 }).expect(200);

    assert.equal(first.body.data.length, 1);
    assert.equal(second.body.data.length, 1);
    assert.notEqual(first.body.data[0].id, second.body.data[0].id);

    // The count is of matching tracks, not of the page.
    assert.equal(first.body.pagination.total, 2);
    assert.equal(first.body.pagination.pages, 2);
  });

  test('finds nothing when nothing matches', async () => {
    const res = await search({ q: 'nonexistent' }).expect(200);
    assert.deepEqual(res.body.data, []);
  });

  test('is open to anonymous visitors, like the rest of the library', async () => {
    await search({ q: 'road' }).expect(200);
  });
});
