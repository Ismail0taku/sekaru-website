const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_PATH = process.env.DB_PATH || path.join(os.tmpdir(), 'sekaru.db');
let db = null;
let _savePromise = Promise.resolve();

async function initDB() {
  const SQL = await initSqlJs();
  if (process.env.NETLIFY) {
    try {
      const { getStore } = require('@netlify/blobs');
      const store = getStore('sekaru-data');
      const blobData = await store.get('database', { type: 'arrayBuffer' });
      if (blobData) {
        db = new SQL.Database(Buffer.from(blobData));
        createTables();
        return db;
      }
    } catch (e) { console.error('Blob load failed:', e.message); }
    db = new SQL.Database();
    db.run('PRAGMA journal_mode=WAL');
    db.run('PRAGMA foreign_keys=ON');
    createTables();
    seedData();
    saveDB();
    return db;
  }
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');
  createTables();
  seedData();
  saveDB();
  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buf = Buffer.from(data);
  if (process.env.NETLIFY) {
    _savePromise = _savePromise.then(() => {
      const { getStore } = require('@netlify/blobs');
      return getStore('sekaru-data').set('database', buf);
    }).catch(err => console.error('Blob save failed:', err.message));
  } else {
    fs.writeFileSync(DB_PATH, buf);
  }
}
async function saveDBAsync() {
  if (!db) return;
  const data = db.export();
  const buf = Buffer.from(data);
  if (process.env.NETLIFY) {
    const saveOp = _savePromise.then(() => {
      const { getStore } = require('@netlify/blobs');
      return getStore('sekaru-data').set('database', buf);
    }).catch(err => console.error('Blob save failed:', err.message));
    _savePromise = saveOp;
    await saveOp;
  } else {
    fs.writeFileSync(DB_PATH, buf);
  }
}

async function waitForPendingSaves() {
  await _savePromise;
}

function createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE, nickname TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, phone TEXT DEFAULT '', guild_id TEXT DEFAULT '',
    coins INTEGER DEFAULT 100, inventory TEXT DEFAULT '[]',
    rank_id TEXT DEFAULT 'r_member', avatar TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS guilds (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT '🛡️',
    accent TEXT DEFAULT '#C2541F', description TEXT DEFAULT '', wa_link TEXT DEFAULT '',
    image TEXT DEFAULT '', bank INTEGER DEFAULT 0
  )`);
  try{db.run('ALTER TABLE guilds ADD COLUMN image TEXT DEFAULT \'\'')}catch(e){}
  try{db.run('ALTER TABLE guilds ADD COLUMN bank INTEGER DEFAULT 0')}catch(e){}
  db.run(`CREATE TABLE IF NOT EXISTS shop_items (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT '🎁',
    description TEXT DEFAULT '', price INTEGER DEFAULT 10
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS ranks (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT '🎖️', perms TEXT DEFAULT '{}'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hierarchy (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, name TEXT DEFAULT '—',
    description TEXT DEFAULT '', icon TEXT DEFAULT '⚜️', color TEXT DEFAULT '#F4C95D',
    image TEXT DEFAULT '', sort_order INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, month TEXT NOT NULL,
    title TEXT NOT NULL, description TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS text_edits (key TEXT PRIMARY KEY, value TEXT DEFAULT '')`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT DEFAULT '')`);
}

function seedData() {
  const gc = db.exec('SELECT COUNT(*) as c FROM guilds');
  if (!gc[0]?.values[0][0]) {
    const s = db.prepare('INSERT INTO guilds (id,name,icon,accent,description,wa_link) VALUES (?,?,?,?,?,?)');
    [['a','نقابة الأنمي','🎴','#C2541F','مناقشات الحلقات الجديدة والترشيحات الأسبوعية',''],
     ['m','نقابة المانجا','📖','#F4C95D','تتبّع الفصول الجديدة ونقاشات الحبكة',''],
     ['s','نقابة الرياضة','⚽','#8B5A2B','متابعة المباريات وتحديات التوقع',''],
     ['g','نقابة الألعاب','🎮','#C2541F','فرق منافسات وبطولات داخلية','']].forEach(r => s.run(r));
    s.free();
  }
  const rc = db.exec('SELECT COUNT(*) as c FROM ranks');
  if (!rc[0]?.values[0][0]) {
    const s = db.prepare('INSERT INTO ranks (id,name,icon,perms) VALUES (?,?,?,?)');
    [['r_founder','مؤسس','👑',JSON.stringify({admin_access:true,manage_ranks:true,manage_members:true,manage_guilds:true,manage_shop:true,manage_bank:true,manage_logo:true,edit_mode:true,manage_hierarchy:true})],
     ['r_admin','إدارة عليا','⚜️',JSON.stringify({admin_access:true,manage_members:true,manage_shop:true,manage_bank:true,edit_mode:true})],
     ['r_member','عضو','👤','{}']].forEach(r => s.run(r));
    s.free();
  }
  const ec = db.exec('SELECT COUNT(*) as c FROM events');
  if (!ec[0]?.values[0][0]) {
    const s = db.prepare('INSERT INTO events (day,month,title,description) VALUES (?,?,?,?)');
    [['15','يوليو','بطولة الأنمي','مشاهدة جماعية'],
     ['22','يوليو','ليلة الألعاب','بطولة أونلاين'],
     ['5','أغسطس','لقاء الرياضة','مناقشة الأحداث']].forEach(e => s.run(e));
    s.free();
  }
  const hc = db.exec('SELECT COUNT(*) as c FROM hierarchy');
  if (!hc[0]?.values[0][0]) {
    const s = db.prepare('INSERT INTO hierarchy (title,name,description,icon,color,sort_order) VALUES (?,?,?,?,?,?)');
    [['لورد المملكة','—','المؤسس والقائد الأعلى','👑','#F4C95D',0],
     ['نائب اللورد','—','المسؤول عن النقابات','⚜️','#D9A83E',1],
     ['مستشار المملكة','—','المستشار الاستراتيجي','📜','#C2541F',2],
     ['جنرال الإدارة العليا','—','يدير العمليات اليومية','⚔️','#8B5A2B',3]].forEach(h => s.run(h));
    s.free();
  }
  const sc = db.exec('SELECT COUNT(*) as c FROM shop_items');
  if (!sc[0]?.values[0][0]) {
    const s = db.prepare('INSERT INTO shop_items (id,name,icon,description,price) VALUES (?,?,?,?,?)');
    [['sh1','وسام ذهبي','🏅','وسام يظهر بجانب اسمك',50],
     ['sh2','تاج المملكة','👑','تاج ملكي لصفحة حسابك',120],
     ['sh3','خلفية خاصة','🖼️','خلفية لصفحتك',80],
     ['sh4','لقب مميز','✨','لقب تحت اسمك',200],
     ['sh5','رتبة نجم','⭐','نجمة بجانب اسمك',150]].forEach(i => s.run(i));
    s.free();
  }
  const fc = db.exec("SELECT COUNT(*) as c FROM users WHERE nickname='ياتو'");
  if (!fc[0]?.values[0][0]) {
    db.run("INSERT INTO users (id,nickname,password_hash,rank_id) VALUES ('founder','ياتو','$2a$10$dummy','r_founder')");
    saveDB();
  }
}

// ===== QUERY HELPERS =====
function run(sql, params) {
  if (params) db.run(sql, params);
  else db.run(sql);
}

function all(sql, params) {
  if (params && params.length) {
    const s = db.prepare(sql);
    s.bind(params);
    const rows = [];
    while (s.step()) rows.push(s.getAsObject());
    s.free();
    return rows;
  }
  const r = db.exec(sql);
  if (!r.length) return [];
  const cols = r[0].columns;
  return r[0].values.map(v => { const o = {}; cols.forEach((c, i) => o[c] = v[i]); return o; });
}

function one(sql, params) {
  const rows = all(sql, params);
  return rows.length ? rows[0] : null;
}

function getDB() { return db; }

module.exports = { initDB, saveDB, saveDBAsync, getDB, run, all, one, waitForPendingSaves };
