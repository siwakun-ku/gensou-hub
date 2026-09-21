import User from '../models/User.js';
import { signToken } from '../utils/token.js';

function duplicateEmail() {
  return Object.assign(new Error('That email is already registered'), { status: 409 });
}

// POST /api/auth/register
export async function register(req, res) {
  const { name, email, password } = req.body;

  // Checked up front so the response is a clean 409 even before the unique
  // index exists; the 11000 catch below still covers the race.
  if (email && (await User.findOne({ email: String(email).toLowerCase() }))) {
    throw duplicateEmail();
  }

  // Role is deliberately not read from the body: nobody can register as admin.
  let user;
  try {
    user = await User.create({ name, email, password });
  } catch (err) {
    if (err.code === 11000) throw duplicateEmail();
    throw err;
  }

  res.status(201).json({ token: signToken(user), user: user.toPublic() });
}

// POST /api/auth/login
export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    throw Object.assign(new Error('Email and password are required'), { status: 400 });
  }

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');

  // One message for both cases, so the response cannot be used to discover
  // which emails have accounts.
  const invalid = Object.assign(new Error('Invalid email or password'), { status: 401 });
  if (!user) throw invalid;
  if (!(await user.comparePassword(password))) throw invalid;

  res.json({ token: signToken(user), user: user.toPublic() });
}

// GET /api/auth/me
export async function getMe(req, res) {
  res.json(req.user.toPublic());
}
