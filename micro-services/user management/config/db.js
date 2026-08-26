const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: {
    rejectUnauthorized: false,
  },

  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

const pool = new Pool(dbConfig);

pool.connect((error, client, release) => {
  if (error) {
    console.error('Error acquiring client', error.stack);
    return;
  }
    console.log('Database connected successfully');
    release();
});

module.exports = pool;