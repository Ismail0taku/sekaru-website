const serverless = require('serverless-http');
const path = require('path');
const fs = require('fs');

const TMP = '/tmp';
const DB_PATH = path.join(TMP, 'sekaru.db');
const UPLOAD_DIR = path.join(TMP, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const seedDb = path.join(__dirname, '../..', 'server', 'sekaru.db');
if (!fs.existsSync(DB_PATH) && fs.existsSync(seedDb)) {
  fs.copyFileSync(seedDb, DB_PATH);
}

process.env.DB_PATH = DB_PATH;
process.env.UPLOAD_DIR = UPLOAD_DIR;

let handler;

exports.handler = async (event, context) => {
  if (!handler) {
    const { initDB } = require(path.join(__dirname, '../..', 'server', 'database'));
    await initDB();
    const { app } = require(path.join(__dirname, '../..', 'server', 'app'));
    handler = serverless(app);
  }
  return handler(event, context);
};
