require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { initDB, saveDB, run, all, one } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'sekaru-dev-secret';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'sekaro2026';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!require('fs').existsSync(UPLOAD_DIR)) require('fs').mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, 'av_' + uuidv4().slice(0,8) + path.extname(file.originalname) || '.jpg')
});
const upload = multer({
  storage, limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /jpeg|jpg|png|gif|webp/i.test(path.extname(file.originalname)))
});

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
}
function optionalAuth(req, res, next) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) try { req.user = jwt.verify(h.slice(7), JWT_SECRET); } catch {}
  next();
}

// ===== HEALTH =====
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ===== AUTH =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, nickname, password, phone, guildId } = req.body;
    if (!email || !nickname || !password) return res.status(400).json({ error: 'Email, nickname, password required' });
    if (password.length < 4) return res.status(400).json({ error: 'Password too short' });
    const existing = one('SELECT id FROM users WHERE email=? OR nickname=?', [email, nickname]);
    if (existing) return res.status(409).json({ error: 'Email or nickname taken' });
    const hash = await bcrypt.hash(password, 10);
    const id = 'u_' + uuidv4().slice(0, 8);
    run('INSERT INTO users (id,email,nickname,password_hash,phone,guild_id,rank_id) VALUES (?,?,?,?,?,?,?)',
      [id, email, nickname, hash, phone || '', guildId || '', 'r_member']);
    saveDB();
    const token = jwt.sign({ id, nickname, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id, nickname, email, phone: phone || '', guildId: guildId || '', coins: 100, inventory: [], rankId: 'r_member', avatar: '' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = one('SELECT * FROM users WHERE email=?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, nickname: user.nickname, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    delete user.password_hash;
    try { user.inventory = JSON.parse(user.inventory); } catch { user.inventory = []; }
    res.json({ token, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = one('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  delete user.password_hash;
  try { user.inventory = JSON.parse(user.inventory); } catch { user.inventory = []; }
  res.json(user);
});

app.post('/api/auth/master', (req, res) => {
  if (req.body.password !== MASTER_PASSWORD) return res.status(401).json({ error: 'Wrong master password' });
  const token = jwt.sign({ id: 'master', nickname: 'Master', role: 'master' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, master: true });
});

// ===== MEMBERS =====
app.get('/api/members', optionalAuth, (req, res) => {
  const rows = all('SELECT id,nickname,phone,guild_id,coins,inventory,rank_id,avatar,email,created_at FROM users ORDER BY coins DESC');
  rows.forEach(r => { try { r.inventory = JSON.parse(r.inventory); } catch { r.inventory = []; } });
  res.json(rows);
});

app.put('/api/members/:id', auth, (req, res) => {
  const { coins, rankId, nickname, phone, guildId } = req.body;
  const sets = []; const binds = [];
  if (coins !== undefined) { sets.push('coins=?'); binds.push(coins); }
  if (rankId !== undefined) { sets.push('rank_id=?'); binds.push(rankId); }
  if (nickname !== undefined) { sets.push('nickname=?'); binds.push(nickname); }
  if (phone !== undefined) { sets.push('phone=?'); binds.push(phone); }
  if (guildId !== undefined) { sets.push('guild_id=?'); binds.push(guildId); }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  binds.push(req.params.id);
  run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, binds);
  saveDB();
  res.json({ ok: true });
});

app.delete('/api/members/:id', auth, (req, res) => {
  run('DELETE FROM users WHERE id=?', [req.params.id]);
  saveDB();
  res.json({ ok: true });
});

// ===== AVATAR =====
app.post('/api/upload/avatar', auth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = '/uploads/' + req.file.filename;
  run('UPDATE users SET avatar=? WHERE id=?', [url, req.user.id]);
  saveDB();
  res.json({ url });
});

// ===== GUILDS =====
app.get('/api/guilds', (req, res) => res.json(all('SELECT * FROM guilds')));
app.post('/api/guilds', auth, (req, res) => {
  const { name, icon, accent, description, wa_link } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = 'g_' + uuidv4().slice(0, 8);
  run('INSERT INTO guilds (id,name,icon,accent,description,wa_link) VALUES (?,?,?,?,?,?)',
    [id, name, icon||'🛡️', accent||'#C2541F', description||'', wa_link||'']);
  saveDB();
  res.json({ id });
});
app.put('/api/guilds/:id', auth, (req, res) => {
  const { name, icon, accent, description, wa_link } = req.body;
  const sets = []; const binds = [];
  if (name !== undefined) { sets.push('name=?'); binds.push(name); }
  if (icon !== undefined) { sets.push('icon=?'); binds.push(icon); }
  if (accent !== undefined) { sets.push('accent=?'); binds.push(accent); }
  if (description !== undefined) { sets.push('description=?'); binds.push(description); }
  if (wa_link !== undefined) { sets.push('wa_link=?'); binds.push(wa_link); }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  binds.push(req.params.id);
  run(`UPDATE guilds SET ${sets.join(',')} WHERE id=?`, binds);
  saveDB(); res.json({ ok: true });
});
app.delete('/api/guilds/:id', auth, (req, res) => {
  run('DELETE FROM guilds WHERE id=?', [req.params.id]);
  saveDB(); res.json({ ok: true });
});

// ===== RANKS =====
app.get('/api/ranks', (req, res) => {
  const rows = all('SELECT * FROM ranks');
  rows.forEach(r => { try { r.perms = JSON.parse(r.perms); } catch { r.perms = {}; } });
  res.json(rows);
});
app.post('/api/ranks', auth, (req, res) => {
  const { name, icon, perms } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = 'r_' + uuidv4().slice(0, 8);
  run('INSERT INTO ranks (id,name,icon,perms) VALUES (?,?,?,?)', [id, name, icon||'🎖️', JSON.stringify(perms||{})]);
  saveDB(); res.json({ id });
});
app.put('/api/ranks/:id', auth, (req, res) => {
  const { name, icon, perms } = req.body;
  const sets = []; const binds = [];
  if (name !== undefined) { sets.push('name=?'); binds.push(name); }
  if (icon !== undefined) { sets.push('icon=?'); binds.push(icon); }
  if (perms !== undefined) { sets.push('perms=?'); binds.push(JSON.stringify(perms)); }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  binds.push(req.params.id);
  run(`UPDATE ranks SET ${sets.join(',')} WHERE id=?`, binds);
  saveDB(); res.json({ ok: true });
});
app.delete('/api/ranks/:id', auth, (req, res) => {
  const cnt = one('SELECT COUNT(*) as c FROM ranks');
  if (cnt && cnt.c <= 1) return res.status(400).json({ error: 'Cannot delete last rank' });
  run('DELETE FROM ranks WHERE id=?', [req.params.id]);
  run("UPDATE users SET rank_id='r_member' WHERE rank_id=?", [req.params.id]);
  saveDB(); res.json({ ok: true });
});

// ===== SHOP =====
app.get('/api/shop', (req, res) => res.json(all('SELECT * FROM shop_items')));
app.post('/api/shop', auth, (req, res) => {
  const { name, icon, description, price } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = 'sh_' + uuidv4().slice(0, 8);
  run('INSERT INTO shop_items (id,name,icon,description,price) VALUES (?,?,?,?,?)',
    [id, name, icon||'🎁', description||'', Math.max(1, parseInt(price)||10)]);
  saveDB(); res.json({ id });
});
app.put('/api/shop/:id', auth, (req, res) => {
  const { name, icon, description, price } = req.body;
  const sets = []; const binds = [];
  if (name !== undefined) { sets.push('name=?'); binds.push(name); }
  if (icon !== undefined) { sets.push('icon=?'); binds.push(icon); }
  if (description !== undefined) { sets.push('description=?'); binds.push(description); }
  if (price !== undefined) { sets.push('price=?'); binds.push(Math.max(1, parseInt(price))); }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  binds.push(req.params.id);
  run(`UPDATE shop_items SET ${sets.join(',')} WHERE id=?`, binds);
  saveDB(); res.json({ ok: true });
});
app.delete('/api/shop/:id', auth, (req, res) => {
  run('DELETE FROM shop_items WHERE id=?', [req.params.id]);
  saveDB(); res.json({ ok: true });
});

// ===== BANK =====
app.post('/api/bank/add-guild', auth, (req, res) => {
  const { guildId, amount } = req.body;
  if (!guildId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid' });
  run('UPDATE users SET coins=coins+? WHERE guild_id=?', [amount, guildId]);
  saveDB(); res.json({ ok: true });
});

// ===== HIERARCHY =====
app.get('/api/hierarchy', (req, res) => res.json(all('SELECT * FROM hierarchy ORDER BY sort_order ASC')));
app.post('/api/hierarchy', auth, (req, res) => {
  const { title, name, description, icon, color } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const max = one('SELECT COALESCE(MAX(sort_order),-1) as m FROM hierarchy');
  const icons = ['⚜️','📜','🛡️','🔮','🏹']; const colors = ['#F4C95D','#C2541F','#8B5A2B','#D9A83E','#E8714A'];
  run('INSERT INTO hierarchy (title,name,description,icon,color,sort_order) VALUES (?,?,?,?,?,?)',
    [title, name||'—', description||'', icon||icons[0], color||colors[0], (max?.m||0)+1]);
  saveDB(); res.json({ ok: true });
});
app.put('/api/hierarchy/:id', auth, (req, res) => {
  const { title, name, description, icon, color, sort_order } = req.body;
  const sets = []; const binds = [];
  if (title !== undefined) { sets.push('title=?'); binds.push(title); }
  if (name !== undefined) { sets.push('name=?'); binds.push(name); }
  if (description !== undefined) { sets.push('description=?'); binds.push(description); }
  if (icon !== undefined) { sets.push('icon=?'); binds.push(icon); }
  if (color !== undefined) { sets.push('color=?'); binds.push(color); }
  if (sort_order !== undefined) { sets.push('sort_order=?'); binds.push(sort_order); }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  binds.push(req.params.id);
  run(`UPDATE hierarchy SET ${sets.join(',')} WHERE id=?`, binds);
  saveDB(); res.json({ ok: true });
});
app.delete('/api/hierarchy/:id', auth, (req, res) => {
  run('DELETE FROM hierarchy WHERE id=?', [req.params.id]);
  saveDB(); res.json({ ok: true });
});
app.post('/api/hierarchy/reorder', auth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  ids.forEach((id, idx) => run('UPDATE hierarchy SET sort_order=? WHERE id=?', [idx, id]));
  saveDB(); res.json({ ok: true });
});

// ===== EVENTS =====
app.get('/api/events', (req, res) => res.json(all('SELECT * FROM events')));
app.post('/api/events', auth, (req, res) => {
  const { day, month, title, description } = req.body;
  run('INSERT INTO events (day,month,title,description) VALUES (?,?,?,?)', [day, month, title, description||'']);
  saveDB(); res.json({ ok: true });
});
app.delete('/api/events/:id', auth, (req, res) => {
  run('DELETE FROM events WHERE id=?', [req.params.id]);
  saveDB(); res.json({ ok: true });
});

// ===== TEXT EDITS =====
app.get('/api/text-edits', (req, res) => {
  const rows = all('SELECT * FROM text_edits');
  const edits = {}; rows.forEach(r => edits[r.key] = r.value);
  res.json(edits);
});
app.put('/api/text-edits', auth, (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });
  const existing = one('SELECT key FROM text_edits WHERE key=?', [key]);
  if (existing) run('UPDATE text_edits SET value=? WHERE key=?', [value||'', key]);
  else run('INSERT INTO text_edits (key,value) VALUES (?,?)', [key, value||'']);
  saveDB(); res.json({ ok: true });
});

