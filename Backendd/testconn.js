const { Pool } = require('pg');
require('dotenv').config();

console.log('Mencoba konek dengan config:');
console.log('HOST:', process.env.DB_HOST);
console.log('PORT:', process.env.DB_PORT);
console.log('DB  :', process.env.DB_NAME);
console.log('USER:', process.env.DB_USER);
console.log('PASS:', process.env.DB_PASSWORD ? '(ada)' : '(kosong!)');
console.log('---');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('ERROR CODE   :', err.code);
    console.error('ERROR MESSAGE:', err.message);
    console.error('ERROR DETAIL :', err.detail || '-');
  } else {
    console.log('✅ Berhasil konek!');
    release();
  }
  process.exit();
});