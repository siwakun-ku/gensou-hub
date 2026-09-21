import 'dotenv/config';
import os from 'node:os';
import app from './app.js';
import { connectDB } from './config/db.js';
import { ensureUploadDirs } from './config/storage.js';

const PORT = Number(process.env.PORT) || 5000;
// 0.0.0.0 listens on every interface, so other devices on the LAN can reach the
// API. Set HOST=127.0.0.1 to keep it on this machine only.
const HOST = process.env.HOST || '0.0.0.0';

/** Every LAN address this machine can be reached on. */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net.address);
}

try {
  await ensureUploadDirs();
  await connectDB();

  app.listen(PORT, HOST, () => {
    console.log(`API listening on http://localhost:${PORT}`);

    if (HOST === '0.0.0.0') {
      for (const address of lanAddresses()) {
        console.log(`            also on http://${address}:${PORT}`);
      }
    }
  });
} catch (err) {
  console.error('Failed to start server:', err.message);
  process.exit(1);
}
