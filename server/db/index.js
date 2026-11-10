const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Attempt to load .env from current directory or parent directory if present
if (fs.existsSync(path.resolve(__dirname, '../.env'))) {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} else if (fs.existsSync(path.resolve(__dirname, '../../.env'))) {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} else {
    require('dotenv').config();
}

const isTest = process.env.NODE_ENV === 'test';
const connectionString = isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

// Detect SSL requirement for Neon PostgreSQL or cloud production database
const isProduction = process.env.NODE_ENV === 'production';
const requiresSsl = Boolean(
    connectionString && (
        connectionString.includes('neon.tech') ||
        connectionString.includes('sslmode=require') ||
        connectionString.includes('ssl=true') ||
        (isProduction && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1'))
    )
);

const pool = new Pool({
    connectionString,
    ssl: requiresSsl ? { rejectUnauthorized: false } : false,
    max: process.env.PG_MAX_POOL ? parseInt(process.env.PG_MAX_POOL, 10) : 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Do not crash the entire server process on idle client disconnects (common in Neon serverless compute)
pool.on('error', (err) => {
    console.error('PostgreSQL pool idle client warning/error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
