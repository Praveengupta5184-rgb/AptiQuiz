const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function migrate() {
    console.log('Running migrations...');
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Create migrations table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        const migrationsDir = path.join(__dirname, '../db/migrations');
        const files = fs.readdirSync(migrationsDir).sort();
        
        for (const file of files) {
            if (file.endsWith('.sql')) {
                const version = file.replace('.sql', '');
                
                const { rows } = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [version]);
                
                if (rows.length === 0) {
                    console.log(`Applying migration: ${file}`);
                    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
                    await client.query(sql);
                    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
                } else {
                    console.log(`Skipping applied migration: ${file}`);
                }
            }
        }
        
        await client.query('COMMIT');
        console.log('Migrations completed successfully.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
