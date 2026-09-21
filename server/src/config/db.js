import mongoose from 'mongoose';

/**
 * Connect once per process, not once per call.
 *
 * A long-running server calls this at boot and never again. A serverless
 * function calls it on every request, but the process is reused between
 * requests, so the promise is cached on the module: the first request through a
 * cold function pays for the handshake and the rest join the connection it
 * opened. Caching the *promise* rather than the connection matters, because
 * several requests can arrive before the first one has finished connecting.
 */
let connection = null;

export async function connectDB() {
  if (connection) return connection;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set. Copy .env.example to .env');

  mongoose.connection.on('connected', () => console.log('MongoDB connected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));

  connection = mongoose.connect(uri, {
    // A function that is about to be frozen should not sit waiting on a socket
    // that is never going to answer; fail fast and let the request 500.
    serverSelectionTimeoutMS: 10000,
  });

  try {
    return await connection;
  } catch (err) {
    // Let the next request try again rather than caching the failure forever.
    connection = null;
    throw err;
  }
}
