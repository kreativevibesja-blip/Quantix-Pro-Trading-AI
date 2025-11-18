const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { usingSupabase, registerOrLoginUser, ensureWorkspaceForUser } = require('./data');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
// Local SQLite connection for fallback path only
const db = new Database('./caribchat.db');

function ensureDefaultWorkspaceSQLite(userId, email){
  const slug = email.split('@')[0].replace(/[^a-z0-9]+/gi,'-').toLowerCase();
  let ws = db.prepare('SELECT * FROM workspaces WHERE owner_user_id = ? LIMIT 1').get(userId);
  if (!ws) {
    const info = db.prepare('INSERT INTO workspaces (slug,name,owner_user_id) VALUES (?,?,?)').run(slug, slug, userId);
    ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(info.lastInsertRowid);
  }
  return ws;
}

async function registerOrLogin(email, password){
  if (usingSupabase()) {
    // Supabase path: get or create user, verify password, ensure workspace
    const supaUserRows = db.prepare('SELECT 1').get; // placeholder to avoid lint (not used)
    // Fetch user
    const existingUserRes = await registerOrLoginUser(email, null); // This will throw for SQLite path
    // If user existed we need to verify password; if it was just created we need to set password hash.
    // Because registerOrLoginUser currently auto-creates with provided hash only, we adapt here:
    // Step 1: check if user exists separately (light extra query)
    // Workaround: extend registerOrLoginUser API – but for now replicate logic.
    // Re-implement lightweight logic using Supabase client directly for password flow:
    const { getSupabase } = require('./supabase');
    const supa = getSupabase();
    const sel = await supa.from('users').select('*').eq('email', email).limit(1);
    if (sel.error) throw sel.error;
    let user;
    if (sel.data.length) {
      user = sel.data[0];
      const ok = await bcrypt.compare(password, user.password_hash || '');
      if (!ok) throw new Error('Invalid credentials');
    } else {
      const hash = await bcrypt.hash(password, 10);
      const ins = await supa.from('users').insert({ email, password_hash: hash }).select();
      if (ins.error) throw ins.error;
      user = ins.data[0];
    }
    const ws = await ensureWorkspaceForUser(user);
    return { user, workspace: ws };
  }
  // SQLite fallback
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!existing) {
    const hash = await bcrypt.hash(password, 10);
    const info = db.prepare('INSERT INTO users (email,password_hash) VALUES (?,?)').run(email, hash);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    const ws = ensureDefaultWorkspaceSQLite(user.id, email);
    return { user, workspace: ws };
  } else {
    const ok = await bcrypt.compare(password, existing.password_hash || '');
    if (!ok) throw new Error('Invalid credentials');
    const ws = ensureDefaultWorkspaceSQLite(existing.id, email);
    return { user: existing, workspace: ws };
  }
}

function signToken(user, workspace){
  const payload = { sub: user.id, email: user.email, ws: { id: workspace.id, slug: workspace.slug, name: workspace.name } };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next){
  const hdr = req.headers['authorization'] || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.sub, email: decoded.email };
    req.workspace = decoded.ws;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

module.exports = { registerOrLogin, signToken, authMiddleware };
