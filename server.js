const { initDB } = require('./database');
const { app } = require('./app');

const PORT = process.env.PORT || 3001;

(async () => {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => console.log('SEKARU server on port ' + PORT));
})();
