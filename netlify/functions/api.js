const serverless = require('serverless-http');
const path = require('path');
const fs = require('fs');

const TMP = '/tmp';
const DB_PATH = path.join(TMP, 'sekaru.db');
const UPLOAD_DIR = path.join(TMP, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

process.env.DB_PATH = DB_PATH;
process.env.UPLOAD_DIR = UPLOAD_DIR;

// Get db + app at module load
const { initDB } = require('../../database');
const { app } = require('../../app');

let _handler;
async function getHandler() {
  if (!_handler) {
    await initDB();
    _handler = serverless(app);
  }
  return _handler;
}

exports.handler = async (event, context) => {
  try {
    const h = await getHandler();
    return await h(event, context);
  } catch (e) {
    console.error('SEKARU FN ERROR:', e.message, e.stack);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
