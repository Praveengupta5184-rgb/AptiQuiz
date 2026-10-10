const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' }); // Load from root

const isTest = process.env.NODE_ENV === 'test';
const connectionString = isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
