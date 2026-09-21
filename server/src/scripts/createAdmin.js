/**
 * Creates (or promotes) an admin account. There is no way to become an admin
 * through the API, so the first one has to be made here.
 *
 *   npm run create:admin -- "Admin Name" admin@example.com "password123"
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';

const [name, email, password] = process.argv.slice(2);

if (!name || !email || !password) {
  console.error('Usage: npm run create:admin -- "<name>" <email> "<password>"');
  process.exit(1);
}

try {
  await connectDB();

  const existing = await User.findOne({ email: email.toLowerCase() });

  if (existing) {
    existing.role = 'admin';
    existing.name = name;
    existing.password = password; // re-hashed by the pre-save hook
    await existing.save();
    console.log(`Promoted existing account to admin: ${existing.email}`);
  } else {
    const user = await User.create({ name, email, password, role: 'admin' });
    console.log(`Created admin: ${user.email}`);
  }
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
