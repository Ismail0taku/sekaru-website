const { initDB } = require('./database');
const { app } = require('./app');

const PORT = process.env.PORT || 3001;

(async () => {
  await initDB();
  app.listen(PORT, () => console.log('SEKARU server on http://localhost:' + PORT));
})();