// ===== SETTINGS =====
app.get('/api/settings/:key', (req, res) => {
  const row = one('SELECT value FROM settings WHERE key=?', [req.params.key]);
  res.json({ value: row ? row.value : '' });
});
app.put('/api/settings/:key', auth, (req, res) => {
  const { value } = req.body;
  const existing = one('SELECT key FROM settings WHERE key=?', [req.params.key]);
  if (existing) run('UPDATE settings SET value=? WHERE key=?', [value||'', req.params.key]);
  else run('INSERT INTO settings (key,value) VALUES (?,?)', [req.params.key, value||'']);
  saveDB(); res.json({ ok: true });
});
app.post('/api/upload/logo', auth, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = '/uploads/' + req.file.filename;
  const existing = one("SELECT key FROM settings WHERE key='logo'");
  if (existing) run("UPDATE settings SET value=? WHERE key='logo'", [url]);
  else run("INSERT INTO settings (key,value) VALUES ('logo',?)", [url]);
  saveDB(); res.json({ url });
});

// ===== BUY ITEM =====
app.post('/api/shop/buy', auth, (req, res) => {
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ error: 'Item ID required' });
  const item = one('SELECT * FROM shop_items WHERE id=?', [itemId]);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const user = one('SELECT coins,inventory FROM users WHERE id=?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  let inv = []; try { inv = JSON.parse(user.inventory); } catch {}
  if (user.coins < item.price) return res.status(400).json({ error: 'Not enough coins' });
  if (inv.some(i => i.id === itemId)) return res.status(400).json({ error: 'Already owned' });
  inv.push({ id: itemId });
  run('UPDATE users SET coins=?, inventory=? WHERE id=?', [user.coins - item.price, JSON.stringify(inv), req.user.id]);
  saveDB(); res.json({ ok: true, coins: user.coins - item.price });
});

// ===== STATIC FILES =====
app.use(express.static(path.join(__dirname, 'frontend')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

(async () => {
  await initDB();
  app.listen(PORT, () => console.log(`SEKARU server on http://localhost:${PORT}`));
})();
