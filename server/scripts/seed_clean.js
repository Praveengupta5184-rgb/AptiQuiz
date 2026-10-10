const { pool } = require('../db');

async function seedClean() {
    console.log('Running CLEAN seed (Live Mode)...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        
        // Clear all data
        await client.query('TRUNCATE questions, question_sets, colleges, seasons CASCADE');
        
        // Seed college only
        await client.query("INSERT INTO colleges (name) VALUES ('Live Engineering College')");
        
        await client.query('COMMIT');
        console.log(`Clean DB seeded successfully. Ready for LIVE test.`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Clean seed failed:', e);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seedClean();
