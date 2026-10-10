const { pool } = require('../db');

const sampleQuestions = [
    {
        topic: 'quantitative',
        difficulty: 'easy',
        text: 'If a train 120 meters long passes a telegraph pole in 6 seconds, what is the speed of the train?',
        options: JSON.stringify(['72 km/hr', '60 km/hr', '54 km/hr', '48 km/hr']),
        correct_option_index: 0,
        explanation: 'Speed = Distance/Time = 120/6 = 20 m/s. 20 * (18/5) = 72 km/hr.',
    },
    {
        topic: 'logical',
        difficulty: 'medium',
        text: 'Look at this series: 2, 1, (1/2), (1/4), ... What number should come next?',
        options: JSON.stringify(['(1/3)', '(1/8)', '(2/8)', '(1/16)']),
        correct_option_index: 1,
        explanation: 'This is a simple alternating division sequence: each number is divided by 2 to arrive at the next.',
    },
    {
        topic: 'verbal',
        difficulty: 'hard',
        text: 'Choose the word which is most nearly OPPOSITE in meaning to the word ENIGMATIC.',
        options: JSON.stringify(['Mysterious', 'Straightforward', 'Ambiguous', 'Puzzling']),
        correct_option_index: 1,
        explanation: 'Enigmatic means difficult to interpret or understand; mysterious. Straightforward is the opposite.',
    },
    {
        topic: 'data interpretation',
        difficulty: 'medium',
        text: 'Based on the following table, what is the average sales across all regions?',
        options: JSON.stringify(['150', '200', '250', '300']),
        correct_option_index: 1,
        explanation: 'Average = (100 + 200 + 300) / 3 = 200.',
        table_data: JSON.stringify({
            headers: ["Region", "Sales"],
            rows: [["North", "100"], ["South", "200"], ["East", "300"]]
        })
    }
];

// Add enough questions to hit 40 for the sample. (Generating 36 more simple ones)
for (let i = 5; i <= 40; i++) {
    sampleQuestions.push({
        topic: ['quantitative', 'logical', 'verbal', 'data interpretation'][i % 4],
        difficulty: ['easy', 'medium', 'hard'][i % 3],
        text: `Sample Question ${i}: What is the answer?`,
        options: JSON.stringify(['Option A', 'Option B', 'Option C', 'Option D']),
        correct_option_index: i % 4,
        explanation: `Explanation for question ${i}.`,
    });
}

async function seed() {
    console.log('Running seed...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        
        // Clear existing
        await client.query('TRUNCATE questions, question_sets, colleges, seasons CASCADE');
        
        // Seed college
        const collegeRes = await client.query(
            "INSERT INTO colleges (name) VALUES ('Demo Engineering College') RETURNING id"
        );
        const collegeId = collegeRes.rows[0].id;
        
        // Seed Question Set
        const setRes = await client.query(
            "INSERT INTO question_sets (title, description) VALUES ('Placement Mock 1', 'Official sample questions') RETURNING id"
        );
        const setId = setRes.rows[0].id;
        
        // Seed Questions
        for (const q of sampleQuestions) {
            await client.query(`
                INSERT INTO questions (question_set_id, topic, difficulty, text, options, correct_option_index, explanation, table_data)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [setId, q.topic, q.difficulty, q.text, q.options, q.correct_option_index, q.explanation, q.table_data || null]);
        }

        await client.query('COMMIT');
        console.log(`Seeded 1 college, 1 question set, and 40 sample questions.`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Seed failed:', e);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
