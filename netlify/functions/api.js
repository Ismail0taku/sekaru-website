const serverless = require('serverless-http');
const path = require('path');
const fs = require('fs');

// Netlify: use /tmp for writable storage
process.env.DB_PATH = '/tmp/sekaru.db';
process.env.UPLOAD_DIR = '/tmp/uploads';

if (!fs.existsSync('/tmp/uploads')) fs.mkdirSync('/tmp/uploads', { recursive: true });

const { initDB } = require('../../database');
const { app } = require('../../app');

let _ready = false;

exports.handler = async (event, context) => {
  if (!_ready) { await initDB(); _ready = true; }
  return serverless(app)(event, context);
};
