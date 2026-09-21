import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

// Point uploads at a throwaway directory BEFORE anything imports the storage
// module, so tests never write into the real uploads/ folder.
const TEST_UPLOAD_DIR = path.join(
  os.tmpdir(),
  `gensou-hub-test-${crypto.randomBytes(6).toString('hex')}`
);
process.env.UPLOAD_DIR = TEST_UPLOAD_DIR;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoose = (await import('mongoose')).default;
const { ensureUploadDirs, UPLOAD_ROOT } = await import('../src/config/storage.js');
const app = (await import('../src/app.js')).default;
const User = (await import('../src/models/User.js')).default;
const { signToken } = await import('../src/utils/token.js');

let mongod;

export { app, mongoose, UPLOAD_ROOT, User };

export async function startTestEnv() {
  await ensureUploadDirs();
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function stopTestEnv() {
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(UPLOAD_ROOT, { recursive: true, force: true });
}

export async function clearDatabase() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

/** A tiny but structurally valid-enough MP3 payload for upload tests. */
export function fakeMp3(sizeInBytes = 2048) {
  const buffer = Buffer.alloc(sizeInBytes, 0);
  buffer.write('ID3', 0, 'ascii'); // MP3 tag header
  return buffer;
}

/** A minimal valid 1x1 PNG. */
export function fakePng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
}

/**
 * Read the entry names out of a zip by walking its local file headers. Enough
 * to prove the archive is well formed without pulling in an unzip library.
 */
export function zipEntryNames(buffer) {
  const names = [];

  for (let i = 0; i + 30 <= buffer.length; i += 1) {
    if (buffer.readUInt32LE(i) !== 0x04034b50) continue; // local file header

    const nameLength = buffer.readUInt16LE(i + 26);
    const extraLength = buffer.readUInt16LE(i + 28);
    names.push(buffer.toString('utf8', i + 30, i + 30 + nameLength));
    i += 29 + nameLength + extraLength;
  }

  return names;
}

/** supertest has no binary body parser of its own. */
export function bufferResponse(request) {
  return request.buffer().parse((response, callback) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => callback(null, Buffer.concat(chunks)));
  });
}

let userCounter = 0;

/**
 * Create an account straight through the model and return a ready-to-use
 * Authorization header. Admins cannot be made through the API by design.
 */
export async function makeUser({ role = 'user', password = 'password123', ...rest } = {}) {
  userCounter += 1;
  const user = await User.create({
    name: rest.name ?? `Test ${role} ${userCounter}`,
    email: rest.email ?? `${role}${userCounter}@example.com`,
    password,
    role,
  });

  const token = signToken(user);
  return { user, token, password, auth: `Bearer ${token}` };
}

export const makeAdmin = (options) => makeUser({ ...options, role: 'admin' });
