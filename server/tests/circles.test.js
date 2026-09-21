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

describe('Circles API', () => {
  let admin;
  let listener;

  before(startTestEnv);
  after(stopTestEnv);
  beforeEach(async () => {
    await clearDatabase();
    admin = await makeAdmin();
    listener = await makeUser();
  });

  /** An album credited to a circle, optionally with tracks on it. */
  async function makeAlbum({ title, circle, year, trackTitles = [] }) {
    const created = await request(app)
      .post('/api/albums')
      .set('Authorization', admin.auth)
      .field('title', title)
      .field('circle', circle)
      .field('year', String(year ?? 2020))
      .expect(201);

    for (const [index, trackTitle] of trackTitles.entries()) {
      await request(app)
        .post(`/api/albums/${created.body.id}/tracks`)
        .set('Authorization', admin.auth)
        .field('title', trackTitle)
        .field('trackNumber', String(index + 1))
        .field('duration', '120')
        .attach('audio', fakeMp3(), { filename: `${trackTitle}.mp3`, contentType: 'audio/mpeg' })
        .expect(201);
    }

    return created.body;
  }

  const createProfile = (fields = {}, auth = admin.auth) => {
    const req = request(app).post('/api/circles').set('Authorization', auth);
    for (const [key, value] of Object.entries({ name: 'Gensou Sound', ...fields })) {
      req.field(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
    return req;
  };

  const listCircles = (params = {}) => request(app).get('/api/circles').query(params);

  const lookup = (name) => request(app).get('/api/circles/lookup').query({ name });

  describe('the directory', () => {
    test('lists a circle that only exists because an album credits it', async () => {
      await makeAlbum({ title: 'Nocturne', circle: 'Gensou Sound' });

      const res = await listCircles().expect(200);
      assert.equal(res.body.data.length, 1);

      const [circle] = res.body.data;
      assert.equal(circle.name, 'Gensou Sound');
      assert.equal(circle.albumCount, 1);
      assert.equal(
        circle.hasProfile,
        false,
        'nobody has written it up, but the library still knows it'
      );
      assert.equal(circle.id, null, 'there is no document, so there is no id');
    });

    test('a written profile and its albums are one entry, not two', async () => {
      await makeAlbum({ title: 'Nocturne', circle: 'Gensou Sound' });
      await createProfile({ name: 'Gensou Sound', origin: 'Tokyo' }).expect(201);

      const res = await listCircles().expect(200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].hasProfile, true);
      assert.equal(res.body.data[0].origin, 'Tokyo');
      assert.equal(res.body.data[0].albumCount, 1);
    });

    test('counts albums and tracks, and the years they span', async () => {
      await makeAlbum({ title: 'First', circle: 'Gensou Sound', year: 2014, trackTitles: ['A'] });
      await makeAlbum({
        title: 'Second',
        circle: 'Gensou Sound',
        year: 2021,
        trackTitles: ['B', 'C'],
      });

      const [circle] = (await listCircles().expect(200)).body.data;
      assert.equal(circle.albumCount, 2);
      assert.equal(circle.trackCount, 3);
      assert.equal(circle.firstYear, 2014);
      assert.equal(circle.latestYear, 2021);
    });

    test('albums spelling the circle differently still count as one group', async () => {
      await makeAlbum({ title: 'First', circle: 'Gensou Sound' });
      await makeAlbum({ title: 'Second', circle: '  GENSOU SOUND ' });

      const res = await listCircles().expect(200);
      assert.equal(res.body.data.length, 1, 'case and padding are not different circles');
      assert.equal(res.body.data[0].albumCount, 2);
    });

    test('a profile written before the first release still lists', async () => {
      await createProfile({ name: '未来Records' }).expect(201);

      const [circle] = (await listCircles().expect(200)).body.data;
      assert.equal(circle.name, '未来Records');
      assert.equal(circle.albumCount, 0);
    });

    test('sorts by name, and by catalogue size on request', async () => {
      await makeAlbum({ title: 'One', circle: 'Zephyr' });
      await makeAlbum({ title: 'Two', circle: 'Amber' });
      await makeAlbum({ title: 'Three', circle: 'Amber' });

      const byName = await listCircles().expect(200);
      assert.deepEqual(
        byName.body.data.map((c) => c.name),
        ['Amber', 'Zephyr']
      );

      const byAlbums = await listCircles({ sort: 'albums' }).expect(200);
      assert.deepEqual(
        byAlbums.body.data.map((c) => c.albumCount),
        [2, 1]
      );
    });

    test('filters on a keyword across name and description', async () => {
      await makeAlbum({ title: 'One', circle: 'Zephyr' });
      await createProfile({ name: 'Amber', description: 'A shoegaze circle from Osaka.' }).expect(
        201
      );

      assert.equal((await listCircles({ q: 'zeph' }).expect(200)).body.data.length, 1);
      assert.equal((await listCircles({ q: 'shoegaze' }).expect(200)).body.data.length, 1);
      assert.equal((await listCircles({ q: 'nothing here' }).expect(200)).body.data.length, 0);
    });
  });

  describe('looking one up by name', () => {
    test('returns the profile together with its discography', async () => {
      const album = await makeAlbum({ title: 'Nocturne', circle: 'Gensou Sound', year: 2021 });
      await createProfile({
        name: 'Gensou Sound',
        origin: 'Tokyo',
        foundedYear: '2012',
        description: 'Founded around a university music club.',
        links: [{ label: 'Bandcamp', url: 'https://example.com' }],
      }).expect(201);

      const res = await lookup('Gensou Sound').expect(200);
      assert.equal(res.body.name, 'Gensou Sound');
      assert.equal(res.body.origin, 'Tokyo');
      assert.equal(res.body.foundedYear, 2012);
      assert.deepEqual(res.body.links, [{ label: 'Bandcamp', url: 'https://example.com' }]);
      assert.deepEqual(
        res.body.albums.map((a) => a.id),
        [album.id]
      );
    });

    test('works for a circle nobody has written up', async () => {
      await makeAlbum({ title: 'Nocturne', circle: 'Gensou Sound' });

      const res = await lookup('Gensou Sound').expect(200);
      assert.equal(res.body.hasProfile, false);
      assert.equal(res.body.description, '');
      assert.equal(res.body.albums.length, 1, 'the discography stands without a biography');
    });

    test('is not fussy about how the name is typed', async () => {
      await makeAlbum({ title: 'Nocturne', circle: 'Gensou Sound' });

      await lookup('gensou sound').expect(200);
      await lookup('  GENSOU SOUND  ').expect(200);
    });

    test('a name with nothing behind it is a 404, and no name at all a 400', async () => {
      await lookup('Nobody At All').expect(404);
      await request(app).get('/api/circles/lookup').expect(400);
    });

    test('lists newest releases first', async () => {
      await makeAlbum({ title: 'Old', circle: 'Gensou Sound', year: 2014 });
      await makeAlbum({ title: 'New', circle: 'Gensou Sound', year: 2021 });

      const res = await lookup('Gensou Sound').expect(200);
      assert.deepEqual(
        res.body.albums.map((a) => a.title),
        ['New', 'Old']
      );
    });
  });

  describe('writing a profile', () => {
    test('an admin creates one, and it picks up the albums already crediting it', async () => {
      await makeAlbum({ title: 'Nocturne', circle: 'Gensou Sound', trackTitles: ['A'] });

      const res = await createProfile({ name: 'Gensou Sound' }).expect(201);
      assert.equal(res.body.hasProfile, true);
      assert.equal(res.body.albumCount, 1, 'the name was always the link');
      assert.equal(res.body.trackCount, 1);
    });

    test('stores a logo and serves it back', async () => {
      const created = await request(app)
        .post('/api/circles')
        .set('Authorization', admin.auth)
        .field('name', 'Gensou Sound')
        .attach('logo', fakePng(), { filename: 'logo.png', contentType: 'image/png' })
        .expect(201);

      assert.ok(created.body.logoUrl, 'a stored logo gets a URL');

      const image = await request(app).get(`/api/circles/${created.body.id}/logo`).expect(200);
      assert.match(image.headers['content-type'], /image\/png/);
    });

    test('a circle with no logo 404s rather than serving nothing', async () => {
      const created = await createProfile().expect(201);
      await request(app).get(`/api/circles/${created.body.id}/logo`).expect(404);
    });

    test('refuses a second profile for the same circle, however it is typed', async () => {
      await createProfile({ name: 'Gensou Sound' }).expect(201);

      const res = await createProfile({ name: 'gensou sound' }).expect(409);
      assert.match(res.body.message, /already a profile/i);
    });

    test('drops link entries missing a label or a URL', async () => {
      const res = await createProfile({
        links: [
          { label: 'Site', url: 'https://example.com' },
          { label: 'Nowhere', url: '' },
          { label: '', url: 'https://example.org' },
        ],
      }).expect(201);

      assert.deepEqual(res.body.links, [{ label: 'Site', url: 'https://example.com' }]);
    });

    test('rejects links that are not a JSON array', async () => {
      await createProfile({ links: 'not json at all' }).expect(400);
    });

    test('requires a name', async () => {
      await request(app)
        .post('/api/circles')
        .set('Authorization', admin.auth)
        .field('origin', 'Tokyo')
        .expect(400);
    });
  });

  describe('editing a profile', () => {
    let circle;

    beforeEach(async () => {
      circle = (await createProfile({ name: 'Gensou Sound', origin: 'Tokyo' }).expect(201)).body;
    });

    const update = (fields, auth = admin.auth) => {
      const req = request(app).put(`/api/circles/${circle.id}`).set('Authorization', auth);
      for (const [key, value] of Object.entries(fields)) {
        req.field(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
      return req;
    };

    test('changes the written details', async () => {
      const res = await update({
        origin: 'Osaka',
        foundedYear: '2012',
        description: 'Now with a biography.',
      }).expect(200);

      assert.equal(res.body.origin, 'Osaka');
      assert.equal(res.body.foundedYear, 2012);
      assert.equal(res.body.description, 'Now with a biography.');
      assert.equal(res.body.name, 'Gensou Sound', 'untouched fields stay put');
    });

    test('replaces the whole link list rather than appending to it', async () => {
      await update({ links: [{ label: 'Site', url: 'https://example.com' }] }).expect(200);

      const res = await update({ links: [{ label: 'Bandcamp', url: 'https://example.org' }] }).expect(
        200
      );
      assert.deepEqual(res.body.links, [{ label: 'Bandcamp', url: 'https://example.org' }]);
    });

    /*
     * The one edit that reaches outside the document. An album records its
     * circle as text, so a rename that stopped at the profile would leave the
     * albums crediting a name nothing is written about, and the profile
     * attached to an empty discography.
     */
    test('renaming the circle renames it on every album too', async () => {
      await makeAlbum({ title: 'Nocturne', circle: 'Gensou Sound' });
      await makeAlbum({ title: 'Reverie', circle: 'GENSOU SOUND' });
      await makeAlbum({ title: 'Unrelated', circle: 'Other Circle' });

      const res = await update({ name: 'Gensou Records' }).expect(200);
      assert.equal(res.body.albumsRenamed, 2, 'including the differently-typed one');

      const renamed = await lookup('Gensou Records').expect(200);
      assert.equal(renamed.body.albumCount, 2);
      assert.equal(renamed.body.hasProfile, true);

      // The old name is nobody now: no profile, and no album crediting it.
      await lookup('Gensou Sound').expect(404);

      const other = await lookup('Other Circle').expect(200);
      assert.equal(other.body.albumCount, 1, 'a different circle was left alone');
    });

    test('renaming onto a circle that already has a profile is refused', async () => {
      await createProfile({ name: 'Amber' }).expect(201);
      await update({ name: 'Amber' }).expect(409);
    });

    test('clears the logo on request', async () => {
      await request(app)
        .put(`/api/circles/${circle.id}`)
        .set('Authorization', admin.auth)
        .attach('logo', fakePng(), { filename: 'logo.png', contentType: 'image/png' })
        .expect(200);

      const res = await update({ removeLogo: 'true' }).expect(200);
      assert.equal(res.body.logoUrl, null);
      await request(app).get(`/api/circles/${circle.id}/logo`).expect(404);
    });

    test('leaves the logo alone when the form simply sends no file', async () => {
      const withLogo = await request(app)
        .put(`/api/circles/${circle.id}`)
        .set('Authorization', admin.auth)
        .attach('logo', fakePng(), { filename: 'logo.png', contentType: 'image/png' })
        .expect(200);

      const res = await update({ origin: 'Osaka' }).expect(200);
      assert.equal(res.body.logoUrl, withLogo.body.logoUrl);
    });
  });

  describe('deleting a profile', () => {
    test('forgets the biography but keeps the discography', async () => {
      await makeAlbum({ title: 'Nocturne', circle: 'Gensou Sound' });
      const circle = (await createProfile({ name: 'Gensou Sound' }).expect(201)).body;

      await request(app)
        .delete(`/api/circles/${circle.id}`)
        .set('Authorization', admin.auth)
        .expect(204);

      const res = await lookup('Gensou Sound').expect(200);
      assert.equal(res.body.hasProfile, false);
      assert.equal(res.body.albums.length, 1, 'the album still credits the circle');

      const directory = await listCircles().expect(200);
      assert.equal(directory.body.data.length, 1, 'it stays in the directory, unwritten');
    });

    test('a profile with no albums simply disappears', async () => {
      const circle = (await createProfile({ name: 'Gensou Sound' }).expect(201)).body;

      await request(app)
        .delete(`/api/circles/${circle.id}`)
        .set('Authorization', admin.auth)
        .expect(204);

      assert.deepEqual((await listCircles().expect(200)).body.data, []);
      await lookup('Gensou Sound').expect(404);
    });

    test('404s on a circle that is not there', async () => {
      await request(app)
        .delete('/api/circles/507f1f77bcf86cd799439011')
        .set('Authorization', admin.auth)
        .expect(404);
    });
  });

  describe('access control', () => {
    test('anyone may browse the directory and look a circle up', async () => {
      await makeAlbum({ title: 'Nocturne', circle: 'Gensou Sound' });

      await request(app).get('/api/circles').expect(200);
      await request(app).get('/api/circles/lookup').query({ name: 'Gensou Sound' }).expect(200);
    });

    test('an anonymous visitor cannot write a profile', async () => {
      await request(app).post('/api/circles').field('name', 'Gensou Sound').expect(401);
    });

    test('a signed-in listener cannot write one either', async () => {
      await createProfile({ name: 'Gensou Sound' }, listener.auth).expect(403);

      const circle = (await createProfile({ name: 'Amber' }).expect(201)).body;

      await request(app)
        .put(`/api/circles/${circle.id}`)
        .set('Authorization', listener.auth)
        .field('origin', 'Nowhere')
        .expect(403);

      await request(app)
        .delete(`/api/circles/${circle.id}`)
        .set('Authorization', listener.auth)
        .expect(403);
    });
  });
});
